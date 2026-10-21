// Regla del portal: un reporte no cambia de estado hasta que tiene veredicto
// (real o falso). Es una regla de interfaz y de `cambiarEstadoReporte`; las
// reglas de Firestore no la exigen, así que la app móvil podría seguir
// cambiando estados (ver correcciones.md).
import { TRANSICIONES } from '../constants/reportes'
import type { Reporte } from '../components/Reportes/reporte'

export const MENSAJE_SIN_VEREDICTO =
  'Para cambiar el estado de este reporte, primero da un veredicto: real o falso.'

export class ErrorSinVeredicto extends Error {
  constructor() {
    super(MENSAJE_SIN_VEREDICTO)
    this.name = 'ErrorSinVeredicto'
  }
}

/**
 * Mensaje si el reporte todavía no puede cambiar de estado por falta de
 * veredicto; null si puede. Quedan exentos los reportes que no admiten
 * veredicto: los que creó un administrador desde el portal (no suman puntos) y
 * los propios de quien gestiona (nadie da veredicto a su propio reporte).
 */
export function motivoSinVeredicto(reporte: Reporte, gestorUid: string | null | undefined): string | null {
  if (reporte.validacion.veredicto !== null) return null
  if (reporte.origen === 'portal_admin') return null
  if (gestorUid && reporte.uid === gestorUid) return null
  return MENSAJE_SIN_VEREDICTO
}

/** Estados a los que puede pasar el reporte ahora (ninguno mientras falte el veredicto). */
export function siguientesEstados(reporte: Reporte, gestorUid: string | null | undefined): string[] {
  return motivoSinVeredicto(reporte, gestorUid) ? [] : (TRANSICIONES[reporte.estado] ?? [])
}
