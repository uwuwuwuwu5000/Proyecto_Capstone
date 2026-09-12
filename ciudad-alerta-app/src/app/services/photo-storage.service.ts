import { InjectionToken, Injectable, inject } from '@angular/core';
import {
  Firestore,
  WriteBatch,
  deleteDoc,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import {
  FirebaseStorage,
  deleteObject,
  getDownloadURL,
  ref,
  uploadBytes,
} from 'firebase/storage';

import { FIREBASE_STORAGE, FIRESTORE } from '../core/firebase.providers';
import { CapturedPhoto } from './camera.service';
import { PhotoReference, ReportPhotoDoc } from '../models/report.model';

/**
 * Contrato de almacenamiento de fotografías.
 *
 * Existen dos implementaciones intercambiables y la elección se hace en un solo
 * lugar (`core/photo-storage.providers.ts`), sin tocar la UI ni el flujo de
 * reporte:
 *
 *  - CloudStoragePhotoService: Firebase Storage. Es lo que pide el criterio de
 *    aceptación, pero exige el plan Blaze desde el 3 de febrero de 2026.
 *  - FirestorePhotoService: guarda la imagen comprimida en la colección
 *    `reportPhotos`. Funciona en el plan Spark.
 */
export interface PhotoStorage {
  /** Sube la imagen y devuelve la referencia que se guardará en el reporte. */
  upload(reportId: string, ownerUid: string, photo: CapturedPhoto): Promise<PhotoReference>;
  /**
   * BUG 61 · Cuando la implementación guarda en Firestore, la escritura de la
   * imagen puede sumarse al mismo lote que el reporte y ambas se confirman
   * juntas. Las implementaciones que escriben fuera de Firestore no la ofrecen,
   * y en ese caso se usa `upload` con borrado compensatorio.
   */
  stageInBatch?(
    batch: WriteBatch,
    reportId: string,
    ownerUid: string,
    photo: CapturedPhoto,
  ): PhotoReference;
  /** Resuelve una URL o data URL utilizable en un `<img src>`. */
  resolveUrl(reference: PhotoReference): Promise<string>;
  /** Borra la imagen. Se usa para revertir un reporte que falló al guardarse. */
  remove(reference: PhotoReference): Promise<void>;
}

export const PHOTO_STORAGE = new InjectionToken<PhotoStorage>('PHOTO_STORAGE');

/** Firestore limita cada documento a 1 MiB; dejamos margen para el resto de campos. */
const LIMITE_DATA_URL_BYTES = 900_000;

@Injectable({ providedIn: 'root' })
export class FirestorePhotoService implements PhotoStorage {
  private readonly firestore = inject<Firestore>(FIRESTORE);

  async upload(
    reportId: string,
    ownerUid: string,
    photo: CapturedPhoto,
  ): Promise<PhotoReference> {
    if (photo.dataUrl.length > LIMITE_DATA_URL_BYTES) {
      throw new Error(
        'La fotografía es demasiado pesada incluso después de comprimirla. Toma otra con menos detalle.',
      );
    }

    const registro: ReportPhotoDoc = {
      reportId,
      ownerUid,
      dataUrl: photo.dataUrl,
      mimeType: photo.mimeType,
      sizeBytes: photo.sizeBytes,
      createdAt: serverTimestamp(),
    };

    await setDoc(doc(this.firestore, 'reportPhotos', reportId), registro);

    return {
      kind: 'firestore',
      path: `reportPhotos/${reportId}`,
      url: null,
      mimeType: photo.mimeType,
      sizeBytes: photo.sizeBytes,
    };
  }

  /**
   * Añade la fotografía al lote en lugar de escribirla por separado. Así no
   * puede quedar una imagen sin reporte ni un reporte apuntando a una imagen
   * inexistente.
   */
  stageInBatch(
    batch: WriteBatch,
    reportId: string,
    ownerUid: string,
    photo: CapturedPhoto,
  ): PhotoReference {
    if (photo.dataUrl.length > LIMITE_DATA_URL_BYTES) {
      throw new Error(
        'La fotografía es demasiado pesada incluso después de comprimirla. Toma otra con menos detalle.',
      );
    }

    const registro: ReportPhotoDoc = {
      reportId,
      ownerUid,
      dataUrl: photo.dataUrl,
      mimeType: photo.mimeType,
      sizeBytes: photo.sizeBytes,
      createdAt: serverTimestamp(),
    };

    batch.set(doc(this.firestore, 'reportPhotos', reportId), registro);

    return {
      kind: 'firestore',
      path: `reportPhotos/${reportId}`,
      url: null,
      mimeType: photo.mimeType,
      sizeBytes: photo.sizeBytes,
    };
  }

  async resolveUrl(reference: PhotoReference): Promise<string> {
    const snapshot = await getDoc(doc(this.firestore, reference.path));

    if (!snapshot.exists()) {
      throw new Error('La fotografía del reporte ya no está disponible.');
    }

    return (snapshot.data() as ReportPhotoDoc).dataUrl;
  }

  async remove(reference: PhotoReference): Promise<void> {
    await deleteDoc(doc(this.firestore, reference.path));
  }
}

@Injectable({ providedIn: 'root' })
export class CloudStoragePhotoService implements PhotoStorage {
  private readonly storage = inject<FirebaseStorage>(FIREBASE_STORAGE);

  async upload(
    reportId: string,
    ownerUid: string,
    photo: CapturedPhoto,
  ): Promise<PhotoReference> {
    const extension = photo.mimeType === 'image/png' ? 'png' : 'jpg';
    const path = `reports/${ownerUid}/${reportId}.${extension}`;
    const objectRef = ref(this.storage, path);

    await uploadBytes(objectRef, photo.blob, {
      contentType: photo.mimeType,
      customMetadata: { reportId, ownerUid },
    });

    return {
      kind: 'cloud-storage',
      path,
      url: await getDownloadURL(objectRef),
      mimeType: photo.mimeType,
      sizeBytes: photo.sizeBytes,
    };
  }

  async resolveUrl(reference: PhotoReference): Promise<string> {
    return reference.url ?? getDownloadURL(ref(this.storage, reference.path));
  }

  async remove(reference: PhotoReference): Promise<void> {
    await deleteObject(ref(this.storage, reference.path));
  }
}
