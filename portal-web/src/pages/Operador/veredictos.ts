// «Por veredicto»: filtros, orden y URL de la lista de reportes pendientes (interfaz del portal).
//
// Los cálculos (qué reportes están pendientes, cuánto llevan esperando, cuánto tardó el veredicto, de
// «En revisión» a cierre) viven en `@ciudad-alerta/comun` (reportes/veredictos.ts), compartidos con la
// app; aquí se vuelven a exportar para que la pantalla y los hooks los importen desde un solo lugar.
import { esperaActual } from '@ciudad-alerta/comun'
import type { Reporte } from '../../components/Reportes/reporte'

export {
  UMBRAL_DEMORADO_HORAS,
  esPendienteDeVeredicto,
  esperaActual,
  estaDemorado,
  fechaDeEstado,
  resumenDeTiempos,
  tiempoHastaVeredicto,
  tiempoRevisionACierre,
  veredictoEnRango,
} from '@ciudad-alerta/comun'
export type { RangoDeFechas, ResumenDeTiempos, TiempoRevisionACierre } from '@ciudad-alerta/comun'
import { fechaDeEstado, resumenDeTiempos, tiempoRevisionACierre } from '@ciudad-alerta/comun'
import type { RangoDeFechas, ResumenDeTiempos } from '@ciudad-alerta/comun'
import type { CambioEstado } from '../../components/Reportes/historial'

const HORA_MS = 3_600_000

// ---------------------------------------------------------------------------
// Filtros y orden de la lista
// ---------------------------------------------------------------------------

export type FiltroEspera = '' | '24h' | '48h' | '7d'
export type FiltroFoto = '' | 'con' | 'sin'
export type OrdenPendientes = 'antiguos' | 'votos' | 'recientes'

export interface FiltrosPendientes {
  categoria: string
  comuna: string
  /** Solo los que llevan al menos este tiempo esperando. */
  espera: FiltroEspera
  texto: string
  foto: FiltroFoto
  orden: OrdenPendientes
}

export const FILTROS_PENDIENTES_VACIOS: FiltrosPendientes = {
  categoria: '',
  comuna: '',
  espera: '',
  texto: '',
  foto: '',
  orden: 'antiguos',
}

const HORAS_DE_ESPERA: Record<Exclude<FiltroEspera, ''>, number> = { '24h': 24, '48h': 48, '7d': 7 * 24 }
const ESPERAS: readonly string[] = ['24h', '48h', '7d']
const FOTOS: readonly string[] = ['con', 'sin']
const ORDENES: readonly string[] = ['antiguos', 'votos', 'recientes']

/** Minúsculas y sin tildes, para buscar texto. */
const normalizar = (texto: string) =>
  texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()

/** Aplica los filtros (no el orden). Los que no tienen fecha de validación no pasan el filtro de espera. */
export function filtrarPendientes(
  reportes: readonly Reporte[],
  filtros: FiltrosPendientes,
  ahora: number,
): Reporte[] {
  const texto = normalizar(filtros.texto)
  const minimo = filtros.espera ? HORAS_DE_ESPERA[filtros.espera] * HORA_MS : null
  return reportes.filter((r) => {
    if (filtros.categoria && r.categoria !== filtros.categoria) return false
    if (filtros.comuna && r.comuna !== filtros.comuna) return false
    if (minimo !== null) {
      const espera = esperaActual(r, ahora)
      if (espera === null || espera < minimo) return false
    }
    if (texto && !normalizar(r.descripcion).includes(texto)) return false
    if (filtros.foto === 'con' && !r.foto) return false
    if (filtros.foto === 'sin' && r.foto) return false
    return true
  })
}

const validadoMs = (r: Reporte) => r.validacion.validadoAt?.getTime() ?? null

/** Devuelve una copia ordenada; los reportes sin fecha de validación quedan al final en los órdenes por fecha. */
export function ordenarPendientes(reportes: readonly Reporte[], orden: OrdenPendientes): Reporte[] {
  const copia = [...reportes]
  const porFecha = (sentido: 1 | -1) => (a: Reporte, b: Reporte) => {
    const fa = validadoMs(a)
    const fb = validadoMs(b)
    if (fa === null && fb === null) return 0
    if (fa === null) return 1
    if (fb === null) return -1
    return (fa - fb) * sentido
  }
  if (orden === 'antiguos') return copia.sort(porFecha(1))
  if (orden === 'recientes') return copia.sort(porFecha(-1))
  // 'votos': más puntos primero y, si empatan, más votos; después, los que esperan hace más.
  return copia.sort(
    (a, b) =>
      b.validacion.puntos - a.validacion.puntos ||
      b.validacion.votos - a.validacion.votos ||
      porFecha(1)(a, b),
  )
}

export function hayFiltrosActivos(f: FiltrosPendientes): boolean {
  return !!(f.categoria || f.comuna || f.espera || f.texto.trim() || f.foto)
}

/** Lee los filtros de la URL (`?cat=&comuna=&espera=&q=&foto=&orden=`); lo que no sea válido se ignora. */
export function filtrosDeUrl(params: URLSearchParams): FiltrosPendientes {
  const espera = params.get('espera') ?? ''
  const foto = params.get('foto') ?? ''
  const orden = params.get('orden') ?? ''
  return {
    categoria: params.get('cat') ?? '',
    comuna: params.get('comuna') ?? '',
    espera: ESPERAS.includes(espera) ? (espera as FiltroEspera) : '',
    texto: params.get('q') ?? '',
    foto: FOTOS.includes(foto) ? (foto as FiltroFoto) : '',
    orden: ORDENES.includes(orden) ? (orden as OrdenPendientes) : FILTROS_PENDIENTES_VACIOS.orden,
  }
}

/** Escribe en la URL solo lo que no es el valor por defecto. */
export function filtrosAUrl(f: FiltrosPendientes): URLSearchParams {
  const params = new URLSearchParams()
  if (f.categoria) params.set('cat', f.categoria)
  if (f.comuna) params.set('comuna', f.comuna)
  if (f.espera) params.set('espera', f.espera)
  if (f.texto) params.set('q', f.texto)
  if (f.foto) params.set('foto', f.foto)
  if (f.orden !== FILTROS_PENDIENTES_VACIOS.orden) params.set('orden', f.orden)
  return params
}


// ---------------------------------------------------------------------------
// Revisión a cierre: cuánto tardan los reportes desde «En revisión» hasta «Cerrado»
// ---------------------------------------------------------------------------

/**
 * Cuántos reportes cerrados se leen, como máximo, para medir la revisión a cierre: cada uno cuesta
 * una lectura de su historial. Se toman los cerrados más recientes del periodo.
 */
export const MAXIMO_HISTORIALES_REVISION = 150

/**
 * De los reportes cerrados del operador, los que vale la pena revisar para un periodo: los que se
 * actualizaron desde su inicio (un reporte cerrado deja de cambiar, así que su última actualización
 * aproxima su cierre), de los más recientes a los más antiguos y hasta `maximo`. Los que no traen la
 * fecha no se descartan. La fecha exacta del cierre se comprueba después con el historial.
 */
export function candidatosDeRevision(
  cerrados: readonly Reporte[],
  { inicio }: RangoDeFechas,
  maximo = MAXIMO_HISTORIALES_REVISION,
): { candidatos: Reporte[]; hayMas: boolean } {
  const ms = (r: Reporte) => r.actualizadoAt?.getTime() ?? null
  const desde = inicio?.getTime() ?? null
  const posibles = cerrados
    .filter((r) => desde === null || ms(r) === null || (ms(r) as number) >= desde)
    .sort((a, b) => {
      const fa = ms(a)
      const fb = ms(b)
      if (fa === null && fb === null) return 0
      if (fa === null) return 1
      if (fb === null) return -1
      return fb - fa
    })
  return { candidatos: posibles.slice(0, maximo), hayMas: posibles.length > maximo }
}

export interface RevisionACierreDelPeriodo {
  /** Desde «En revisión» hasta «Cerrado», de los reportes que pasaron por «En revisión». */
  cierre: ResumenDeTiempos
  /** Desde «En revisión» hasta «Resuelto», de los que además pasaron por «Resuelto». */
  resuelto: ResumenDeTiempos
  /** Cerrados cuyo cierre cae en el periodo y cuyo historial ya se leyó. */
  enPeriodo: number
  /** De esos, los que nunca pasaron por «En revisión» (por ejemplo, de «Reportado» a «Derivado» o «Cerrado»): no se pueden medir. */
  sinRevision: number
}

/**
 * Tiempos de revisión a cierre de los reportes cerrados cuyo cierre cae en el periodo (por la fecha
 * de su entrada «Cerrado» en el historial). Los reportes sin historial leído todavía no cuentan.
 */
export function revisionACierreDelPeriodo(
  historiales: ReadonlyMap<string, readonly CambioEstado[]>,
  candidatos: readonly Reporte[],
  { inicio, fin }: RangoDeFechas,
): RevisionACierreDelPeriodo {
  const cierres: Array<number | null> = []
  const resueltos: number[] = []
  let enPeriodo = 0
  let sinRevision = 0
  for (const reporte of candidatos) {
    // Retirado por su autor: nadie del organismo lo atendió, no hay revisión que medir.
    if (reporte.retiradoPorAutor) continue
    const cambios = historiales.get(reporte.id)
    if (!cambios) continue
    const cerradoEn = fechaDeEstado(cambios, 'cerrado')
    if (!cerradoEn) continue
    if ((inicio && cerradoEn < inicio) || (fin && cerradoEn > fin)) continue
    enPeriodo += 1
    const t = tiempoRevisionACierre(cambios)
    if (!t.pasoPorRevision) {
      sinRevision += 1
      continue
    }
    cierres.push(t.aCierreMs)
    if (t.aResueltoMs !== null) resueltos.push(t.aResueltoMs)
  }
  return { cierre: resumenDeTiempos(cierres), resuelto: resumenDeTiempos(resueltos), enPeriodo, sinRevision }
}
