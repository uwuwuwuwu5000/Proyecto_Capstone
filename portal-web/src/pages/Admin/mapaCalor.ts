// Cálculos del mapa de calor por comuna (sin React ni Firestore, para poder probarlos aparte).
import type { Reporte } from '../../components/Reportes/reporte'

/** Estados que ya no requieren trabajo: resuelto y cerrado. Todo lo demás está «sin resolver». */
const ESTADOS_TERMINADOS = new Set(['resuelto', 'cerrado'])

export interface ComunaCatalogo {
  codigo: string
  nombre: string
  codigoRegion: string
  region: string
  organismoId: string
}

export interface EstadisticaComuna {
  codigo: string
  total: number
  sinResolver: number
  resueltos: number
  cerrados: number
  porCategoria: Record<string, number>
  reportes: Reporte[]
}

export interface ResultadoAgrupacion {
  porComuna: Map<string, EstadisticaComuna>
  /** Reportes que no se pudieron ubicar en una comuna (sin organismo municipal ni nombre reconocible). */
  sinComuna: number
}

/** "Ñuñoa" → "nunoa": para comparar nombres sin tildes ni mayúsculas. */
export function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
}

function vacia(codigo: string): EstadisticaComuna {
  return { codigo, total: 0, sinResolver: 0, resueltos: 0, cerrados: 0, porCategoria: {}, reportes: [] }
}

/**
 * Comuna de un reporte: primero por el organismo municipal («muni_13101» → 13101),
 * que es el dato fiable; si no, por el nombre de la comuna.
 */
export function codigoDeComuna(reporte: Reporte, porNombre: Map<string, string>): string | null {
  const desdeOrganismo = /^muni_(\d{5})$/.exec(reporte.organismoId ?? '')?.[1]
  if (desdeOrganismo) return desdeOrganismo
  return reporte.comuna ? (porNombre.get(normalizar(reporte.comuna)) ?? null) : null
}

export function agruparPorComuna(reportes: Reporte[], catalogo: ComunaCatalogo[]): ResultadoAgrupacion {
  const porNombre = new Map(catalogo.map((c) => [normalizar(c.nombre), c.codigo]))
  const porComuna = new Map<string, EstadisticaComuna>()
  let sinComuna = 0

  for (const r of reportes) {
    const codigo = codigoDeComuna(r, porNombre)
    if (!codigo) {
      sinComuna++
      continue
    }
    const e = porComuna.get(codigo) ?? vacia(codigo)
    e.total++
    if (r.estado === 'resuelto') e.resueltos++
    else if (r.estado === 'cerrado') e.cerrados++
    if (!ESTADOS_TERMINADOS.has(r.estado)) e.sinResolver++
    e.porCategoria[r.categoria] = (e.porCategoria[r.categoria] ?? 0) + 1
    e.reportes.push(r)
    porComuna.set(codigo, e)
  }
  return { porComuna, sinComuna }
}

/** Intensidad (0 = sin reportes sin resolver; 1–5 = de menos a más) según el máximo de la región. */
export function tramoDeIntensidad(valor: number, maximo: number): number {
  if (valor <= 0 || maximo <= 0) return 0
  return Math.min(5, Math.max(1, Math.ceil((valor / maximo) * 5)))
}

/** Límites de cada tramo, para la leyenda: [[1, 3], [4, 6], …]. */
export function rangosDeTramos(maximo: number): [number, number][] {
  const rangos: [number, number][] = []
  let desde = 1
  for (let t = 1; t <= 5; t++) {
    const hasta = Math.max(desde, Math.ceil((maximo * t) / 5))
    rangos.push([desde, hasta])
    desde = hasta + 1
  }
  return rangos
}

/** Colores del mapa: rojo de alerta del portal, de menos a más intenso. */
const ROJO = '224, 101, 107'
const OPACIDAD_RELLENO = [0.1, 0.22, 0.38, 0.55, 0.72, 0.9]

export function colorDeTramo(tramo: number): { relleno: string; borde: string } {
  if (tramo <= 0) return { relleno: 'rgba(17, 24, 39, 0.08)', borde: 'rgba(92, 103, 125, 0.95)' }
  return { relleno: `rgba(${ROJO}, ${OPACIDAD_RELLENO[tramo]})`, borde: `rgba(${ROJO}, 1)` }
}
