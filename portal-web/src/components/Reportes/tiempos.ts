// Tiempos de atención y de resolución de un reporte. El cálculo vive en
// `comun/` (paquete compartido con la app móvil), así que el portal y la app
// muestran los mismos números: si el reporte ya trae `tiempoResolucionMs` (lo
// guarda quien resuelve), ese es el dato oficial; si no, se deduce del historial.
//
// Este archivo conserva los nombres que ya usaba el portal.
import {
  ESTADOS_FINALIZADOS as ESTADOS_FINALIZADOS_COMUN,
  calcularTiempos as calcularTiemposComun,
  resolucionDeReporte,
} from '@ciudad-alerta/comun'
import type { TiemposReporte } from '@ciudad-alerta/comun'
import type { CambioEstado } from './historial'
import { formatearDuracion } from '@ciudad-alerta/comun'
import { formatearFecha } from './reporte'
import type { Reporte } from './reporte'

export { formatearDuracion, mediana, promedio } from '@ciudad-alerta/comun'
export type { TiemposReporte }

export const ESTADOS_FINALIZADOS: ReadonlySet<string> = new Set(ESTADOS_FINALIZADOS_COMUN)

export function calcularTiempos(reporte: Reporte, cambios: CambioEstado[]): TiemposReporte {
  return calcularTiemposComun(reporte.fecha, cambios, reporte.tiempoResolucionMs ?? null)
}

/**
 * Texto de la fila «Resolución» del detalle de un reporte, o null si no hay
 * nada que decir (sigue abierto, o todavía no se leyó el historial que hace
 * falta para saberlo). Igual que la app: usa los datos guardados al resolver y,
 * en los reportes resueltos antes de existir esos datos, el historial.
 */
export function textoResolucion(reporte: Reporte, cambios: CambioEstado[] | null): string | null {
  const tieneRegistro = typeof reporte.tiempoResolucionMs === 'number' || !!reporte.cerradoSinResolverAt
  // Sin registro propio, un reporte terminado necesita su historial para decir algo.
  if (!tieneRegistro && cambios === null && ESTADOS_FINALIZADOS.has(reporte.estado)) return null

  const r = resolucionDeReporte({
    estado: reporte.estado,
    creado: reporte.fecha,
    cambios: cambios ?? [],
    tiempoResolucionMs: reporte.tiempoResolucionMs ?? null,
    cerradoSinResolver: !!reporte.cerradoSinResolverAt,
  })

  switch (r.tipo) {
    case 'resuelto':
      return (
        'Resuelto' +
        (reporte.resueltoAt ? ` el ${formatearFecha(reporte.resueltoAt, true)}` : '') +
        (r.ms !== null ? ` · en ${formatearDuracion(r.ms)}` : '') +
        (r.segun === 'historial' ? ' (según el historial)' : '')
      )
    case 'cerrado_sin_resolver':
      return (
        'Cerrado sin resolver' +
        (reporte.cerradoSinResolverAt ? ` el ${formatearFecha(reporte.cerradoSinResolverAt, true)}` : '')
      )
    case 'cerrado':
      return 'Cerrado (no hay datos para saber si antes se resolvió)'
    default:
      return null
  }
}
