// Punto único para obtener quien protege las fotos. Hoy difumina el navegador (TensorFlow.js, con los modelos
// de `public/models`, que se descargan solo la primera vez que se elige una foto). Si se retoma el servicio de
// privacidad de la nube (Fase 10 original, aplazada), aquí se elige entre las dos formas.
import type { ProtectorDeFotos } from './tipos'

export type { FotoProtegida, ProtectorDeFotos } from './tipos'
export { PrivacidadError } from './tipos'

export async function obtenerProtector(): Promise<ProtectorDeFotos> {
  const { protectorEnNavegador } = await import('./privacidad')
  return protectorEnNavegador
}
