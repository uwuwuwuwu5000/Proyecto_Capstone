import { Injectable, signal } from '@angular/core';
/**
 * Se importan los submódulos concretos en vez del paquete paraguas
 * `@tensorflow/tfjs`. Ese incluye `tfjs-data`, que depende de `node-fetch` y
 * arrastra módulos exclusivos de Node (`buffer`, `stream`), imposibles de
 * empaquetar para el navegador. La app solo necesita el núcleo, el conversor
 * de modelos y los backends de ejecución.
 */
import * as tf from '@tensorflow/tfjs-core';
import '@tensorflow/tfjs-converter';
import '@tensorflow/tfjs-backend-webgl';
import '@tensorflow/tfjs-backend-cpu';
import * as mobilenet from '@tensorflow-models/mobilenet';

/**
 * Comparación visual de fotografías con MobileNet v2 sobre TensorFlow.js.
 *
 * El modelo es gratuito, se ejecuta en el dispositivo y no requiere API key ni
 * servidor. En vez de clasificar, se usa la penúltima capa de la red
 * (`infer(img, true)`) para obtener un vector de 1024 dimensiones que describe
 * la imagen. Dos fotos del mismo objeto producen vectores cercanos, y la
 * cercanía se mide con similitud coseno.
 *
 * Limitación conocida y asumida: el mismo problema urbano fotografiado desde
 * ángulos muy distintos puede dar una similitud baja. Por eso el resultado
 * pondera el puntaje de coincidencia, pero nunca decide por sí solo.
 */
@Injectable({ providedIn: 'root' })
export class ImageSimilarityService {
  /** Expuesto para mostrar "analizando imagen…" en la UI. */
  readonly cargandoModelo = signal(false);
  readonly modeloDisponible = signal<boolean | null>(null);

  private modelo: mobilenet.MobileNet | null = null;
  private cargaEnCurso: Promise<mobilenet.MobileNet | null> | null = null;

  /**
   * BUG 28 · Sin memoria de los fallos, cada intento volvía a descargar ~17 MB.
   * Con red inestable eso se repetía en cada fotografía. Se limitan los
   * reintentos y se espera un tiempo creciente entre ellos.
   */
  private intentosFallidos = 0;
  private proximoIntento = 0;
  private static readonly MAX_INTENTOS = 3;

  /**
   * Carga el modelo una sola vez. La primera llamada descarga ~17 MB, así que
   * conviene invocarla cuando el usuario ya tomó la fotografía y no al arrancar.
   */
  private async cargarModelo(): Promise<mobilenet.MobileNet | null> {
    if (this.modelo) {
      return this.modelo;
    }

    if (this.cargaEnCurso) {
      return this.cargaEnCurso;
    }

    if (this.intentosFallidos >= ImageSimilarityService.MAX_INTENTOS) {
      return null;
    }

    if (Date.now() < this.proximoIntento) {
      return null;
    }

    this.cargandoModelo.set(true);

    this.cargaEnCurso = (async () => {
      try {
        await this.prepararBackend();
        this.modelo = await mobilenet.load({ version: 2, alpha: 1.0 });
        this.intentosFallidos = 0;
        this.modeloDisponible.set(true);
        return this.modelo;
      } catch {
        // Sin conexión o WebGL no disponible: la detección sigue funcionando
        // solo con ubicación, categoría y tiempo.
        this.intentosFallidos += 1;
        this.proximoIntento = Date.now() + 30_000 * this.intentosFallidos;
        this.modeloDisponible.set(false);
        return null;
      } finally {
        this.cargandoModelo.set(false);
        this.cargaEnCurso = null;
      }
    })();

    return this.cargaEnCurso;
  }

  /**
   * WebGL es mucho más rápido, pero no está disponible en todas las WebView de
   * Android. Si falla, se cae al backend de CPU antes que renunciar al modelo.
   */
  private async prepararBackend(): Promise<void> {
    try {
      await tf.setBackend('webgl');
      await tf.ready();
    } catch {
      await tf.setBackend('cpu');
      await tf.ready();
    }
  }

  /**
   * Calcula el vector normalizado de una imagen. Devuelve null si el modelo no
   * está disponible, para que el resto del flujo continúe sin la señal visual.
   */
  async computeEmbedding(dataUrl: string): Promise<number[] | null> {
    const modelo = await this.cargarModelo();

    if (!modelo) {
      return null;
    }

    let imagen: HTMLImageElement;

    try {
      imagen = await this.cargarImagen(dataUrl);
    } catch {
      return null;
    }

    try {
      const tensor = modelo.infer(imagen, true) as tf.Tensor;
      // `data()` devuelve una unión de TypedArrays; el embedding siempre es
      // float32, así que se concreta el tipo para que Array.from dé number[].
      const datos = (await tensor.data()) as Float32Array;
      const valores: number[] = Array.from(datos);
      tensor.dispose();

      return this.normalizar(valores);
    } catch {
      return null;
    }
  }

  /**
   * Similitud coseno entre dos vectores ya normalizados: equivale al producto
   * punto y queda entre 0 y 1.
   */
  cosineSimilarity(a: number[] | null, b: number[] | null): number | null {
    if (!a || !b || a.length !== b.length || a.length === 0) {
      return null;
    }

    let producto = 0;

    for (let i = 0; i < a.length; i += 1) {
      producto += a[i] * b[i];
    }

    return Math.min(1, Math.max(0, producto));
  }

  /** Normaliza a longitud 1 y redondea, para no inflar el documento de Firestore. */
  private normalizar(valores: number[]): number[] {
    const magnitud = Math.sqrt(valores.reduce((suma, v) => suma + v * v, 0));

    if (magnitud === 0) {
      return valores;
    }

    return valores.map((v) => Number((v / magnitud).toFixed(4)));
  }

  private cargarImagen(dataUrl: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const imagen = new Image();
      imagen.crossOrigin = 'anonymous';
      imagen.onload = () => resolve(imagen);
      imagen.onerror = () => reject(new Error('No se pudo decodificar la imagen.'));
      imagen.src = dataUrl;
    });
  }
}
