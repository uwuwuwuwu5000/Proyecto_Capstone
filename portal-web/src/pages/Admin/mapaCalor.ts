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

/**
 * Escala del mapa de calor, de pocos a muchos reportes sin resolver: azul → celeste → amarillo → naranja → rojo. Evita
 * el verde, así no depende de distinguir rojo de verde. Las comunas sin reportes sin resolver (tramo 0) no llevan color.
 */
const ESCALA = ['59, 130, 246', '34, 184, 207', '250, 204, 21', '251, 146, 60', '239, 68, 68']
const OPACIDAD_RELLENO = 0.6

export function colorDeTramo(tramo: number): { relleno: string; borde: string } {
  if (tramo <= 0) return { relleno: 'rgba(17, 24, 39, 0.08)', borde: 'rgba(92, 103, 125, 0.95)' }
  const rgb = ESCALA[Math.min(tramo, ESCALA.length) - 1]
  return { relleno: `rgba(${rgb}, ${OPACIDAD_RELLENO})`, borde: `rgba(${rgb}, 1)` }
}
