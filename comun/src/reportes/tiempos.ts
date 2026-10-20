/**
 * Tiempos de atención y de resolución de un reporte (historia F12).
 *
 * Traído del portal web (portal-web/src/components/Reportes/tiempos.ts) para
 * que la app muestre los mismos números. No depende de cómo cada aplicación
 * lee las fechas: recibe `Date` ya convertidas.
 */
import type { EstadoReporte } from './estados';
import { ESTADOS_FINALIZADOS } from './estados';

/** Un cambio de estado, con su fecha ya convertida (null si no se registró). */
export interface CambioConFecha {
  fecha: Date | null;
  hacia: EstadoReporte | string;
}

export interface TiemposReporte {
  /** Desde la creación hasta el primer cambio de estado; null si nunca se atendió. */
  primeraAtencionMs: number | null;
  /** Desde la creación hasta que pasó a resuelto o cerrado; null si sigue abierto. */
  resolucionMs: number | null;
}

/**
 * @param creado    Fecha de creación del reporte.
 * @param cambios   Historial de estados, en cualquier orden.
 * @param tiempoResolucionMs  Si el reporte ya trae `tiempoResolucionMs` (lo
 *   guarda el gestor al resolver), se usa ese valor: es el oficial.
 */
export function calcularTiempos(
  creado: Date | null,
  cambios: readonly CambioConFecha[],
  tiempoResolucionMs: number | null = null,
): TiemposReporte {
  if (!creado) {
    return { primeraAtencionMs: null, resolucionMs: tiempoResolucionMs };
  }

  const inicio = creado.getTime();
  const conFecha = cambios
    .filter((c): c is CambioConFecha & { fecha: Date } => c.fecha !== null)
    .sort((a, b) => a.fecha.getTime() - b.fecha.getTime());
  const primera = conFecha[0];
  const resolucion = conFecha.find((c) => (ESTADOS_FINALIZADOS as readonly string[]).includes(c.hacia));

  // max(0, …): el reloj del dispositivo que creó el reporte puede ir adelantado.
  return {
    primeraAtencionMs: primera ? Math.max(0, primera.fecha.getTime() - inicio) : null,
    resolucionMs:
      tiempoResolucionMs ?? (resolucion ? Math.max(0, resolucion.fecha.getTime() - inicio) : null),
  };
}

/** La mediana resiste los casos extremos mejor que el promedio: un reporte olvidado un mes no la arrastra. */
export function mediana(valores: readonly number[]): number | null {
  if (valores.length === 0) return null;
  const ordenados = [...valores].sort((a, b) => a - b);
  const mitad = Math.floor(ordenados.length / 2);
  return ordenados.length % 2 === 0 ? (ordenados[mitad - 1] + ordenados[mitad]) / 2 : ordenados[mitad];
}

export function promedio(valores: readonly number[]): number | null {
  if (valores.length === 0) return null;
  return valores.reduce((suma, v) => suma + v, 0) / valores.length;
}

/** "12 min", "2 h 15 min", "3,5 días", "18 días". */
export function formatearDuracion(ms: number): string {
  const minutos = Math.round(ms / 60000);
  if (minutos < 1) return 'menos de 1 min';
  if (minutos < 60) return `${minutos} min`;
  if (minutos < 24 * 60) {
    const horas = Math.floor(minutos / 60);
    const resto = minutos % 60;
    return resto > 0 ? `${horas} h ${resto} min` : `${horas} h`;
  }
  const dias = minutos / (24 * 60);
  if (dias >= 10) return `${Math.round(dias)} días`;
  const redondeado = Math.round(dias * 10) / 10;
  return redondeado === 1 ? '1 día' : `${redondeado.toLocaleString('es-CL')} días`;
}

/** Cómo terminó (o no) un reporte, para mostrarlo. */
export type EstadoResolucion =
  /**
   * `ms` null si no hay cómo calcularlo. `segun`: 'registro' si viene de
   * `tiempoResolucionMs` (el dato oficial), 'historial' si se dedujo del
   * seguimiento (reportes resueltos antes de guardar ese campo).
   */
  | { tipo: 'resuelto'; ms: number | null; segun: 'registro' | 'historial' | null }
  | { tipo: 'cerrado_sin_resolver' }
  /** Cerrado, pero sin datos para saber si antes se resolvió. */
  | { tipo: 'cerrado' }
  | { tipo: 'abierto' };

/**
 * Resolución de un reporte a partir de lo que se tenga: los campos que
 * guardan la app y el portal al cambiar de estado (`tiempoResolucionMs`,
 * `cerradoSinResolverAt`) y, si no están, el historial de estados.
 */
export function resolucionDeReporte(datos: {
  estado: EstadoReporte | string;
  creado: Date | null;
  cambios?: readonly CambioConFecha[];
  tiempoResolucionMs?: number | null;
  /** true si el reporte tiene `cerradoSinResolverAt`. */
  cerradoSinResolver?: boolean;
}): EstadoResolucion {
  const cambios = datos.cambios ?? [];

  if (typeof datos.tiempoResolucionMs === 'number') {
    return { tipo: 'resuelto', ms: Math.max(0, datos.tiempoResolucionMs), segun: 'registro' };
  }

  const resolucion = cambios
    .filter((c) => c.hacia === 'resuelto')
    .sort((a, b) => (a.fecha?.getTime() ?? Number.MAX_SAFE_INTEGER) - (b.fecha?.getTime() ?? Number.MAX_SAFE_INTEGER))[0];

  if (datos.estado === 'resuelto' || resolucion) {
    if (resolucion?.fecha && datos.creado) {
      return {
        tipo: 'resuelto',
        ms: Math.max(0, resolucion.fecha.getTime() - datos.creado.getTime()),
        segun: 'historial',
      };
    }
    return { tipo: 'resuelto', ms: null, segun: null };
  }

  if (datos.cerradoSinResolver) return { tipo: 'cerrado_sin_resolver' };

  if (datos.estado === 'cerrado') {
    // Con historial y sin «resuelto» en él, se cerró sin resolver; sin
    // historial no se sabe.
    return cambios.length > 0 ? { tipo: 'cerrado_sin_resolver' } : { tipo: 'cerrado' };
  }

  return { tipo: 'abierto' };
}
