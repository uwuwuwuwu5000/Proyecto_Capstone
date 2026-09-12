import { FieldValue, Timestamp } from 'firebase/firestore';

/** Roles previstos para el MVP de Ciudad Alerta. */
export type UserRole = 'ciudadano' | 'operador' | 'admin';

/**
 * Documento base creado en `users/{uid}` al registrarse (CA-48).
 * `trustLevel` y `validatedReports` quedan sembrados aquí porque el sistema de
 * confianza comunitaria los consumirá en sprints posteriores.
 */
export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
  trustLevel: number;
  validatedReports: number;
  emailVerified: boolean;
  /**
   * Momento del último reporte creado. Sostiene el intervalo mínimo entre
   * envíos (BUG 60). Ausente en los perfiles creados antes de esta versión.
   */
  ultimoReporteAt?: Timestamp | FieldValue | null;
  createdAt: Timestamp | FieldValue;
  updatedAt: Timestamp | FieldValue;
}

/** Intervalo mínimo entre reportes de un mismo usuario, en milisegundos. */
export const INTERVALO_MINIMO_REPORTE_MS = 30_000;
