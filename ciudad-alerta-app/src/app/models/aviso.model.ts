import { FieldValue, Timestamp } from 'firebase/firestore';

import { ReportStatus } from './report.model';

/**
 * Aviso para el ciudadano: un cambio de estado en uno de sus reportes.
 *
 * No se guarda en la base de datos. Se deriva del historial de estados del
 * reporte, que se escribe venga el cambio desde la app o desde el portal. Así
 * no hace falta Cloud Functions ni que cada cliente que cambia un estado se
 * acuerde de crear un aviso aparte.
 */
export interface Aviso {
  /** `${reportId}_${cambioId}`: único en todo el sistema. */
  id: string;
  reportId: string;
  /** Inicio de la descripción, para reconocer el reporte. */
  reporte: string;
  desde: ReportStatus;
  hacia: ReportStatus;
  autor: string;
  /** Respuesta del organismo, si la dejó. */
  comentario: string | null;
  fecha: Date | null;
  visto: boolean;
}

/**
 * Qué avisos ya vio el usuario, en `users/{uid}/avisos/estado`.
 *
 * Dos mecanismos combinados para que el documento no crezca sin límite:
 * `vistosHasta` marca como vistos de una vez todos los anteriores a una fecha
 * ("marcar todos"), y `vistos` guarda los que se abrieron uno a uno después.
 * Al marcar todos, la lista se vacía.
 */
export interface EstadoAvisos {
  vistos: string[];
  vistosHasta: Timestamp | FieldValue | null;
  updatedAt: Timestamp | FieldValue;
}
