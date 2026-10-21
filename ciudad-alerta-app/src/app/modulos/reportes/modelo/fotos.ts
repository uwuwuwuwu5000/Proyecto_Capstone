import type { FieldValue, Timestamp } from 'firebase/firestore';

/** Documento de la colección `reportPhotos`, usado solo por la variante Firestore. */
export interface ReportPhotoDoc {
  reportId: string;
  ownerUid: string;
  dataUrl: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: Timestamp | FieldValue;
}
