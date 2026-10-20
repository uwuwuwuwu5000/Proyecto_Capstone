import { Injectable, signal } from '@angular/core';
import {
  CALIDAD_SALIDA,
  CONFIANZA_PERSONA,
  Caja,
  MAXIMO_PERSONAS,
  tamanoReducido,
  versionDeModelos,
  zonasADifuminar,
} from '@ciudad-alerta/comun';

import type * as TF from '@tensorflow/tfjs-core';
import type * as FaceDetection from '@tensorflow-models/face-detection';
import type * as CocoSsd from '@tensorflow-models/coco-ssd';

import { prepararTensorflow, resolverModulo } from './tensorflow';
import { CapturedPhoto } from './camera.service';
import { InfoPrivacidad } from '../../../models/report.model';

/**
 * Copias locales de los modelos, dentro de la app.
 *
 * Si existen, se usan en lugar de los servidores externos: la protección deja
 * de depender de la red y de la redirección de `tfhub.dev`, que es frágil
 * dentro de la WebView de Android. Se generan con
 * `node scripts/descargar-modelos-privacidad.mjs`.
 */
const MODELO_LOCAL_PERSONAS = 'assets/models/coco-ssd/model.json';
const MODELO_LOCAL_ROSTROS = 'assets/models/face-detection/model.json';

/*
 * Umbrales y geometría (qué zonas difuminar) están en `comun/src/privacidad`,
 * compartidos con el portal: los dos deben proteger igual. CONFIANZA_PERSONA
 * es bajo a propósito: difuminar algo que no era una persona cuesta poco;
 * publicar un rostro sin difuminar es justo lo que esta función debe evitar.
 * El detector de rostros con runtime tfjs aplica su propio umbral interno.
 */

export class PrivacidadError extends Error {
  constructor(override readonly message: string) {
    super(message);
    this.name = 'PrivacidadError';
  }
}

/**
 * Difumina rostros y personas en las fotografías antes de publicarlas.
 *
 * Usa dos modelos livianos que se ejecutan en el teléfono:
 *
 *  1. **MediaPipe Face Detection, variante "full"** (BlazeFace). Encuentra
 *     rostros hasta unos 5 metros de la cámara.
 *  2. **COCO-SSD, base `lite_mobilenet_v2`**, la más liviana. Encuentra
 *     personas completas. Cubre a quien aparece lejos, con un rostro demasiado
 *     pequeño para el primer modelo: de cada persona se difumina la zona de la
 *     cabeza.
 *
 * La imagen nunca sale del teléfono sin procesar: el difuminado ocurre antes
 * de la vista previa, así el usuario ve exactamente lo que se publicará.
 *
 * Los modelos y TensorFlow se cargan con import() dinámico, en un fragmento
 * aparte del paquete inicial, y solo la primera vez que alguien adjunta una
 * foto.
 */
@Injectable({ providedIn: 'root' })
export class PrivacidadService {
  readonly cargandoModelos = signal(false);

  /**
   * Detalle técnico del último fallo de carga, para mostrarlo en pantalla. En
   * el teléfono no hay consola a la vista; sin esto, diagnosticar exige
   * conectar el equipo y abrir chrome://inspect.
   */
  readonly ultimoErrorTecnico = signal<string | null>(null);

  private detectorRostros: FaceDetection.FaceDetector | null = null;
  private detectorPersonas: CocoSsd.ObjectDetection | null = null;
  private carga: Promise<void> | null = null;
  private tf: typeof TF | null = null;

  /**
   * Devuelve una copia de la foto con rostros y personas difuminados.
   *
   * Lanza `PrivacidadError` si los modelos no pudieron cargarse. En ese caso
   * la foto **no** debe publicarse: no hay forma de garantizar que no muestre
   * rostros. La interfaz ofrece reintentar o quitar la foto.
   */
  async anonimizar(foto: CapturedPhoto): Promise<CapturedPhoto> {
    await this.cargarModelos();

    /**
     * El detector de personas es el indispensable: encuentra a todos, cerca o
     * lejos, y de cada uno se difumina la cabeza. El de rostros afina el
     * resultado en primeros planos, pero su ausencia no deja a nadie sin
     * proteger. Antes se exigían los dos, y bastaba que fallara el de rostros
     * para bloquear todas las fotos.
     */
    if (!this.detectorPersonas) {
      throw new PrivacidadError(
        'No pudimos cargar la protección de privacidad. Revisa tu conexión e inténtalo de nuevo.',
      );
    }

    const lienzo = await this.aLienzo(foto.dataUrl);
    const contexto = lienzo.getContext('2d');

    if (!contexto) {
      throw new PrivacidadError('El dispositivo no pudo procesar la imagen.');
    }

    let rostros: Caja[];
    let personas: Caja[];

    try {
      [rostros, personas] = await this.conRespaldoCpu(() =>
        Promise.all([this.detectarRostros(lienzo), this.detectarPersonas(lienzo)]),
      );
    } catch (error) {
      console.error('Privacidad: falló el análisis de la imagen.', error);
      this.ultimoErrorTecnico.set(this.describir(error, false));
      throw new PrivacidadError('No se pudo analizar la imagen. Inténtalo de nuevo.');
    }

    // Rostros: elipse holgada que cubre también frente, cabello y mentón.
    // Personas: zona de la cabeza, salvo que ya contenga un rostro detectado.
    const zonas = zonasADifuminar(rostros, personas, lienzo);

    for (const rostro of zonas.rostros) {
      this.difuminar(contexto, lienzo, rostro, true);
    }

    for (const cabeza of zonas.cabezas) {
      this.difuminar(contexto, lienzo, cabeza, false);
    }

    const privacidad: InfoPrivacidad = {
      aplicada: true,
      rostros: rostros.length,
      personas: zonas.cabezas.length,
      // Registra qué detectores corrieron realmente en esta foto.
      version: versionDeModelos(this.detectorRostros !== null),
    };

    return this.exportar(lienzo, foto, privacidad);
  }

  /**
   * Carga TensorFlow y cada detector por separado.
   *
   * Cada modelo se carga de forma independiente y su fallo se registra con su
   * nombre en la consola, para poder diagnosticar con chrome://inspect cuál
   * falló y por qué. Un detector que falla se reintenta en la próxima foto;
   * uno que cargó no se vuelve a descargar.
   */
  private async cargarModelos(): Promise<void> {
    if (this.detectorRostros && this.detectorPersonas) {
      return;
    }

    if (!this.carga) {
      this.cargandoModelos.set(true);

      this.carga = (async () => {
        if (!this.tf) {
          try {
            this.tf = await prepararTensorflow();
          } catch (error) {
            console.error('Privacidad: no se pudo iniciar TensorFlow.', error);
            this.ultimoErrorTecnico.set(this.describir(error, false));
            return;
          }
        }

        await Promise.all([
          this.detectorPersonas ? Promise.resolve() : this.cargarDetectorPersonas(),
          this.detectorRostros ? Promise.resolve() : this.cargarDetectorRostros(),
        ]);
      })().finally(() => {
        this.carga = null;
        this.cargandoModelos.set(false);
      });
    }

    await this.carga;
  }

  private async cargarDetectorPersonas(): Promise<void> {
    let local = false;

    try {
      const cocoSsd = resolverModulo<typeof CocoSsd>(
        await import('@tensorflow-models/coco-ssd'),
        'load',
      );
      local = await this.existeLocal(MODELO_LOCAL_PERSONAS);

      const cargar = (desdeApp: boolean) =>
        // `load` ejecuta además una inferencia de calentamiento: es ahí donde
        // falla WebGL en las WebView problemáticas.
        this.conRespaldoCpu(() =>
          cocoSsd.load({
            base: 'lite_mobilenet_v2',
            ...(desdeApp ? { modelUrl: MODELO_LOCAL_PERSONAS } : {}),
          }),
        );

      this.detectorPersonas = await this.conRespaldoRemoto(local, cargar, 'personas');
      local = this.ultimaCargaLocal;

      this.ultimoErrorTecnico.set(null);
      console.info(
        `Privacidad: detector de personas listo (${local ? 'local' : 'remoto'}, ${this.tf?.getBackend()}).`,
      );
    } catch (error) {
      console.error('Privacidad: no se pudo cargar el detector de personas (COCO-SSD).', error);
      this.ultimoErrorTecnico.set(this.describir(error, local));
    }
  }

  /** Resumen legible del error, con el contexto que hace falta para diagnosticarlo. */
  private describir(error: unknown, local: boolean): string {
    const detalle =
      error instanceof Error ? `${error.name}: ${error.message}` : String(error);

    return [
      detalle,
      // Si había copia local y aun así falló, se intentaron ambas fuentes.
      `Modelo: ${local ? 'incluido en la app y luego servidor externo' : 'servidor externo'}`,
      `Backend: ${this.tf?.getBackend() ?? 'sin iniciar'}`,
      `Conexión: ${navigator.onLine ? 'sí' : 'no'}`,
    ].join(' · ');
  }

  private async cargarDetectorRostros(): Promise<void> {
    try {
      const faceDetection = resolverModulo<typeof FaceDetection>(
        await import('@tensorflow-models/face-detection'),
        'createDetector',
      );
      const local = await this.existeLocal(MODELO_LOCAL_ROSTROS);

      const cargar = (desdeApp: boolean) =>
        this.conRespaldoCpu(() =>
          faceDetection.createDetector(faceDetection.SupportedModels.MediaPipeFaceDetector, {
            // El runtime 'tfjs' reutiliza TensorFlow.js, ya presente para la
            // detección de duplicados. El runtime 'mediapipe' cargaría WASM
            // desde una CDN externa.
            runtime: 'tfjs',
            modelType: 'full',
            maxFaces: 30,
            ...(desdeApp ? { detectorModelUrl: MODELO_LOCAL_ROSTROS } : {}),
          }),
        );

      this.detectorRostros = await this.conRespaldoRemoto(local, cargar, 'rostros');

      console.info(`Privacidad: detector de rostros listo (${local ? 'local' : 'remoto'}).`);
    } catch (error) {
      // No es fatal: el detector de personas cubre también a quien está cerca.
      console.error('Privacidad: no se pudo cargar el detector de rostros (MediaPipe).', error);
    }
  }

  /** Si la última carga exitosa usó la copia incluida en la app. */
  private ultimaCargaLocal = false;

  /**
   * Intenta la copia incluida en la app y, si falla, el servidor externo.
   *
   * Una copia local dañada —pesos incompletos, archivos corrompidos al
   * copiarlos o al pasar por Git— no debe bloquear la protección: el servidor
   * externo sigue siendo una fuente válida. Antes, un modelo local defectuoso
   * dejaba la foto bloqueada aunque hubiera conexión.
   */
  private async conRespaldoRemoto<T>(
    hayLocal: boolean,
    cargar: (desdeApp: boolean) => Promise<T>,
    nombre: string,
  ): Promise<T> {
    if (hayLocal) {
      try {
        const resultado = await cargar(true);
        this.ultimaCargaLocal = true;
        return resultado;
      } catch (error) {
        console.warn(
          `Privacidad: la copia local del detector de ${nombre} está dañada; se usa el servidor externo.`,
          error,
        );
      }
    }

    const resultado = await cargar(false);
    this.ultimaCargaLocal = false;
    return resultado;
  }

  /** Comprueba si el modelo viene incluido en la app. */
  private async existeLocal(ruta: string): Promise<boolean> {
    try {
      const respuesta = await fetch(ruta, { cache: 'no-store' });

      if (!respuesta.ok) {
        return false;
      }

      // Un servidor de desarrollo puede devolver index.html con estado 200
      // para rutas inexistentes; se confirma que sea realmente un modelo.
      const contenido = (await respuesta.json()) as { weightsManifest?: unknown };
      return Array.isArray(contenido.weightsManifest);
    } catch {
      return false;
    }
  }

  private async usarCpu(tf: typeof TF): Promise<void> {
    await tf.setBackend('cpu');
    await tf.ready();
  }

  /** Ejecuta una carga y, si falla con WebGL, la repite en la CPU. */
  private async conRespaldoCpu<T>(cargar: () => Promise<T>): Promise<T> {
    try {
      return await cargar();
    } catch (error) {
      if (!this.tf || this.tf.getBackend() !== 'webgl') {
        throw error;
      }

      console.warn('Privacidad: la carga falló con WebGL; se reintenta en la CPU.', error);
      await this.usarCpu(this.tf);
      return cargar();
    }
  }

  private async detectarRostros(lienzo: HTMLCanvasElement): Promise<Caja[]> {
    if (!this.detectorRostros) {
      return [];
    }

    const rostros = await this.detectorRostros.estimateFaces(lienzo, {
      flipHorizontal: false,
    });

    return rostros.map(({ box }) => ({
      x: box.xMin,
      y: box.yMin,
      ancho: box.width,
      alto: box.height,
    }));
  }

  private async detectarPersonas(lienzo: HTMLCanvasElement): Promise<Caja[]> {
    const objetos = await this.detectorPersonas!.detect(lienzo, MAXIMO_PERSONAS, CONFIANZA_PERSONA);

    return objetos
      .filter((objeto) => objeto.class === 'person')
      .map(({ bbox: [x, y, ancho, alto] }) => ({ x, y, ancho, alto }));
  }

  /**
   * Difumina una zona reduciéndola a muy pocos píxeles y volviéndola a
   * ampliar con suavizado. A diferencia de un filtro de desenfoque, funciona
   * en cualquier WebView, y la información descartada al reducir no se puede
   * recuperar: el resultado es irreversible.
   */
  private difuminar(
    contexto: CanvasRenderingContext2D,
    lienzo: HTMLCanvasElement,
    zona: Caja,
    eliptica: boolean,
  ): void {
    if (zona.ancho < 2 || zona.alto < 2) {
      return;
    }

    // Unos 6 bloques a lo ancho, sin importar el tamaño del rostro.
    const { ancho: anchoReducido, alto: altoReducido } = tamanoReducido(zona);

    const reducido = document.createElement('canvas');
    reducido.width = anchoReducido;
    reducido.height = altoReducido;
    const ctxReducido = reducido.getContext('2d');

    if (!ctxReducido) {
      return;
    }

    ctxReducido.imageSmoothingEnabled = true;
    ctxReducido.drawImage(
      lienzo,
      zona.x, zona.y, zona.ancho, zona.alto,
      0, 0, anchoReducido, altoReducido,
    );

    contexto.save();

    if (eliptica) {
      contexto.beginPath();
      contexto.ellipse(
        zona.x + zona.ancho / 2,
        zona.y + zona.alto / 2,
        zona.ancho / 2,
        zona.alto / 2,
        0,
        0,
        Math.PI * 2,
      );
      contexto.clip();
    }

    contexto.imageSmoothingEnabled = true;
    contexto.imageSmoothingQuality = 'high';
    contexto.drawImage(
      reducido,
      0, 0, anchoReducido, altoReducido,
      zona.x, zona.y, zona.ancho, zona.alto,
    );

    contexto.restore();
  }

  private aLienzo(dataUrl: string): Promise<HTMLCanvasElement> {
    return new Promise((resolve, reject) => {
      const imagen = new Image();

      imagen.onload = () => {
        const lienzo = document.createElement('canvas');
        lienzo.width = imagen.width;
        lienzo.height = imagen.height;
        lienzo.getContext('2d')?.drawImage(imagen, 0, 0);
        resolve(lienzo);
      };

      imagen.onerror = () => reject(new PrivacidadError('No se pudo leer la imagen.'));
      imagen.src = dataUrl;
    });
  }

  private exportar(
    lienzo: HTMLCanvasElement,
    original: CapturedPhoto,
    privacidad: InfoPrivacidad,
  ): Promise<CapturedPhoto> {
    return new Promise((resolve, reject) => {
      const dataUrl = lienzo.toDataURL('image/jpeg', CALIDAD_SALIDA);

      lienzo.toBlob(
        (blob) => {
          if (!blob) {
            reject(new PrivacidadError('No se pudo generar la imagen protegida.'));
            return;
          }

          resolve({
            ...original,
            dataUrl,
            blob,
            mimeType: 'image/jpeg',
            sizeBytes: blob.size,
            privacidad,
          });
        },
        'image/jpeg',
        CALIDAD_SALIDA,
      );
    });
  }
}
