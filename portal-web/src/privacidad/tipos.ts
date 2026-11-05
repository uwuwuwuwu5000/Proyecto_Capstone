// Lo que el resto del portal conoce de la protección de las fotos. Quien difumina (hoy el navegador, con
// `privacidad.ts`; más adelante, si se retoma, el servicio de la nube) cumple `ProtectorDeFotos`: así la pantalla
// de crear reporte y `crearReporte.ts` no dependen de cómo se difumina.
import type { InfoPrivacidad } from '@ciudad-alerta/comun'

export type { InfoPrivacidad }

export interface FotoProtegida {
  dataUrl: string
  mimeType: 'image/jpeg'
  sizeBytes: number
  privacidad: InfoPrivacidad
}

/** La foto no se pudo proteger: NO debe publicarse, porque no se puede garantizar que no muestre rostros. */
export class PrivacidadError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PrivacidadError'
  }
}

export interface ProtectorDeFotos {
  /** Devuelve la foto con rostros y personas difuminados; lanza `PrivacidadError` si no pudo. */
  anonimizar(dataUrl: string): Promise<FotoProtegida>
}
