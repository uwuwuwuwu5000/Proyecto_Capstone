import { ESTADOS_FINALIZADOS } from '@ciudad-alerta/comun';

import type { Report, ReportStatus } from '../../../models/report.model';

/**
 * Detección de reportes duplicados al crear uno nuevo: qué cuenta como
 * «el mismo problema» y cómo se muestra cada coincidencia.
 */

/** Ventana temporal, en horas, dentro de la cual dos reportes pueden ser el mismo incidente. */
export const VENTANA_COINCIDENCIA_HORAS = 72;

/** Radio de búsqueda de reportes cercanos, en metros. */
export const RADIO_COINCIDENCIA_METROS = 150;

/** Estados que descartan una coincidencia: el incidente ya se cerró. */
export const ESTADOS_INACTIVOS: ReadonlyArray<ReportStatus> = ESTADOS_FINALIZADOS;

/** Reporte cercano detectado, con el detalle de por qué se considera coincidente. */
export interface MatchCandidate {
  report: Report;
  /** Distancia en metros al nuevo reporte. */
  distanciaMetros: number;
  /** Horas transcurridas desde que se creó el reporte existente. */
  horasTranscurridas: number;
  /** Similitud visual entre 0 y 1. Null si no se pudo calcular. */
  similitudImagen: number | null;
  /** Puntaje combinado entre 0 y 1. */
  puntaje: number;
  /** Explicación legible de la coincidencia, para mostrar al usuario. */
  motivos: string[];
}
