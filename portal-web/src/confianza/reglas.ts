// Reglas del sistema de confianza (ver sistema_confianza.md, secciones 4 y 5).
//
// Funciones puras, sin acceso a la base de datos. Deben dar exactamente el
// mismo resultado que las funciones de firestore.rules (nivelDePuntos,
// pesoDeNivel, limiteDiario, numeroDeDia, validacionInicial…): las pruebas de
// rules-tests/paridad.test.ts lo comprueban contra el emulador.

/** Puntos de confianza mínimos de cada nivel (índice = nivel, 0 a 10). */
export const UMBRALES_NIVEL = [0, 40, 80, 130, 190, 260, 340, 430, 530, 640, 760] as const

export const NIVEL_MAXIMO = 10
export const PUNTOS_MAXIMOS = 760

/** Puntos que da un veredicto «real» y que quita uno «falso». */
export const PUNTOS_POR_REAL = 10
export const PUNTOS_POR_FALSO = 15

/** Peso de un voto de nivel 0 y su tope. */
export const PESO_BASE = 10
export const PESO_MAXIMO = 34

/** Suma de pesos y personas distintas para que un reporte quede validado. */
export const PUNTOS_PARA_VALIDAR = 100
export const PERSONAS_PARA_VALIDAR = 3

/** Pausa entre dos confirmaciones y antigüedad mínima de la cuenta para que su voto pese. */
export const PAUSA_ENTRE_CONFIRMACIONES_MS = 20_000
export const ANTIGUEDAD_MINIMA_MS = 86_400_000

/** Desfase fijo UTC−3 con el que se define el «día» del límite diario. */
export const DESFASE_DIA_MS = 3 * 3_600_000
const MS_POR_DIA = 86_400_000

/** Nivel (0 a 10) que corresponde a unos puntos de confianza. */
export function nivelDePuntos(puntos: number): number {
  let nivel = 0
  for (let n = 1; n <= NIVEL_MAXIMO; n++) {
    if (puntos >= UMBRALES_NIVEL[n]) nivel = n
  }
  return nivel
}

/** Puntos que faltan para el siguiente nivel; null si ya está en el máximo. */
export function puntosParaSiguienteNivel(puntos: number): number | null {
  const nivel = nivelDePuntos(puntos)
  return nivel >= NIVEL_MAXIMO ? null : UMBRALES_NIVEL[nivel + 1] - puntos
}

/** Peso de una confirmación: 10 × (1 + 0,25 × nivel), con tope en 34. */
export function pesoDeNivel(nivel: number): number {
  return nivel >= NIVEL_MAXIMO ? PESO_MAXIMO : PESO_BASE + 2.5 * nivel
}

/** Confirmaciones permitidas por día según el nivel. */
export function limiteDiario(nivel: number): number {
  if (nivel === 0) return 5
  if (nivel === 1) return 8
  if (nivel <= 3) return 12
  if (nivel <= 6) return 20
  return 30
}

/**
 * Número de día con desfase fijo UTC−3: identifica el documento
 * `users/{uid}/limites/{día}`. La división entera trunca, igual que en las reglas.
 */
export function numeroDeDia(ahoraMs: number = Date.now()): number {
  return Math.floor((ahoraMs - DESFASE_DIA_MS) / MS_POR_DIA)
}

/** Peso real del voto: el del nivel, o 0 si el correo no está verificado o la cuenta es nueva. */
export function pesoDelVoto(
  nivel: number,
  correoVerificado: boolean,
  creadaEnMs: number | null,
  ahoraMs: number = Date.now(),
): number {
  const antigua = creadaEnMs !== null && ahoraMs - creadaEnMs >= ANTIGUEDAD_MINIMA_MS
  return correoVerificado && antigua ? pesoDeNivel(nivel) : 0
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
  const puntos = antes.puntos + peso
  const votos = antes.votos + (peso > 0 ? 1 : 0)
  const validado = antes.validado || (puntos >= PUNTOS_PARA_VALIDAR && votos >= PERSONAS_PARA_VALIDAR)
  return { puntos, votos, validado, recienValidado: validado && !antes.validado }
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
  const puntos =
    veredicto === 'real'
      ? Math.min(PUNTOS_MAXIMOS, puntosActuales + PUNTOS_POR_REAL)
      : Math.max(0, puntosActuales - PUNTOS_POR_FALSO)
  return { puntos, nivel: nivelDePuntos(puntos), aplicados: puntos - puntosActuales }
}

/** Porcentaje de verificación que se muestra (0 a 100, sin exceder). */
export function porcentajeVerificacion(puntos: number): number {
  return Math.min(100, Math.round((puntos / PUNTOS_PARA_VALIDAR) * 100))
}
