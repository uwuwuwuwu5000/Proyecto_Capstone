import { Injectable, signal } from '@angular/core';

/**
 * Comparación visual de fotografías con MobileNet sobre TensorFlow.js.
 *
 * v2-A2 · TensorFlow se carga con `import()` dinámico dentro del método de
 * carga, no con imports de nivel superior. Con imports estáticos, el empaquetado
 * incluía en el chunk inicial la plataforma Node de tfjs-core —`node-fetch`,
 * `seedrandom`, `long`— aunque el usuario solo fuera a iniciar sesión. Ahora ese
 * código vive en un chunk aparte que se descarga la primera vez que alguien
 * adjunta una fotografía.
 *
 * Los tipos se importan como tipo puro: `import type` desaparece en compilación
 * y no arrastra el módulo al bundle.
 */
import type * as TF from '@tensorflow/tfjs-core';
import type * as MobileNet from '@tensorflow-models/mobilenet';

import { prepararTensorflow, resolverModulo } from './tensorflow';

@Injectable({ providedIn: 'root' })
export class ImageSimilarityService {
  /** Expuesto para mostrar "analizando imagen…" en la UI. */
  readonly cargandoModelo = signal(false);
  readonly modeloDisponible = signal<boolean | null>(null);

  private tf: typeof TF | null = null;
  private modelo: MobileNet.MobileNet | null = null;
  private cargaEnCurso: Promise<MobileNet.MobileNet | null> | null = null;

  /**
   * BUG 28 · Sin memoria de los fallos, cada intento volvía a descargar ~17 MB.
   * Con red inestable eso se repetía en cada fotografía.
   */
  private intentosFallidos = 0;
  private proximoIntento = 0;
  private static readonly MAX_INTENTOS = 3;

  /**
   * Carga el modelo una sola vez. La primera llamada descarga la librería y los
   * pesos, así que conviene invocarla cuando el usuario ya tomó la fotografía.
   */
  private async cargarModelo(): Promise<MobileNet.MobileNet | null> {
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
        const [tf, moduloMobilenet] = await Promise.all([
          prepararTensorflow(),
          import('@tensorflow-models/mobilenet'),
        ]);

        // Mismo problema de formato que los modelos de privacidad.
        const mobilenet = resolverModulo<typeof MobileNet>(moduloMobilenet, 'load');

        this.tf = tf;
        this.modelo = await mobilenet.load({ version: 2, alpha: 1.0 });
        this.intentosFallidos = 0;
        this.modeloDisponible.set(true);
        return this.modelo;
      } catch (error) {
        // Sin conexión o WebGL no disponible: la detección sigue funcionando
        // solo con ubicación, categoría y tiempo. Antes este error no se
        // registraba, y un fallo permanente pasaba inadvertido.
        console.error('Duplicados: no se pudo cargar MobileNet.', error);
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
      const tensor = modelo.infer(imagen, true) as TF.Tensor;
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
