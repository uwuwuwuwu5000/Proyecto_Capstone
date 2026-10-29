// Cálculos del mapa de calor por comuna (sin React ni Firestore, para poder
// probarlos aparte). La agrupación y los tramos viven en `comun/` (paquete
// compartido con la app móvil); aquí solo queda lo propio del portal: los tipos
// con su modelo de reporte y los colores del mapa.
import {
  agruparPorComuna as agruparPorComunaComun,
  codigoDeComuna,
  normalizar,
  rangosDeTramos,
  tramoDeIntensidad,
} from '@ciudad-alerta/comun'
import type { EstadisticaComuna as EstadisticaComunaComun, ResultadoAgrupacion as ResultadoAgrupacionComun } from '@ciudad-alerta/comun'
import type { Reporte } from '../../components/Reportes/reporte'

export { codigoDeComuna, normalizar, rangosDeTramos, tramoDeIntensidad }

export interface ComunaCatalogo {
  codigo: string
  nombre: string
  codigoRegion: string
  region: string
  organismoId: string
}

export type EstadisticaComuna = EstadisticaComunaComun<Reporte>
export type ResultadoAgrupacion = ResultadoAgrupacionComun<Reporte>

export function agruparPorComuna(reportes: Reporte[], catalogo: ComunaCatalogo[]): ResultadoAgrupacion {
  return agruparPorComunaComun(reportes, catalogo)
}

/** Colores del mapa: rojo de alerta del portal, de menos a más intenso. */
const ROJO = '224, 101, 107'
const OPACIDAD_RELLENO = [0.1, 0.22, 0.38, 0.55, 0.72, 0.9]

export function colorDeTramo(tramo: number): { relleno: string; borde: string } {
  if (tramo <= 0) return { relleno: 'rgba(17, 24, 39, 0.08)', borde: 'rgba(92, 103, 125, 0.95)' }
  return { relleno: `rgba(${ROJO}, ${OPACIDAD_RELLENO[tramo]})`, borde: `rgba(${ROJO}, 1)` }
}
