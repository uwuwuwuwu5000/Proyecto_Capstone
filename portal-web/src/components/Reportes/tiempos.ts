import type { CambioEstado } from './historial'
import type { Reporte } from './reporte'

export const ESTADOS_FINALIZADOS = new Set(['resuelto', 'cerrado'])

export interface TiemposReporte {
  /** Desde la creación hasta el primer cambio de estado; null si nunca se atendió. */
  primeraAtencionMs: number | null
  /** Desde la creación hasta que pasó a resuelto o cerrado; null si sigue abierto. */
  resolucionMs: number | null
}

export function calcularTiempos(reporte: Reporte, cambios: CambioEstado[]): TiemposReporte {
  if (!reporte.fecha) {
    return { primeraAtencionMs: null, resolucionMs: null }
  }
  const inicio = reporte.fecha.getTime()
  const conFecha = cambios.filter((c): c is CambioEstado & { fecha: Date } => c.fecha !== null)
  const primera = conFecha[0]
  const resolucion = conFecha.find((c) => ESTADOS_FINALIZADOS.has(c.hacia))
  // max(0, …): el reloj del dispositivo que creó el reporte puede ir adelantado.
  return {
    primeraAtencionMs: primera ? Math.max(0, primera.fecha.getTime() - inicio) : null,
    resolucionMs: resolucion ? Math.max(0, resolucion.fecha.getTime() - inicio) : null,
  }
}

/** La mediana resiste los casos extremos mejor que el promedio: un reporte olvidado un mes no la arrastra. */
export function mediana(valores: number[]): number | null {
  if (valores.length === 0) return null
  const ordenados = [...valores].sort((a, b) => a - b)
  const mitad = Math.floor(ordenados.length / 2)
  return ordenados.length % 2 === 0
    ? (ordenados[mitad - 1] + ordenados[mitad]) / 2
    : ordenados[mitad]
}

export function promedio(valores: number[]): number | null {
  if (valores.length === 0) return null
  return valores.reduce((suma, v) => suma + v, 0) / valores.length
}

/** "12 min", "2 h 15 min", "3,5 días", "18 días". */
export function formatearDuracion(ms: number): string {
  const minutos = Math.round(ms / 60000)
  if (minutos < 1) return 'menos de 1 min'
  if (minutos < 60) return `${minutos} min`
  if (minutos < 24 * 60) {
    const horas = Math.floor(minutos / 60)
    const resto = minutos % 60
    return resto > 0 ? `${horas} h ${resto} min` : `${horas} h`
  }
  const dias = minutos / (24 * 60)
  if (dias >= 10) return `${Math.round(dias)} días`
  const redondeado = Math.round(dias * 10) / 10
  return redondeado === 1 ? '1 día' : `${redondeado.toLocaleString('es-CL')} días`
}
