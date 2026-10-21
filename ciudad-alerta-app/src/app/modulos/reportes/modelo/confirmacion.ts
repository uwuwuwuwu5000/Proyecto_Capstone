import type { FieldValue, Timestamp } from 'firebase/firestore';

/** Confirmación comunitaria. El id del documento es el uid, lo que impide duplicados. */
export interface Confirmation {
  uid: string;
  reportId: string;
  createdAt: Timestamp | FieldValue;
  /** Formato con peso (sistema de confianza): nivel y peso de quien confirmó, congelados. */
  nivel?: number;
  peso?: number;
}
