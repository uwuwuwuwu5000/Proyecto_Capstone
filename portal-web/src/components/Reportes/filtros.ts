import type { Reporte } from './reporte'

export const SIN_OPERADOR = '__sin_operador__'

export interface Filtros {
  texto: string
  categoria: string
  estado: string
  // '' = todos, SIN_OPERADOR = solo sin asignar, o el id de un operador.
  operador: string
  foto: '' | 'con' | 'sin'
  desde: string
  hasta: string
}

export const FILTROS_VACIOS: Filtros = {
  texto: '',
  categoria: '',
  estado: '',
  operador: '',
  foto: '',
  desde: '',
  hasta: '',
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
    if (filtros.operador === SIN_OPERADOR && r.operadorId) return false
    if (filtros.operador && filtros.operador !== SIN_OPERADOR && r.operadorId !== filtros.operador) {
      return false
    }
    if (filtros.foto === 'con' && !r.foto) return false
    if (filtros.foto === 'sin' && r.foto) return false
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
