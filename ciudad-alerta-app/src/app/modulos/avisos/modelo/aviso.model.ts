import { FieldValue, Timestamp } from 'firebase/firestore';

import { ReportStatus } from '../../../models/report.model';

/**
 * Aviso para el ciudadano sobre uno de sus reportes: un cambio de estado, o
 * el veredicto de quien lo gestiona (real o falso).
 *
 * No se guarda en la base de datos. El cambio de estado se deriva del
 * historial del reporte, que se escribe venga el cambio desde la app o desde
 * el portal; el veredicto, del mapa `validacion` del propio reporte. Así no
 * hace falta Cloud Functions ni que cada cliente se acuerde de crear un aviso
 * aparte.
 */
interface AvisoBase {
  /** Único en todo el sistema: `${reportId}_${cambioId}` o `${reportId}_veredicto`. */
  id: string;
  reportId: string;
  /** Inicio de la descripción, para reconocer el reporte. */
  reporte: string;
  autor: string;
  /** Respuesta del organismo, o el motivo del veredicto, si lo dejó. */
  comentario: string | null;
  fecha: Date | null;
  visto: boolean;
}

export interface AvisoCambioEstado extends AvisoBase {
  tipo: 'estado';
  desde: ReportStatus;
  hacia: ReportStatus;
}

export interface AvisoVeredicto extends AvisoBase {
  tipo: 'veredicto';
  veredicto: 'real' | 'falso';
  /** Puntos de confianza que sumó o restó (0 si ya estaba en el tope o en 0). */
  puntos: number;
}

export type Aviso = AvisoCambioEstado | AvisoVeredicto;

/** Un aviso antes de saber si el usuario ya lo vio. */
export type AvisoSinVisto = Omit<AvisoCambioEstado, 'visto'> | Omit<AvisoVeredicto, 'visto'>;

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
