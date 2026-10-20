// Lee la imagen elegida y la deja como JPEG de lado mayor acotado, para que el
// documento de `reportPhotos` quepa en Firestore (la regla exige < 950.000
// caracteres) y para que el análisis de privacidad sea rápido.

const LADO_MAXIMO = 1024
const CALIDAD = 0.7
/** Misma cota que la app móvil: el dataUrl debe quedar bajo 900.000 caracteres. */
export const LIMITE_DATA_URL = 900_000
const TIPOS_ACEPTADOS = ['image/jpeg', 'image/png', 'image/webp']

export function esImagenAceptada(archivo: File): boolean {
  return TIPOS_ACEPTADOS.includes(archivo.type)
}

function leer(archivo: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const lector = new FileReader()
    lector.onload = () => resolve(String(lector.result))
    lector.onerror = () => reject(new Error('No se pudo leer el archivo.'))
    lector.readAsDataURL(archivo)
  })
}

/** Devuelve un dataUrl JPEG de hasta 1024 px; reduce la calidad si aún pesa demasiado. */
export async function comprimirImagen(archivo: File): Promise<string> {
  if (!esImagenAceptada(archivo)) {
    throw new Error('Usa una imagen JPG, PNG o WebP.')
  }
  const original = await leer(archivo)

  const imagen = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('El archivo no es una imagen válida.'))
    img.src = original
  })

  const escala = Math.min(1, LADO_MAXIMO / Math.max(imagen.width, imagen.height))
  const lienzo = document.createElement('canvas')
  lienzo.width = Math.max(1, Math.round(imagen.width * escala))
  lienzo.height = Math.max(1, Math.round(imagen.height * escala))
  const contexto = lienzo.getContext('2d')
  if (!contexto) throw new Error('El navegador no pudo procesar la imagen.')
  contexto.drawImage(imagen, 0, 0, lienzo.width, lienzo.height)

  for (const calidad of [CALIDAD, 0.55, 0.4]) {
    const dataUrl = lienzo.toDataURL('image/jpeg', calidad)
    if (dataUrl.length <= LIMITE_DATA_URL) return dataUrl
  }
  throw new Error('La fotografía es demasiado pesada incluso comprimida. Elige otra.')
}
