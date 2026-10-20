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
import { prepararTensorflow, resolverModulo } from './tensorflow'

const MODELO_LOCAL_PERSONAS = '/models/coco-ssd/model.json'
const MODELO_LOCAL_ROSTROS = '/models/face-detection/model.json'

/**
 * Umbral bajo a propósito: difuminar algo que no era una persona cuesta poco;
 * publicar un rostro sin difuminar es lo que se debe evitar.
 */
const CONFIANZA_PERSONA = 0.35
const CALIDAD_SALIDA = 0.6

/** Igual que `InfoPrivacidad` de la app: lo exige la regla fotoProtegida(). */
export interface InfoPrivacidad {
  aplicada: boolean
  rostros: number
  personas: number
  version: string
}

export interface FotoProtegida {
  dataUrl: string
  mimeType: 'image/jpeg'
  sizeBytes: number
  privacidad: InfoPrivacidad
}

interface Caja {
  x: number
  y: number
  ancho: number
  alto: number
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

function recortar(caja: Caja, lienzo: HTMLCanvasElement): Caja {
  const x = Math.max(0, caja.x)
  const y = Math.max(0, caja.y)
  return {
    x,
    y,
    ancho: Math.min(lienzo.width - x, caja.ancho - (x - caja.x)),
    alto: Math.min(lienzo.height - y, caja.alto - (y - caja.y)),
  }
}

/** La caja del detector se ajusta a los rasgos: se amplía a frente, cabello y mentón. */
function ampliar(caja: Caja, lienzo: HTMLCanvasElement): Caja {
  const margenX = caja.ancho * 0.3
  const margenArriba = caja.alto * 0.45
  const margenAbajo = caja.alto * 0.25
  return recortar(
    {
      x: caja.x - margenX,
      y: caja.y - margenArriba,
      ancho: caja.ancho + margenX * 2,
      alto: caja.alto + margenArriba + margenAbajo,
    },
    lienzo,
  )
}

/** Cuarto superior y todo el ancho de la persona, para no fallar con personas agachadas o cortadas. */
function zonaCabeza(persona: Caja, lienzo: HTMLCanvasElement): Caja {
  return recortar(
    {
      x: persona.x,
      y: persona.y - persona.alto * 0.03,
      ancho: persona.ancho,
      alto: persona.alto * 0.28,
    },
    lienzo,
  )
}

function solapa(a: Caja, b: Caja): boolean {
  return a.x < b.x + b.ancho && a.x + a.ancho > b.x && a.y < b.y + b.alto && a.y + a.alto > b.y
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

  const anchoReducido = Math.max(2, Math.min(8, Math.round(zona.ancho / 6)))
  const altoReducido = Math.max(2, Math.round(anchoReducido * (zona.alto / zona.ancho)))

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
        personasDetector.detect(lienzo, 30, CONFIANZA_PERSONA).then((objetos) =>
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

  for (const rostro of rostros) {
    difuminar(contexto, lienzo, ampliar(rostro, lienzo), true)
  }

  // Personas: zona de la cabeza, salvo que ya se difuminó un rostro dentro.
  let personasDifuminadas = 0
  for (const persona of personas) {
    const cabeza = zonaCabeza(persona, lienzo)
    if (rostros.some((r) => solapa(r, cabeza))) continue
    difuminar(contexto, lienzo, cabeza, false)
    personasDifuminadas += 1
  }

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
      version: rostrosDetector ? 'mediapipe-face-full+coco-ssd-lite-v2' : 'coco-ssd-lite-v2',
    },
  }
}
