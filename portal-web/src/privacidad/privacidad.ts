// Difuminado de rostros y personas antes de publicar una fotografía.
// Portado de privacidad.service.ts de la app móvil: mismos modelos, mismos
// umbrales y mismo método de difuminado, para que ambas protejan igual.
//
// Modelos: MediaPipe Face Detection ("full") para rostros y COCO-SSD
// ("lite_mobilenet_v2") para personas completas, de las que se difumina la
// cabeza. Se sirven desde /models (copia idéntica a la de la app) y, si esa
// copia falla, desde los servidores externos. Se cargan bajo demanda.
import type * as TF from '@tensorflow/tfjs-core'
import type * as FaceDetection from '@tensorflow-models/face-detection'
import type * as CocoSsd from '@tensorflow-models/coco-ssd'
import {
  CALIDAD_SALIDA,
  CONFIANZA_PERSONA,
  MAXIMO_PERSONAS,
  tamanoReducido,
  versionDeModelos,
  zonasADifuminar,
} from '@ciudad-alerta/comun'
import type { Caja, InfoPrivacidad } from '@ciudad-alerta/comun'
import { prepararTensorflow, resolverModulo } from './tensorflow'

// Umbrales, márgenes y geometría del difuminado: viven en `comun/`, compartidos
// con la app móvil, para que ambas difuminen exactamente igual.
export type { InfoPrivacidad }

const MODELO_LOCAL_PERSONAS = '/models/coco-ssd/model.json'
const MODELO_LOCAL_ROSTROS = '/models/face-detection/model.json'


export interface FotoProtegida {
  dataUrl: string
  mimeType: 'image/jpeg'
  sizeBytes: number
  privacidad: InfoPrivacidad
}

export class PrivacidadError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PrivacidadError'
  }
}

let detectorRostros: FaceDetection.FaceDetector | null = null
let detectorPersonas: CocoSsd.ObjectDetection | null = null
let carga: Promise<void> | null = null
let tf: typeof TF | null = null

/** Detalle técnico del último fallo de carga, para mostrarlo si hace falta. */
export let ultimoErrorTecnico: string | null = null

function describir(error: unknown): string {
  const detalle = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
  return `${detalle} · Backend: ${tf?.getBackend() ?? 'sin iniciar'} · Conexión: ${
    navigator.onLine ? 'sí' : 'no'
  }`
}

async function existeLocal(ruta: string): Promise<boolean> {
  try {
    const respuesta = await fetch(ruta, { cache: 'no-store' })
    if (!respuesta.ok) return false
    // El servidor puede devolver index.html con 200 para rutas inexistentes.
    const contenido = (await respuesta.json()) as { weightsManifest?: unknown }
    return Array.isArray(contenido.weightsManifest)
  } catch {
    return false
  }
}

/** Ejecuta y, si falla con WebGL, repite en la CPU. */
async function conRespaldoCpu<T>(accion: () => Promise<T>): Promise<T> {
  try {
    return await accion()
  } catch (error) {
    if (!tf || tf.getBackend() !== 'webgl') throw error
    console.warn('Privacidad: falló con WebGL; se reintenta en la CPU.', error)
    await tf.setBackend('cpu')
    await tf.ready()
    return accion()
  }
}

/** Copia local primero; si está dañada o falta, el servidor externo. */
async function conRespaldoRemoto<T>(
  hayLocal: boolean,
  cargar: (local: boolean) => Promise<T>,
  nombre: string,
): Promise<T> {
  if (hayLocal) {
    try {
      return await cargar(true)
    } catch (error) {
      console.warn(`Privacidad: la copia local de ${nombre} falló; se usa el servidor externo.`, error)
    }
  }
  return cargar(false)
}

async function cargarDetectorPersonas(): Promise<void> {
  try {
    const cocoSsd = resolverModulo<typeof CocoSsd>(await import('@tensorflow-models/coco-ssd'), 'load')
    const local = await existeLocal(MODELO_LOCAL_PERSONAS)
    detectorPersonas = await conRespaldoRemoto(
      local,
      (desdeLocal) =>
        conRespaldoCpu(() =>
          cocoSsd.load({
            base: 'lite_mobilenet_v2',
            ...(desdeLocal ? { modelUrl: MODELO_LOCAL_PERSONAS } : {}),
          }),
        ),
      'personas',
    )
    ultimoErrorTecnico = null
  } catch (error) {
    console.error('Privacidad: no se pudo cargar el detector de personas.', error)
    ultimoErrorTecnico = describir(error)
  }
}

async function cargarDetectorRostros(): Promise<void> {
  try {
    const faceDetection = resolverModulo<typeof FaceDetection>(
      await import('@tensorflow-models/face-detection'),
      'createDetector',
    )
    const local = await existeLocal(MODELO_LOCAL_ROSTROS)
    detectorRostros = await conRespaldoRemoto(
      local,
      (desdeLocal) =>
        conRespaldoCpu(() =>
          faceDetection.createDetector(faceDetection.SupportedModels.MediaPipeFaceDetector, {
            // 'tfjs' reutiliza TensorFlow.js; 'mediapipe' cargaría WASM desde una CDN.
            runtime: 'tfjs',
            modelType: 'full',
            maxFaces: 30,
            ...(desdeLocal ? { detectorModelUrl: MODELO_LOCAL_ROSTROS } : {}),
          }),
        ),
      'rostros',
    )
  } catch (error) {
    // No es fatal: el detector de personas cubre también a quien está cerca.
    console.error('Privacidad: no se pudo cargar el detector de rostros.', error)
  }
}

async function cargarModelos(): Promise<void> {
  if (detectorRostros && detectorPersonas) return
  if (!carga) {
    carga = (async () => {
      if (!tf) {
        try {
          tf = await prepararTensorflow()
        } catch (error) {
          console.error('Privacidad: no se pudo iniciar TensorFlow.', error)
          ultimoErrorTecnico = describir(error)
          return
        }
      }
      await Promise.all([
        detectorPersonas ? Promise.resolve() : cargarDetectorPersonas(),
        detectorRostros ? Promise.resolve() : cargarDetectorRostros(),
      ])
    })().finally(() => {
      carga = null
    })
  }
  await carga
}

/**
 * Reduce la zona a muy pocos píxeles y la vuelve a ampliar con suavizado: lo
 * descartado al reducir no se puede recuperar, así que es irreversible.
 */
function difuminar(
  contexto: CanvasRenderingContext2D,
  lienzo: HTMLCanvasElement,
  zona: Caja,
  eliptica: boolean,
): void {
  if (zona.ancho < 2 || zona.alto < 2) return

  const { ancho: anchoReducido, alto: altoReducido } = tamanoReducido(zona)

  const reducido = document.createElement('canvas')
  reducido.width = anchoReducido
  reducido.height = altoReducido
  const ctxReducido = reducido.getContext('2d')
  if (!ctxReducido) return

  ctxReducido.imageSmoothingEnabled = true
  ctxReducido.drawImage(lienzo, zona.x, zona.y, zona.ancho, zona.alto, 0, 0, anchoReducido, altoReducido)

  contexto.save()
  if (eliptica) {
    contexto.beginPath()
    contexto.ellipse(
      zona.x + zona.ancho / 2,
      zona.y + zona.alto / 2,
      zona.ancho / 2,
      zona.alto / 2,
      0,
      0,
      Math.PI * 2,
    )
    contexto.clip()
  }
  contexto.imageSmoothingEnabled = true
  contexto.imageSmoothingQuality = 'high'
  contexto.drawImage(reducido, 0, 0, anchoReducido, altoReducido, zona.x, zona.y, zona.ancho, zona.alto)
  contexto.restore()
}

function aLienzo(dataUrl: string): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const imagen = new Image()
    imagen.onload = () => {
      const lienzo = document.createElement('canvas')
      lienzo.width = imagen.width
      lienzo.height = imagen.height
      lienzo.getContext('2d')?.drawImage(imagen, 0, 0)
      resolve(lienzo)
    }
    imagen.onerror = () => reject(new PrivacidadError('No se pudo leer la imagen.'))
    imagen.src = dataUrl
  })
}

/**
 * Devuelve la foto con rostros y personas difuminados.
 *
 * Lanza `PrivacidadError` si los modelos no cargan: en ese caso la foto NO
 * debe publicarse, porque no se puede garantizar que no muestre rostros.
 */
export async function anonimizar(dataUrl: string): Promise<FotoProtegida> {
  await cargarModelos()

  // El de personas es el indispensable; el de rostros afina primeros planos.
  if (!detectorPersonas) {
    throw new PrivacidadError(
      'No pudimos cargar la protección de privacidad. Revisa tu conexión e inténtalo de nuevo.',
    )
  }
  const personasDetector = detectorPersonas
  const rostrosDetector = detectorRostros

  const lienzo = await aLienzo(dataUrl)
  const contexto = lienzo.getContext('2d')
  if (!contexto) throw new PrivacidadError('El navegador no pudo procesar la imagen.')

  let rostros: Caja[]
  let personas: Caja[]
  try {
    ;[rostros, personas] = await conRespaldoCpu(() =>
      Promise.all([
        rostrosDetector
          ? rostrosDetector.estimateFaces(lienzo, { flipHorizontal: false }).then((r) =>
              r.map(({ box }) => ({ x: box.xMin, y: box.yMin, ancho: box.width, alto: box.height })),
            )
          : Promise.resolve([] as Caja[]),
        personasDetector.detect(lienzo, MAXIMO_PERSONAS, CONFIANZA_PERSONA).then((objetos) =>
          objetos
            .filter((o) => o.class === 'person')
            .map(({ bbox: [x, y, ancho, alto] }) => ({ x, y, ancho, alto })),
        ),
      ]),
    )
  } catch (error) {
    console.error('Privacidad: falló el análisis de la imagen.', error)
    ultimoErrorTecnico = describir(error)
    throw new PrivacidadError('No se pudo analizar la imagen. Inténtalo de nuevo.')
  }

  // Qué difuminar (cada rostro ampliado y la cabeza de cada persona sin rostro
  // detectado) lo decide `comun`; aquí solo se pinta.
  const zonas = zonasADifuminar(rostros, personas, lienzo)
  for (const zona of zonas.rostros) difuminar(contexto, lienzo, zona, true)
  for (const zona of zonas.cabezas) difuminar(contexto, lienzo, zona, false)
  const personasDifuminadas = zonas.cabezas.length

  const salida = lienzo.toDataURL('image/jpeg', CALIDAD_SALIDA)
  return {
    dataUrl: salida,
    mimeType: 'image/jpeg',
    // Tamaño aproximado de los bytes a partir del base64.
    sizeBytes: Math.floor(((salida.length - salida.indexOf(',') - 1) * 3) / 4),
    privacidad: {
      aplicada: true,
      rostros: rostros.length,
      personas: personasDifuminadas,
      version: versionDeModelos(!!rostrosDetector),
    },
  }
}
