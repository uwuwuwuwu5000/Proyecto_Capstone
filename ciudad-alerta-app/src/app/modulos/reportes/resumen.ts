import { Timestamp } from 'firebase/firestore';
import { estaFinalizado, etiquetaEstado, haceCuanto } from '@ciudad-alerta/comun';

import { Report } from '../../models/report.model';

/**
 * «Tus reportes» del inicio: cuántos siguen en curso, cuántos se resolvieron
 * y cuál fue el último movimiento.
 */
export interface ResumenMisReportes {
  total: number;
  /** Hay más reportes que los leídos: los conteos son de los más recientes. */
  hayMas: boolean;
  enCurso: number;
  resueltos: number;
  /** Cerrados sin pasar por «resuelto». */
  cerrados: number;
  /** El reporte que cambió más recientemente (o el último creado). */
  ultimo: { id: string; descripcion: string; estado: Report['estado']; haceMs: number; cambio: boolean } | null;
}

const ms = (valor: unknown): number | null => (valor instanceof Timestamp ? valor.toMillis() : null);

/** Un cambio de menos de un minuto tras la creación es la propia creación. */
const MARGEN_CREACION_MS = 60_000;

export function resumenDeMisReportes(reportes: readonly Report[], hayMas: boolean, ahoraMs = Date.now()): ResumenMisReportes {
  let enCurso = 0;
  let resueltos = 0;
  let cerrados = 0;
  let ultimo: ResumenMisReportes['ultimo'] = null;
  let ultimoMs = -Infinity;

  for (const reporte of reportes) {
    if (!estaFinalizado(reporte.estado)) enCurso++;
    else if (reporte.estado === 'resuelto' || typeof reporte.tiempoResolucionMs === 'number') resueltos++;
    else cerrados++;

    const creado = ms(reporte.createdAt);
    const actualizado = ms(reporte.updatedAt) ?? creado;
    if (actualizado !== null && actualizado > ultimoMs) {
      ultimoMs = actualizado;
      ultimo = {
        id: reporte.id,
        descripcion: reporte.descripcion,
        estado: reporte.estado,
        haceMs: ahoraMs - actualizado,
        cambio: creado !== null && actualizado - creado > MARGEN_CREACION_MS,
      };
    }
  }

  return { total: reportes.length, hayMas, enCurso, resueltos, cerrados, ultimo };
}

/** "2 en curso · 1 resuelto"; las cantidades en cero no se nombran. */
export function textoConteos(resumen: ResumenMisReportes): string {
  const partes = [
    resumen.enCurso && `${resumen.enCurso} en curso`,
    resumen.resueltos && `${resumen.resueltos} ${resumen.resueltos === 1 ? 'resuelto' : 'resueltos'}`,
    resumen.cerrados && `${resumen.cerrados} ${resumen.cerrados === 1 ? 'cerrado' : 'cerrados'}`,
  ].filter(Boolean);
  const texto = partes.join(' · ');
  return resumen.hayMas ? `${texto} (últimos ${resumen.total})` : texto;
}

/** "«Bache en Av. Pajaritos» está en proceso · hace 2 h". */
export function textoUltimo(resumen: ResumenMisReportes): string | null {
  const ultimo = resumen.ultimo;
  if (!ultimo) return null;
  const descripcion = ultimo.descripcion.length > 38 ? `${ultimo.descripcion.slice(0, 37).trimEnd()}…` : ultimo.descripcion;
  const cuando = haceCuanto(ultimo.haceMs);
  return ultimo.cambio
    ? `«${descripcion}» está ${etiquetaEstado(ultimo.estado).toLowerCase()} · ${cuando}`
    : `Último: «${descripcion}» · ${cuando}`;
}
