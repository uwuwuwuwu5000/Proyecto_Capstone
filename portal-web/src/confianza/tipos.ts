// Datos del sistema de confianza tal como se guardan en Firestore.
import type { Timestamp } from 'firebase/firestore'

/** Mapa `validacion` de un reporte. Un reporte antiguo no lo tiene (equivale a ceros). */
export interface Validacion {
  puntos: number
  votos: number
  validado: boolean
  validadoAt: Date | null
  veredicto: 'real' | 'falso' | null
  veredictoPor: string | null
  veredictoAt: Date | null
  veredictoComentario: string | null
  /** Puntos realmente aplicados al autor con el veredicto (puede ser menos que 10 o 15). */
  veredictoPuntos: number | null
}

export const VALIDACION_VACIA: Validacion = {
  puntos: 0,
  votos: 0,
  validado: false,
  validadoAt: null,
  veredicto: null,
  veredictoPor: null,
  veredictoAt: null,
  veredictoComentario: null,
  veredictoPuntos: null,
}

/** Mapa `validacion` de un reporte nuevo, como lo exigen las reglas (todo en cero). */
export const VALIDACION_INICIAL = {
  puntos: 0,
  votos: 0,
  validado: false,
  validadoAt: null,
  veredicto: null,
} as const

/** `users/{uid}/confianza/actual`. Sin documento equivale a `CONFIANZA_VACIA`. */
export interface Confianza {
  puntosConfianza: number
  trustLevel: number
  validatedReports: number
  reportesFalsos: number
  confirmacionesSuspendidas: boolean
}

export const CONFIANZA_VACIA: Confianza = {
  puntosConfianza: 0,
  trustLevel: 0,
  validatedReports: 0,
  reportesFalsos: 0,
  confirmacionesSuspendidas: false,
}

/** `users/{uid}/limites/{día}`. */
export interface LimiteDelDia {
  confirmaciones: number
  ultimaAt: Date | null
}

const aFecha = (v: unknown): Date | null =>
  v && typeof (v as Timestamp).toDate === 'function' ? (v as Timestamp).toDate() : null

const aNumero = (v: unknown, defecto: number): number => (typeof v === 'number' ? v : defecto)

/** Lee el mapa `validacion` de un documento de reporte, con ceros donde falte. */
export function leerValidacion(valor: unknown): Validacion {
  const v = (valor ?? {}) as Record<string, unknown>
  return {
    puntos: aNumero(v.puntos, 0),
    votos: aNumero(v.votos, 0),
    validado: v.validado === true,
    validadoAt: aFecha(v.validadoAt),
    veredicto: v.veredicto === 'real' || v.veredicto === 'falso' ? v.veredicto : null,
    veredictoPor: typeof v.veredictoPor === 'string' ? v.veredictoPor : null,
    veredictoAt: aFecha(v.veredictoAt),
    veredictoComentario: typeof v.veredictoComentario === 'string' ? v.veredictoComentario : null,
    veredictoPuntos: typeof v.veredictoPuntos === 'number' ? v.veredictoPuntos : null,
  }
}

/** Lee `confianza/actual`, con ceros donde falte. */
export function leerConfianza(valor: unknown): Confianza {
  const v = (valor ?? {}) as Record<string, unknown>
  return {
    puntosConfianza: aNumero(v.puntosConfianza, 0),
    trustLevel: aNumero(v.trustLevel, 0),
    validatedReports: aNumero(v.validatedReports, 0),
    reportesFalsos: aNumero(v.reportesFalsos, 0),
    confirmacionesSuspendidas: v.confirmacionesSuspendidas === true,
  }
}
