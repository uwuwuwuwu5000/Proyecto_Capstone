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
  resumenDeTiempos,
  tiempoHastaVeredicto,
  tiempoRevisionACierre,
  veredictoEnRango,
} from '@ciudad-alerta/comun'
export type { RangoDeFechas, ResumenDeTiempos, TiempoRevisionACierre } from '@ciudad-alerta/comun'

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
