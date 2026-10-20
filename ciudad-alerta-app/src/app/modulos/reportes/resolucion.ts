import { Timestamp } from 'firebase/firestore';
import { EstadoResolucion, calcularTiempos, formatearDuracion, resolucionDeReporte } from '@ciudad-alerta/comun';

import { Report, StatusChange } from '../../models/report.model';

/**
 * F12 · Tiempo de atención y de resolución de un reporte, para mostrarlo.
 *
 * Las reglas de cálculo están en `comun` (las mismas del portal); aquí solo se
 * convierten las fechas de Firestore y se arma el texto.
 */

function aFecha(valor: unknown): Date | null {
  return valor instanceof Timestamp ? valor.toDate() : null;
}

function cambiosConFecha(historial: readonly StatusChange[] | null) {
  return (historial ?? []).map((cambio) => ({ fecha: aFecha(cambio.createdAt), hacia: cambio.hacia }));
}

export function resolucionDe(reporte: Report, historial: readonly StatusChange[] | null = null): EstadoResolucion {
  return resolucionDeReporte({
    estado: reporte.estado,
    creado: aFecha(reporte.createdAt),
    cambios: cambiosConFecha(historial),
    tiempoResolucionMs: reporte.tiempoResolucionMs ?? null,
    cerradoSinResolver: reporte.cerradoSinResolverAt instanceof Timestamp,
  });
}

/** "Resuelto en 2 h 15 min", "Cerrado sin resolver"… null si sigue abierto. */
export function textoResolucion(resolucion: EstadoResolucion): string | null {
  switch (resolucion.tipo) {
    case 'resuelto':
      return resolucion.ms === null ? 'Resuelto' : `Resuelto en ${formatearDuracion(resolucion.ms)}`;
    case 'cerrado_sin_resolver':
      return 'Cerrado sin resolver';
    case 'cerrado':
      return 'Cerrado';
    case 'abierto':
      return null;
  }
}

/**
 * Cuánto tardó el primer cambio de estado desde la creación ("3 h 10 min").
 * null si nadie lo ha atendido todavía o el historial no se pudo leer.
 */
export function textoPrimeraAtencion(reporte: Report, historial: readonly StatusChange[] | null): string | null {
  if (!historial?.length) return null;
  const { primeraAtencionMs } = calcularTiempos(aFecha(reporte.createdAt), cambiosConFecha(historial));
  return primeraAtencionMs === null ? null : formatearDuracion(primeraAtencionMs);
}
