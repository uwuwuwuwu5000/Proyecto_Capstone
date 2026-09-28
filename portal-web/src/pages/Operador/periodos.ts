import type { PuntoColumna } from '../../components/Graficos/GraficoColumnas'
import type { Reporte } from '../../components/Reportes/reporte'

export type Periodo = 'semana' | 'mes' | 'mesAnterior' | 'semestre' | 'todo' | 'personalizado'

export const PERIODOS: { clave: Periodo; etiqueta: string }[] = [
  { clave: 'semana', etiqueta: 'Esta semana' },
  { clave: 'mes', etiqueta: 'Este mes' },
  { clave: 'mesAnterior', etiqueta: 'Mes anterior' },
  { clave: 'semestre', etiqueta: 'Últimos 6 meses' },
  { clave: 'todo', etiqueta: 'Todo' },
  { clave: 'personalizado', etiqueta: 'Personalizado' },
]

export interface Rango {
  inicio: Date | null
  fin: Date | null
}

const DIA_MS = 24 * 60 * 60 * 1000

function inicioDelDia(fecha: Date): Date {
  return new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate())
}

/** Lunes de la semana de `fecha`, a las 00:00. */
function inicioDeSemana(fecha: Date): Date {
  const dia = inicioDelDia(fecha)
  dia.setDate(dia.getDate() - ((dia.getDay() + 6) % 7))
  return dia
}

export function rangoDePeriodo(
  periodo: Periodo,
  desde: string,
  hasta: string,
  ahora = new Date(),
): Rango {
  const anio = ahora.getFullYear()
  const mes = ahora.getMonth()
  switch (periodo) {
    case 'semana':
      return { inicio: inicioDeSemana(ahora), fin: ahora }
    case 'mes':
      return { inicio: new Date(anio, mes, 1), fin: ahora }
    case 'mesAnterior':
      return { inicio: new Date(anio, mes - 1, 1), fin: new Date(new Date(anio, mes, 1).getTime() - 1) }
    case 'semestre':
      return { inicio: new Date(anio, mes - 6, ahora.getDate()), fin: ahora }
    case 'todo':
      return { inicio: null, fin: null }
    case 'personalizado':
      return {
        inicio: desde ? new Date(`${desde}T00:00:00`) : null,
        fin: hasta ? new Date(`${hasta}T23:59:59.999`) : null,
      }
  }
}

export function estaEnRango(reporte: Reporte, { inicio, fin }: Rango): boolean {
  if (!inicio && !fin) {
    return true
  }
  if (!reporte.fecha) {
    return false
  }
  return (!inicio || reporte.fecha >= inicio) && (!fin || reporte.fecha <= fin)
}

type Granularidad = 'dia' | 'semana' | 'mes'

export const NOMBRE_GRANULARIDAD: Record<Granularidad, string> = {
  dia: 'por día',
  semana: 'por semana',
  mes: 'por mes',
}

function inicioDeBalde(fecha: Date, granularidad: Granularidad): Date {
  if (granularidad === 'dia') return inicioDelDia(fecha)
  if (granularidad === 'semana') return inicioDeSemana(fecha)
  return new Date(fecha.getFullYear(), fecha.getMonth(), 1)
}

function siguienteBalde(fecha: Date, granularidad: Granularidad): Date {
  const siguiente = new Date(fecha)
  if (granularidad === 'dia') siguiente.setDate(siguiente.getDate() + 1)
  else if (granularidad === 'semana') siguiente.setDate(siguiente.getDate() + 7)
  else siguiente.setMonth(siguiente.getMonth() + 1)
  return siguiente
}

function claveDeFecha(fecha: Date): string {
  return `${fecha.getFullYear()}-${fecha.getMonth() + 1}-${fecha.getDate()}`
}

function etiquetas(fecha: Date, granularidad: Granularidad): { etiqueta: string; corta: string } {
  if (granularidad === 'mes') {
    return {
      etiqueta: fecha.toLocaleDateString('es-CL', { month: 'long', year: 'numeric' }),
      corta: fecha.toLocaleDateString('es-CL', { month: 'short', year: '2-digit' }),
    }
  }
  const corta = fecha.toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })
  if (granularidad === 'semana') {
    return {
      etiqueta: `Semana del ${fecha.toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' })}`,
      corta,
    }
  }
  return {
    etiqueta: fecha.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' }),
    corta,
  }
}

/**
 * Serie continua (con ceros) de reportes por día, semana o mes, según lo
 * largo del rango: hasta ~1 mes por día, hasta ~6 meses por semana, y más
 * allá por mes. Con "Todo", el rango empieza en el reporte más antiguo.
 */
export function construirSerie(
  reportes: Reporte[],
  rango: Rango,
  ahora = new Date(),
): { puntos: PuntoColumna[]; granularidad: Granularidad } {
  const fechas = reportes.map((r) => r.fecha).filter((f): f is Date => f !== null)
  const inicio =
    rango.inicio ?? (fechas.length ? new Date(Math.min(...fechas.map((f) => f.getTime()))) : ahora)
  const fin = rango.fin ?? ahora
  const dias = (fin.getTime() - inicio.getTime()) / DIA_MS
  const granularidad: Granularidad = dias <= 31 ? 'dia' : dias <= 190 ? 'semana' : 'mes'

  const conteo = new Map<string, number>()
  for (const fecha of fechas) {
    const clave = claveDeFecha(inicioDeBalde(fecha, granularidad))
    conteo.set(clave, (conteo.get(clave) ?? 0) + 1)
  }

  const puntos: PuntoColumna[] = []
  for (
    let cursor = inicioDeBalde(inicio, granularidad);
    cursor <= fin && puntos.length < 400;
    cursor = siguienteBalde(cursor, granularidad)
  ) {
    const clave = claveDeFecha(cursor)
    const { etiqueta, corta } = etiquetas(cursor, granularidad)
    puntos.push({ clave, etiqueta, etiquetaCorta: corta, valor: conteo.get(clave) ?? 0 })
  }
  return { puntos, granularidad }
}

export function describirRango({ inicio, fin }: Rango): string {
  const formato: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }
  if (!inicio && !fin) return 'Todos los reportes'
  if (inicio && fin) {
    return `Del ${inicio.toLocaleDateString('es-CL', formato)} al ${fin.toLocaleDateString('es-CL', formato)}`
  }
  if (inicio) return `Desde el ${inicio.toLocaleDateString('es-CL', formato)}`
  return `Hasta el ${fin!.toLocaleDateString('es-CL', formato)}`
}
