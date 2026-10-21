import type { Reporte } from './reporte'

export const SIN_OPERADOR = '__sin_operador__'

export type Verificacion = '' | 'validados' | 'por_verificar' | 'real' | 'falso' | 'sin_veredicto'

const VERIFICACIONES: readonly string[] = ['validados', 'por_verificar', 'real', 'falso', 'sin_veredicto']

/** Valor de `?verificacion=` de la URL, o '' si no es uno de los conocidos. */
export function verificacionDeUrl(valor: string | null): Verificacion {
  return valor !== null && VERIFICACIONES.includes(valor) ? (valor as Verificacion) : ''
}

export interface Filtros {
  texto: string
  categoria: string
  estado: string
  /** Nombre de la comuna tal como lo guarda el reporte; '' = todas (solo el admin la usa). */
  comuna: string
  // '' = todos, SIN_OPERADOR = solo sin asignar, o el id de un operador.
  operador: string
  foto: '' | 'con' | 'sin'
  /**
   * Verificación y veredicto: '' = todos; 'validados' = validados por la
   * comunidad; 'por_verificar' = validados que aún no tienen veredicto;
   * 'real' / 'falso' = con ese veredicto; 'sin_veredicto' = cualquier reporte
   * que aún no tiene veredicto.
   */
  verificacion: Verificacion
  desde: string
  hasta: string
}

export const FILTROS_VACIOS: Filtros = {
  texto: '',
  categoria: '',
  estado: '',
  comuna: '',
  operador: '',
  foto: '',
  verificacion: '',
  desde: '',
  hasta: '',
}

/** Los filtros de verificación que la página termina de aplicar (el servidor no puede). */
const VERIFICACION_LOCAL: readonly Verificacion[] = ['por_verificar', 'sin_veredicto']

/**
 * Texto y foto no se pueden filtrar en Firestore: actúan sobre la página
 * cargada. «Por verificar» y «Sin veredicto» tampoco del todo: los reportes
 * anteriores al sistema de confianza no tienen el campo `veredicto`, y una
 * consulta por `veredicto == null` no los encontraría; el servidor trae los
 * validados (o todos) y la página oculta los que ya tienen veredicto.
 */
export function filtrosLocalesActivos(filtros: Filtros): boolean {
  return (
    filtros.texto.trim() !== '' || filtros.foto !== '' || VERIFICACION_LOCAL.includes(filtros.verificacion)
  )
}

/** Deja solo texto y foto; el resto ya lo filtró el servidor. */
export function soloFiltrosLocales(filtros: Filtros): Filtros {
  return { ...FILTROS_VACIOS, texto: filtros.texto, foto: filtros.foto, verificacion: filtros.verificacion }
}

export function hayFiltrosActivos(filtros: Filtros): boolean {
  return Object.entries(filtros).some(([clave, valor]) =>
    clave === 'texto' ? valor.trim() !== '' : valor !== '',
  )
}

export function filtrarReportes(reportes: Reporte[], filtros: Filtros): Reporte[] {
  const texto = filtros.texto.trim().toLowerCase()
  const desde = filtros.desde ? new Date(`${filtros.desde}T00:00:00`) : null
  const hasta = filtros.hasta ? new Date(`${filtros.hasta}T23:59:59`) : null

  return reportes.filter((r) => {
    if (filtros.categoria && r.categoria !== filtros.categoria) return false
    if (filtros.estado && r.estado !== filtros.estado) return false
    if (filtros.comuna && r.comuna !== filtros.comuna) return false
    if (filtros.operador === SIN_OPERADOR && r.operadorId) return false
    if (filtros.operador && filtros.operador !== SIN_OPERADOR && r.operadorId !== filtros.operador) {
      return false
    }
    if (filtros.foto === 'con' && !r.foto) return false
    if (filtros.foto === 'sin' && r.foto) return false
    if ((filtros.verificacion === 'validados' || filtros.verificacion === 'por_verificar') && !r.validacion.validado) {
      return false
    }
    if (filtros.verificacion === 'real' && r.validacion.veredicto !== 'real') return false
    if (filtros.verificacion === 'falso' && r.validacion.veredicto !== 'falso') return false
    if (VERIFICACION_LOCAL.includes(filtros.verificacion) && r.validacion.veredicto !== null) return false
    if (desde && (!r.fecha || r.fecha < desde)) return false
    if (hasta && (!r.fecha || r.fecha > hasta)) return false
    if (
      texto &&
      ![r.descripcion, r.comuna, r.autorNombre ?? '', r.organismoId ?? '', r.id].some((campo) =>
        campo.toLowerCase().includes(texto),
      )
    ) {
      return false
    }
    return true
  })
}

/**
 * Texto bajo los filtros: cuántos reportes cumplen los filtros del servidor y,
 * si hay texto o foto, cuántos de la página los cumplen.
 */
export function resumenListado(
  total: number | null,
  enPagina: number,
  visibles: number,
  filtros: Filtros,
): string {
  const base =
    total === null
      ? 'Contando reportes…'
      : `${total.toLocaleString('es-CL')} ${total === 1 ? 'reporte' : 'reportes'}`
  if (!filtrosLocalesActivos(filtros)) return base
  if (VERIFICACION_LOCAL.includes(filtros.verificacion) && !filtros.texto.trim() && !filtros.foto) {
    const nombre = filtros.verificacion === 'por_verificar' ? 'Por verificar' : 'Sin veredicto'
    return `${base} · «${nombre}» oculta los que ya tienen veredicto: ${visibles} de los ${enPagina} de esta página`
  }
  return `${base} · la búsqueda de texto, foto y verificación filtra solo los ${enPagina} de esta página (${visibles} coinciden)`
}
