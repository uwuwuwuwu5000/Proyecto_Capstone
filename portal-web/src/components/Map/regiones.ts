// Regiones de Chile para el mapa público: la lista de las 16 (del catálogo de
// comunas), su caja geográfica (del índice de límites comunales) y la región de
// una ubicación. Mismo criterio que el mapa de incidencias de la app móvil.
import { areaDeCaja, cajaDesdeGeoJson, dentroDeCaja, nombreCortoRegion } from '@ciudad-alerta/comun'
import type { CajaGeografica } from '@ciudad-alerta/comun'

export type { CajaGeografica }

/** Una de las 16 regiones de Chile. */
export interface Region {
  /** Código de dos dígitos: '13' es la Metropolitana. */
  codigo: string
  /** Nombre tal como se guarda en `reports.region` ("Región Metropolitana de Santiago"). */
  nombre: string
  /** Nombre corto para listas: "Metropolitana de Santiago", "Valparaíso". */
  nombreCorto: string
  /** Comunas de la región, con el nombre del catálogo. */
  comunas: string[]
  caja: CajaGeografica | null
}

export const REGION_INICIAL = '13'

/**
 * El índice trae la caja de Valparaíso con las islas oceánicas (Isla de Pascua
 * y Juan Fernández): el mapa se alejaría hasta el Pacífico. Se usa el territorio
 * continental, como en la app.
 */
const CAJA_CONTINENTAL: Record<string, [number, number, number, number]> = {
  '05': [-72.0, -33.95, -69.99, -31.9],
}

interface ComunaCatalogo {
  nombre: string
  codigoRegion: string
  region: string
}

interface IndiceGeo {
  regiones: { codigo: string; caja: [number, number, number, number] }[]
}

let carga: Promise<Region[]> | null = null

/** Las 16 regiones de norte a sur. Se lee una vez; si falla, se reintenta en la próxima llamada. */
export function cargarRegiones(): Promise<Region[]> {
  if (!carga) {
    carga = construir().catch((error: unknown) => {
      carga = null
      throw error
    })
  }
  return carga
}

async function leerJson<T>(ruta: string): Promise<T> {
  const respuesta = await fetch(ruta)
  if (!respuesta.ok) throw new Error(`No se pudo leer ${ruta}`)
  return (await respuesta.json()) as T
}

const centroLat = (c: CajaGeografica) => (c.minLat + c.maxLat) / 2

async function construir(): Promise<Region[]> {
  const [catalogo, indice] = await Promise.all([
    leerJson<{ comunas: ComunaCatalogo[] }>('/data/comunas-chile.json'),
    leerJson<IndiceGeo>('/geo/indice.json').catch(() => null),
  ])
  const cajas = new Map((indice?.regiones ?? []).map((r) => [r.codigo, r.caja]))
  const porCodigo = new Map<string, Region>()

  for (const comuna of catalogo.comunas) {
    let region = porCodigo.get(comuna.codigoRegion)
    if (!region) {
      const caja = CAJA_CONTINENTAL[comuna.codigoRegion] ?? cajas.get(comuna.codigoRegion)
      region = {
        codigo: comuna.codigoRegion,
        nombre: comuna.region,
        nombreCorto: nombreCortoRegion(comuna.region),
        comunas: [],
        caja: caja ? cajaDesdeGeoJson(caja) : null,
      }
      porCodigo.set(comuna.codigoRegion, region)
    }
    region.comunas.push(comuna.nombre)
  }

  // De norte a sur: el código no sigue el orden geográfico (Arica es la 15).
  return [...porCodigo.values()].sort(
    (a, b) => (b.caja ? centroLat(b.caja) : -90) - (a.caja ? centroLat(a.caja) : -90),
  )
}

/**
 * Región donde está un punto, según las cajas de las regiones. Con cajas que se
 * traslapan, la más chica es la más probable; null si ninguna lo contiene.
 */
export function regionDePunto(punto: { lat: number; lng: number }, regiones: readonly Region[]): Region | null {
  const contienen = regiones.filter((r) => r.caja && dentroDeCaja(punto, r.caja))
  contienen.sort((a, b) => areaDeCaja(a.caja!) - areaDeCaja(b.caja!))
  return contienen[0] ?? null
}
