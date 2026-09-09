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
  createdAt: Timestamp | FieldValue;
  updatedAt: Timestamp | FieldValue;
}
