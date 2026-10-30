/**
 * «Por veredicto»: reportes que la comunidad ya validó y que esperan el veredicto (real o falso) de
 * quien los gestiona. Qué reportes están pendientes, cuánto llevan esperando, cuánto tardó el veredicto
 * desde que la comunidad validó el reporte y cuánto tarda un reporte desde «En revisión» hasta cerrarse.
 *
 * Funciones puras con tipos mínimos: reciben `Date` ya convertidas, igual que `calcularTiempos`.
 */
import { ESTADOS_FINALIZADOS } from './estados';
import { mediana, promedio } from './tiempos';
import type { CambioConFecha } from './tiempos';

const HORA_MS = 3_600_000;

/**
 * A partir de cuántas horas esperando se marca un reporte como «demorado». Es una constante de la
 * pantalla: se calcula con `ahora − validadoAt` al mostrar la lista y no se guarda en Firestore.
 */
export const UMBRAL_DEMORADO_HORAS = 48;

/** Lo que estos cálculos necesitan del mapa `validacion` de un reporte. */
export interface ValidacionDeReporte {
  validado: boolean;
  veredicto: 'real' | 'falso' | null;
  /** Cuándo la comunidad lo validó; null en los reportes validados antes de existir el campo. */
  validadoAt: Date | null;
  veredictoAt: Date | null;
}

export interface ReporteConValidacion {
  estado: string;
  validacion: ValidacionDeReporte;
}

/** Un periodo: `inicio` o `fin` en null significan sin límite (el periodo «Todo» no tiene ninguno). */
export interface RangoDeFechas {
  inicio: Date | null;
  fin: Date | null;
}

/**
 * Un reporte está pendiente de veredicto cuando la comunidad ya lo validó, nadie le dio veredicto y
 * sigue en curso. Un reporte cerrado o retirado por su autor sin veredicto no cuenta.
 *
 * No se excluyen los creados desde el panel de administración ni los validados antes de existir
 * `validadoAt`: se muestran igual.
 */
export function esPendienteDeVeredicto(reporte: ReporteConValidacion): boolean {
  return (
    reporte.validacion.validado &&
    reporte.validacion.veredicto === null &&
    !(ESTADOS_FINALIZADOS as readonly string[]).includes(reporte.estado)
  );
}

/** Milisegundos que lleva esperando desde que la comunidad lo validó; null si no se sabe cuándo. */
export function esperaActual(reporte: ReporteConValidacion, ahora: number): number | null {
  const validadoAt = reporte.validacion.validadoAt;
  // max(0, …): el reloj de quien validó puede ir adelantado.
  return validadoAt ? Math.max(0, ahora - validadoAt.getTime()) : null;
}

export function estaDemorado(reporte: ReporteConValidacion, ahora: number): boolean {
  const espera = esperaActual(reporte, ahora);
  return espera !== null && espera >= UMBRAL_DEMORADO_HORAS * HORA_MS;
}

/**
 * Tiempo que tardó en tomarse en cuenta el reporte: desde que la comunidad lo validó hasta que se dio
 * el veredicto (real o falso). null si falta alguna de las dos fechas.
 */
export function tiempoHastaVeredicto(reporte: ReporteConValidacion): number | null {
  const { veredicto, validadoAt, veredictoAt } = reporte.validacion;
  if (!veredicto || !validadoAt || !veredictoAt) return null;
  return Math.max(0, veredictoAt.getTime() - validadoAt.getTime());
}

/**
 * ¿El veredicto se dio dentro del periodo? El periodo se mide por la fecha del **veredicto**, no por la
 * de creación del reporte: lo que se mide es la respuesta del organismo en ese periodo.
 */
export function veredictoEnRango(reporte: ReporteConValidacion, { inicio, fin }: RangoDeFechas): boolean {
  if (!inicio && !fin) return true;
  const veredictoAt = reporte.validacion.veredictoAt;
  if (!veredictoAt) return false;
  return (!inicio || veredictoAt >= inicio) && (!fin || veredictoAt <= fin);
}

export interface TiempoRevisionACierre {
  /** El reporte tiene una entrada «En revisión» con fecha; si no, no se puede medir. */
  pasoPorRevision: boolean;
  /** Desde «En revisión» hasta la primera vez que pasó a «Resuelto»; null si no ocurrió. */
  aResueltoMs: number | null;
  /** Desde «En revisión» hasta la primera vez que pasó a «Cerrado»; null si no ocurrió. */
  aCierreMs: number | null;
}

/** Tiempo desde que el reporte pasa a «En revisión» hasta que se resuelve o se cierra. */
export function tiempoRevisionACierre(cambios: readonly CambioConFecha[]): TiempoRevisionACierre {
  const conFecha = cambios
    .filter((c): c is CambioConFecha & { fecha: Date } => c.fecha !== null)
    .sort((a, b) => a.fecha.getTime() - b.fecha.getTime());
  const revision = conFecha.find((c) => c.hacia === 'en_revision');
  if (!revision) return { pasoPorRevision: false, aResueltoMs: null, aCierreMs: null };

  const inicio = revision.fecha.getTime();
  const primeraVez = (estado: string) => {
    const c = conFecha.find((x) => x.hacia === estado && x.fecha.getTime() >= inicio);
    return c ? c.fecha.getTime() - inicio : null;
  };
  return { pasoPorRevision: true, aResueltoMs: primeraVez('resuelto'), aCierreMs: primeraVez('cerrado') };
}

export interface ResumenDeTiempos {
  /** Cuántos valores entran en el cálculo. */
  cantidad: number;
  /** Cuántos quedaron fuera por no tener los datos (null). */
  excluidos: number;
  mediana: number | null;
  promedio: number | null;
}

/** Mediana y promedio de una lista de tiempos (ms); los null se cuentan como excluidos. */
export function resumenDeTiempos(valores: ReadonlyArray<number | null>): ResumenDeTiempos {
  const validos = valores.filter((v): v is number => v !== null);
  return {
    cantidad: validos.length,
    excluidos: valores.length - validos.length,
    mediana: mediana(validos),
    promedio: promedio(validos),
  };
}
