/**
 * Tabla única del sistema de confianza (sistema_confianza.md, sección 4).
 *
 * IMPORTANTE: las reglas de Firestore repiten estos números en las funciones
 * `nivelDePuntos`, `pesoDeNivel`, `limiteDiario`, `numeroDeDia` y en
 * `confirmacionConPesoValida` / `sumaDeConfirmacionValida`. Las reglas son las
 * que mandan: si se cambia un número aquí y no allá, la app calcula un valor
 * que las reglas rechazan. `npm run diagnostico` compara ambos lados.
 *
 * Este archivo no importa nada de Angular ni de Firebase: el portal web puede
 * copiarlo o importarlo tal cual.
 */

export interface DefinicionNivel {
  readonly nivel: number;
  readonly nombre: string;
  /** Puntos de confianza (PC) desde los que se alcanza el nivel. */
  readonly puntosMinimos: number;
}

/** 4.1 · Niveles y puntos de confianza. */
export const NIVELES: readonly DefinicionNivel[] = [
  { nivel: 0, nombre: 'Vecino nuevo', puntosMinimos: 0 },
  { nivel: 1, nombre: 'Vecino', puntosMinimos: 40 },
  { nivel: 2, nombre: 'Colaborador', puntosMinimos: 80 },
  { nivel: 3, nombre: 'Colaborador activo', puntosMinimos: 130 },
  { nivel: 4, nombre: 'Vigía', puntosMinimos: 190 },
  { nivel: 5, nombre: 'Vigía confiable', puntosMinimos: 260 },
  { nivel: 6, nombre: 'Guardián de barrio', puntosMinimos: 340 },
  { nivel: 7, nombre: 'Guardián confiable', puntosMinimos: 430 },
  { nivel: 8, nombre: 'Referente', puntosMinimos: 530 },
  { nivel: 9, nombre: 'Referente destacado', puntosMinimos: 640 },
  { nivel: 10, nombre: 'Guardián de la ciudad', puntosMinimos: 760 },
];

/** 4.5 · Confirmaciones por día: el primer tramo cuyo `hastaNivel` alcanza el nivel. */
export const LIMITES_DIARIOS: readonly { readonly hastaNivel: number; readonly confirmaciones: number }[] = [
  { hastaNivel: 0, confirmaciones: 5 },
  { hastaNivel: 1, confirmaciones: 8 },
  { hastaNivel: 3, confirmaciones: 12 },
  { hastaNivel: 6, confirmaciones: 20 },
  { hastaNivel: 10, confirmaciones: 30 },
];

export const PARAMETROS_CONFIANZA = {
  /** Tope de PC: el umbral del nivel 10. */
  puntosMaximos: 760,

  /** 4.2 · peso = base + porNivel × nivel, con tope (10 × (1 + 0,25 × nivel)). */
  pesoBase: 10,
  pesoPorNivel: 2.5,
  pesoMaximo: 34,

  /** 4.3 · Validado = puntos ≥ 100 y al menos 3 personas con peso > 0. */
  puntosParaValidar: 100,
  votosParaValidar: 3,

  /** 4.4 · Efecto de un veredicto en los PC del autor. */
  puntosPorReporteReal: 10,
  puntosPorReporteFalso: -15,

  /** 4.5 · Pausa entre dos confirmaciones del mismo usuario. */
  pausaEntreConfirmacionesMs: 20_000,

  /** Sin correo verificado o con una cuenta de menos de 24 h, el voto pesa 0. */
  antiguedadMinimaMs: 86_400_000,

  /** El «día» del contador empieza a las 00:00 con desfase fijo UTC−3. */
  desfaseDiaMs: 10_800_000,
  duracionDiaMs: 86_400_000,
} as const;
