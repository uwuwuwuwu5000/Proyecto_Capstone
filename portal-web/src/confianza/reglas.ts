// Reglas del sistema de confianza (sistema_confianza.md, secciones 4 y 5).
//
// Los números y los cálculos viven en `comun/` (paquete compartido con la app
// móvil), así que el portal y la app calculan exactamente lo mismo. Este
// archivo los expone con los nombres y la forma que usa el portal, y agrega
// solo lo que `comun` entrega de otra manera. Todo debe coincidir con las
// funciones de firestore.rules (nivelDePuntos, pesoDeNivel, limiteDiario,
// numeroDeDia…): rules-tests/paridad.test.ts lo comprueba contra el emulador.
import {
  NIVELES,
  PARAMETROS_CONFIANZA as P,
  cuentaEsAntigua,
  limiteDiario,
  nivelDePuntos,
  numeroDeDia as numeroDeDiaComun,
  pesoDeNivel,
  pesoDeVoto,
  porcentajeDeValidacion,
  progresoDeNivel,
  puntosTrasVeredicto,
  sumarConfirmacion,
} from '@ciudad-alerta/comun'

export { limiteDiario, nivelDePuntos, pesoDeNivel }

/** Puntos de confianza mínimos de cada nivel (índice = nivel, 0 a 10). */
export const UMBRALES_NIVEL: readonly number[] = NIVELES.map((n) => n.puntosMinimos)

export const NIVEL_MAXIMO = NIVELES.length - 1
export const PUNTOS_MAXIMOS = P.puntosMaximos

/** Puntos que da un veredicto «real» y que quita uno «falso» (en positivo). */
export const PUNTOS_POR_REAL = P.puntosPorReporteReal
export const PUNTOS_POR_FALSO = -P.puntosPorReporteFalso

/** Peso de un voto de nivel 0 y su tope. */
export const PESO_BASE = P.pesoBase
export const PESO_MAXIMO = P.pesoMaximo

/** Suma de pesos y personas distintas para que un reporte quede validado. */
export const PUNTOS_PARA_VALIDAR = P.puntosParaValidar
export const PERSONAS_PARA_VALIDAR = P.votosParaValidar

/** Pausa entre dos confirmaciones y antigüedad mínima de la cuenta para que su voto pese. */
export const PAUSA_ENTRE_CONFIRMACIONES_MS = P.pausaEntreConfirmacionesMs
export const ANTIGUEDAD_MINIMA_MS = P.antiguedadMinimaMs

/** Desfase fijo UTC−3 con el que se define el «día» del límite diario. */
export const DESFASE_DIA_MS = P.desfaseDiaMs

/** Número de día (UTC−3): identifica el documento `users/{uid}/limites/{día}`. Sin argumento, hoy. */
export function numeroDeDia(ahoraMs: number = Date.now()): number {
  return numeroDeDiaComun(ahoraMs)
}

/** Puntos que faltan para el siguiente nivel; null si ya está en el máximo. */
export function puntosParaSiguienteNivel(puntos: number): number | null {
  const progreso = progresoDeNivel(puntos)
  return progreso.hasta === null ? null : progreso.faltan
}

/** Peso real del voto: el del nivel, o 0 si el correo no está verificado o la cuenta es nueva. */
export function pesoDelVoto(
  nivel: number,
  correoVerificado: boolean,
  creadaEnMs: number | null,
  ahoraMs: number = Date.now(),
): number {
  return pesoDeVoto({ nivel, correoVerificado, cuentaAntigua: cuentaEsAntigua(creadaEnMs, ahoraMs) }).peso
}

/** Resultado de sumar un voto al mapa `validacion` de un reporte. */
export interface ValidacionSumada {
  puntos: number
  votos: number
  validado: boolean
  /** true solo si este voto fue el que lo dejó validado. */
  recienValidado: boolean
}

/**
 * Suma un voto: los puntos suben en el peso, las personas en 1 solo si el peso
 * es mayor que 0, y se valida con 100 puntos y 3 personas (nunca se des-valida).
 */
export function sumarVoto(
  antes: { puntos: number; votos: number; validado: boolean },
  peso: number,
): ValidacionSumada {
  return sumarConfirmacion(antes, peso)
}

/** Resultado de aplicar un veredicto a los puntos del autor. */
export interface PuntosTrasVeredicto {
  puntos: number
  nivel: number
  /** Lo que realmente se sumó o restó (distinto de ±10/15 en el piso y el tope). */
  aplicados: number
}

/** Aplica «real» (+10, hasta 760) o «falso» (−15, hasta 0) a los puntos del autor. */
export function aplicarVeredicto(puntosActuales: number, veredicto: 'real' | 'falso'): PuntosTrasVeredicto {
  const puntos = puntosTrasVeredicto(puntosActuales, veredicto)
  return { puntos, nivel: nivelDePuntos(puntos), aplicados: puntos - puntosActuales }
}

/** Porcentaje de verificación que se muestra (0 a 100, sin exceder). */
export function porcentajeVerificacion(puntos: number): number {
  return porcentajeDeValidacion({ puntos })
}
