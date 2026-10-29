// Agrupación de reportes cercanos del mapa público (sin Leaflet ni React, para
// poder probarla aparte). Mismos parámetros que el mapa de incidencias de la app.
import Supercluster from 'supercluster'

export const ZOOM_MAXIMO = 19
export const RADIO_AGRUPACION = 60

export interface PuntoAgrupable {
  id: string
  lat: number
  lng: number
}

export type IndiceDeGrupos = Supercluster<{ id: string }>

/** Índice de grupos: agrupa por distancia en pantalla para cada nivel de zoom. */
export function crearIndice(puntos: readonly PuntoAgrupable[]): IndiceDeGrupos {
  const indice = new Supercluster<{ id: string }>({ radius: RADIO_AGRUPACION, maxZoom: ZOOM_MAXIMO, minPoints: 2 })
  indice.load(
    puntos.map((p) => ({
      type: 'Feature' as const,
      properties: { id: p.id },
      geometry: { type: 'Point' as const, coordinates: [p.lng, p.lat] as [number, number] },
    })),
  )
  return indice
}

/** Diámetro del círculo: crece con la cantidad, como en los mapas de comercios. */
export function diametroDeGrupo(cantidad: number): number {
  return cantidad < 10 ? 40 : cantidad < 50 ? 48 : 56
}

export function textoDeGrupo(cantidad: number): string {
  return cantidad > 999 ? '999+' : String(cantidad)
}
