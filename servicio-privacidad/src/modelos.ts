import { readFile } from 'node:fs/promises';
import { dirname, join, sep } from 'node:path';
import { createRequire } from 'node:module';

import * as tf from '@tensorflow/tfjs-core';
import '@tensorflow/tfjs-converter';
import '@tensorflow/tfjs-backend-cpu';
import '@tensorflow/tfjs-backend-wasm';
import { setWasmPaths } from '@tensorflow/tfjs-backend-wasm';
import * as cocoSsd from '@tensorflow-models/coco-ssd';
import * as faceDetection from '@tensorflow-models/face-detection';
import * as mobilenet from '@tensorflow-models/mobilenet';
import { CONFIANZA_PERSONA, Caja, MAXIMO_PERSONAS } from '@ciudad-alerta/comun';

/**
 * Los tres modelos que antes corrían en el teléfono, ahora en el servidor:
 *  - MediaPipe Face Detection «full» (rostros cercanos),
 *  - COCO-SSD lite_mobilenet_v2 (personas completas, también lejanas),
 *  - MobileNet v2 (vector de la foto para detectar reportes duplicados).
 *
 * Corren en TensorFlow.js con el backend WASM: no necesita binarios nativos ni
 * GPU, funciona igual en Render, en Docker y en cualquier computador.
 */

/** Imagen ya decodificada: RGB, 3 bytes por píxel. */
export interface ImagenRgb {
  datos: Uint8Array;
  ancho: number;
  alto: number;
}

export interface Detecciones {
  rostros: Caja[];
  personas: Caja[];
}

export interface Modelos {
  /** true si el detector de rostros cargó (sin él solo se difuminan cabezas de personas). */
  readonly conRostros: boolean;
  readonly conSimilitud: boolean;
  readonly backend: string;
  detectar(imagen: ImagenRgb): Promise<Detecciones>;
  /** Vector normalizado de 1280 valores (4 decimales), o null sin MobileNet. */
  vector(imagen: ImagenRgb): Promise<number[] | null>;
}

/**
 * Permite cargar modelos desde el disco con `file://…/model.json`: TensorFlow.js
 * sin tfjs-node solo sabe descargarlos por HTTP.
 */
function registrarLecturaDeArchivos(): void {
  const router = (url: string | string[]): tf.io.IOHandler | null => {
    const ruta = typeof url === 'string' && url.startsWith('file://') ? url.slice('file://'.length) : null;
    if (!ruta) return null;

    return {
      async load() {
        const json = JSON.parse(await readFile(ruta, 'utf8')) as tf.io.ModelJSON;
        const carpeta = dirname(ruta);
        const especificaciones: tf.io.WeightsManifestEntry[] = [];
        const partes: ArrayBuffer[] = [];

        for (const grupo of json.weightsManifest) {
          especificaciones.push(...grupo.weights);
          for (const archivo of grupo.paths) {
            const contenido = await readFile(join(carpeta, archivo));
            partes.push(contenido.buffer.slice(contenido.byteOffset, contenido.byteOffset + contenido.byteLength) as ArrayBuffer);
          }
        }

        return tf.io.getModelArtifactsForJSON(json, async () => [especificaciones, tf.io.concatenateArrayBuffers(partes)]);
      },
    };
  };
  // El tipo de TensorFlow no admite null, pero el enrutador sí: null = "no es mío".
  tf.io.registerLoadRouter(router as Parameters<typeof tf.io.registerLoadRouter>[0]);
}

async function prepararBackend(): Promise<string> {
  try {
    const require = createRequire(import.meta.url);
    const archivoWasm = require.resolve('@tensorflow/tfjs-backend-wasm');
    // Ruta del sistema con su separador final (en Windows, «\»).
    setWasmPaths(dirname(archivoWasm) + sep);
    await tf.setBackend('wasm');
    await tf.ready();
  } catch (error) {
    console.warn('WASM no disponible; se usa la CPU (más lento).', error);
    await tf.setBackend('cpu');
    await tf.ready();
  }
  return tf.getBackend();
}

function aTensor(imagen: ImagenRgb): tf.Tensor3D {
  return tf.tensor3d(imagen.datos, [imagen.alto, imagen.ancho, 3], 'int32');
}

/** Igual que hacía la app: longitud 1 y 4 decimales, para no inflar el documento. */
export function normalizarVector(valores: ArrayLike<number>): number[] {
  const lista = Array.from(valores);
  const magnitud = Math.sqrt(lista.reduce((suma, v) => suma + v * v, 0));
  return magnitud === 0 ? lista : lista.map((v) => Number((v / magnitud).toFixed(4)));
}

export async function cargarModelos(carpeta: string, opcionMobilenet: string): Promise<Modelos> {
  registrarLecturaDeArchivos();
  const backend = await prepararBackend();

  const personas = await cocoSsd.load({
    base: 'lite_mobilenet_v2',
    modelUrl: `file://${join(carpeta, 'coco-ssd', 'model.json')}`,
  });

  // Rostros: si falla, el servicio sigue con las personas (como la app).
  let rostros: faceDetection.FaceDetector | null = null;
  try {
    rostros = await faceDetection.createDetector(faceDetection.SupportedModels.MediaPipeFaceDetector, {
      runtime: 'tfjs',
      modelType: 'full',
      maxFaces: 30,
      detectorModelUrl: `file://${join(carpeta, 'face-detection', 'model.json')}`,
    });
  } catch (error) {
    console.error('No se pudo cargar el detector de rostros.', error);
  }

  let similitud: mobilenet.MobileNet | null = null;
  const cargarSimilitud = async (intento: number): Promise<void> => {
    try {
      similitud = await mobilenet.load({
        version: 2,
        alpha: 1.0,
        ...(opcionMobilenet === 'remoto' ? {} : { modelUrl: `file://${join(opcionMobilenet, 'model.json')}` }),
      });
      if (intento > 1) console.info('MobileNet cargó en el reintento.');
    } catch (error) {
      // Sin MobileNet la detección de duplicados usa solo ubicación, categoría y
      // tiempo. Se reintenta en segundo plano (30 s, 2 min, 10 min).
      const espera = [30_000, 120_000, 600_000][intento - 1];
      console.error(`No se pudo cargar MobileNet (intento ${intento}); las fotos se comparan sin vector.`, error);
      if (espera) setTimeout(() => void cargarSimilitud(intento + 1), espera).unref();
    }
  };
  if (opcionMobilenet !== 'no') await cargarSimilitud(1);

  return {
    conRostros: rostros !== null,
    get conSimilitud() {
      return similitud !== null;
    },
    backend,

    async detectar(imagen) {
      const tensor = aTensor(imagen);
      try {
        const [caras, objetos] = await Promise.all([
          rostros ? rostros.estimateFaces(tensor, { flipHorizontal: false }) : Promise.resolve([]),
          personas.detect(tensor, MAXIMO_PERSONAS, CONFIANZA_PERSONA),
        ]);
        return {
          rostros: caras.map(({ box }) => ({ x: box.xMin, y: box.yMin, ancho: box.width, alto: box.height })),
          personas: objetos
            .filter((objeto) => objeto.class === 'person')
            .map(({ bbox: [x, y, ancho, alto] }) => ({ x, y, ancho, alto })),
        };
      } finally {
        tensor.dispose();
      }
    },

    async vector(imagen) {
      const modelo = similitud;
      if (!modelo) return null;
      const tensor = aTensor(imagen);
      try {
        const salida = modelo.infer(tensor, true) as tf.Tensor;
        const valores = await salida.data();
        salida.dispose();
        return normalizarVector(valores);
      } finally {
        tensor.dispose();
      }
    },
  };
}
