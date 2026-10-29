import { LIMITES_DIARIOS, NIVELES, PARAMETROS_CONFIANZA as P } from './parametros';

/**
 * Cálculos del sistema de confianza. Funciones puras, sin Angular, React ni
 * Firebase: dan exactamente lo mismo que las reglas de Firestore para que ni
 * la app ni el portal envíen algo que las reglas vayan a rechazar.
 */

/**
 * Lo que estos cálculos leen del mapa `validacion` de un reporte. Un campo que
 * falta vale 0, falso o null (reportes anteriores al sistema).
 */
export interface ValidacionMinima {
  puntos?: number;
  votos?: number;
  validado?: boolean;
  veredicto?: 'real' | 'falso' | null;
}

/** Nivel (0–10) para unos puntos de confianza. Regla `nivelDePuntos`. */
export function nivelDePuntos(puntos: number): number {
  let nivel = 0;
  for (const definicion of NIVELES) {
    if (puntos >= definicion.puntosMinimos) nivel = definicion.nivel;
  }
  return nivel;
}

export function nombreDeNivel(nivel: number): string {
  return NIVELES.find((n) => n.nivel === nivel)?.nombre ?? `Nivel ${nivel}`;
}

/** Peso de una confirmación según el nivel. Regla `pesoDeNivel`. */
export function pesoDeNivel(nivel: number): number {
  return Math.min(P.pesoBase + P.pesoPorNivel * nivel, P.pesoMaximo);
}

/** Confirmaciones permitidas por día. Regla `limiteDiario`. */
export function limiteDiario(nivel: number): number {
  const tramo = LIMITES_DIARIOS.find((t) => nivel <= t.hastaNivel);
  return (tramo ?? LIMITES_DIARIOS[LIMITES_DIARIOS.length - 1]).confirmaciones;
}

/**
 * Número del día con desfase UTC−3. Es el id del documento
 * `users/{uid}/limites/{día}`. Regla `numeroDeDia`.
 */
export function numeroDeDia(ahoraMs: number): number {
  return Math.floor((ahoraMs - P.desfaseDiaMs) / P.duracionDiaMs);
}

/** Momento en que empieza un día del contador (para decir cuándo se reinicia). */
export function inicioDeDia(dia: number): number {
  return dia * P.duracionDiaMs + P.desfaseDiaMs;
}

export type MotivoSinPeso = 'correo' | 'cuenta_nueva' | null;

/** La cuenta tiene al menos 24 horas. Sin fecha de creación, no lo es. */
export function cuentaEsAntigua(cuentaCreadaMs: number | null, ahoraMs: number): boolean {
  return cuentaCreadaMs !== null && ahoraMs - cuentaCreadaMs >= P.antiguedadMinimaMs;
}

/**
 * Peso real del voto: el del nivel, o 0 si el correo no está verificado (en el
 * token de sesión) o la cuenta tiene menos de 24 horas. Regla
 * `confirmacionConPesoValida`.
 */
export function pesoDeVoto(datos: {
  nivel: number;
  correoVerificado: boolean;
  cuentaAntigua: boolean;
}): { peso: number; motivoSinPeso: MotivoSinPeso } {
  if (!datos.correoVerificado) {
    return { peso: 0, motivoSinPeso: 'correo' };
  }

  if (!datos.cuentaAntigua) {
    return { peso: 0, motivoSinPeso: 'cuenta_nueva' };
  }

  return { peso: pesoDeNivel(datos.nivel), motivoSinPeso: null };
}

/** Lo que vale cada campo de `validacion` cuando falta. */
export function validacionCompleta(v: ValidacionMinima | undefined): {
  puntos: number;
  votos: number;
  validado: boolean;
  veredicto: 'real' | 'falso' | null;
} {
  return {
    puntos: v?.puntos ?? 0,
    votos: v?.votos ?? 0,
    validado: v?.validado ?? false,
    veredicto: v?.veredicto ?? null,
  };
}

/** Suma de una confirmación. Regla `sumaDeConfirmacionValida`. */
export function sumarConfirmacion(
  actual: ValidacionMinima | undefined,
  peso: number,
): { puntos: number; votos: number; validado: boolean; recienValidado: boolean } {
  const v = validacionCompleta(actual);
  const puntos = v.puntos + peso;
  const votos = v.votos + (peso > 0 ? 1 : 0);
  const validado = v.validado || (puntos >= P.puntosParaValidar && votos >= P.votosParaValidar);

  return { puntos, votos, validado, recienValidado: validado && !v.validado };
}

/** Porcentaje de verificación para la barra: 0 a 100, entero. */
export function porcentajeDeValidacion(v: ValidacionMinima | undefined): number {
  return Math.min(100, Math.round(validacionCompleta(v).puntos));
}

/** PC del autor después de un veredicto, con el tope y el piso. */
export function puntosTrasVeredicto(puntos: number, veredicto: 'real' | 'falso'): number {
  const delta = veredicto === 'real' ? P.puntosPorReporteReal : P.puntosPorReporteFalso;
  return Math.max(0, Math.min(P.puntosMaximos, puntos + delta));
}

/** Largo máximo del motivo de un veredicto. Regla `veredictoValido`. */
export const MOTIVO_VEREDICTO_MAXIMO = 512;

/**
 * El motivo limpio, o un error para mostrar. Falso exige un motivo con algo
 * más que espacios; real lo admite opcional (null si viene vacío).
 */
export function motivoDeVeredicto(
  veredicto: 'real' | 'falso',
  texto: string | null | undefined,
): { motivo: string | null; error: string | null } {
  const motivo = (texto ?? '').trim();

  if (motivo.length > MOTIVO_VEREDICTO_MAXIMO) {
    return { motivo: null, error: `El motivo puede tener hasta ${MOTIVO_VEREDICTO_MAXIMO} caracteres.` };
  }

  if (veredicto === 'falso' && motivo === '') {
    return { motivo: null, error: 'Escribe el motivo: el autor lo verá junto al aviso.' };
  }

  return { motivo: motivo === '' ? null : motivo, error: null };
}

/** Lo que hay hoy en `users/{autor}/confianza/actual`. Sin documento, todo en cero. */
export interface ConfianzaGuardada {
  puntosConfianza?: number;
  validatedReports?: number;
  reportesFalsos?: number;
  confirmacionesSuspendidas?: boolean;
}

/** Cómo queda la confianza del autor tras un veredicto. */
export interface EfectoVeredicto {
  puntosAntes: number;
  puntosConfianza: number;
  trustLevel: number;
  validatedReports: number;
  reportesFalsos: number;
  confirmacionesSuspendidas: boolean;
  /** Lo que de verdad cambió: 0 en el tope de PC o en 0. */
  veredictoPuntos: number;
}

/**
 * Efecto de un veredicto en la confianza del autor: +10 PC y un reporte
 * validado si es real; −15 PC y un reporte falso si no. Regla
 * `confianzaDeVeredictoValida`, número por número.
 */
export function efectoDeVeredicto(
  previo: ConfianzaGuardada | null | undefined,
  veredicto: 'real' | 'falso',
): EfectoVeredicto {
  const real = veredicto === 'real';
  const puntosAntes = previo?.puntosConfianza ?? 0;
  const puntosConfianza = puntosTrasVeredicto(puntosAntes, veredicto);

  return {
    puntosAntes,
    puntosConfianza,
    trustLevel: nivelDePuntos(puntosConfianza),
    validatedReports: (previo?.validatedReports ?? 0) + (real ? 1 : 0),
    reportesFalsos: (previo?.reportesFalsos ?? 0) + (real ? 0 : 1),
    confirmacionesSuspendidas: previo?.confirmacionesSuspendidas ?? false,
    veredictoPuntos: puntosConfianza - puntosAntes,
  };
}

export interface ProgresoNivel {
  nivel: number;
  nombre: string;
  puntos: number;
  /** PC del nivel actual y del siguiente; null en el nivel máximo. */
  desde: number;
  hasta: number | null;
  /** De 0 a 1, para la barra. 1 en el nivel máximo. */
  fraccion: number;
  /** PC que faltan para el siguiente nivel; 0 en el máximo. */
  faltan: number;
  /** Reportes reales que equivalen a lo que falta (redondeado hacia arriba). */
  reportesQueFaltan: number;
}

export function progresoDeNivel(puntos: number): ProgresoNivel {
  const nivel = nivelDePuntos(puntos);
  const actual = NIVELES.find((n) => n.nivel === nivel)!;
  const siguiente = NIVELES.find((n) => n.nivel === nivel + 1) ?? null;

  if (!siguiente) {
    return {
      nivel,
      nombre: actual.nombre,
      puntos,
      desde: actual.puntosMinimos,
      hasta: null,
      fraccion: 1,
      faltan: 0,
      reportesQueFaltan: 0,
    };
  }

  const tramo = siguiente.puntosMinimos - actual.puntosMinimos;
  const faltan = siguiente.puntosMinimos - puntos;

  return {
    nivel,
    nombre: actual.nombre,
    puntos,
    desde: actual.puntosMinimos,
    hasta: siguiente.puntosMinimos,
    fraccion: Math.max(0, Math.min(1, (puntos - actual.puntosMinimos) / tramo)),
    faltan,
    reportesQueFaltan: Math.ceil(faltan / P.puntosPorReporteReal),
  };
}
