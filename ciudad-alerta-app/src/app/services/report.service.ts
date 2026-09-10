import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  collection,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';
import { FirebaseError } from 'firebase/app';
import { geohashForLocation } from 'geofire-common';

import { FIRESTORE } from '../core/firebase.providers';
import { AuthService } from './auth.service';
import { CapturedPhoto } from './camera.service';
import { ImageSimilarityService } from './image-similarity.service';
import { RoutingService } from './routing.service';
import { PHOTO_STORAGE } from './photo-storage.service';
import {
  DESCRIPCION_MAX,
  DESCRIPCION_MIN,
  GeoPoint,
  Report,
  ReportCategory,
} from '../models/report.model';

export interface NuevoReporte {
  descripcion: string;
  categoria: ReportCategory;
  ubicacion: GeoPoint;
  foto: CapturedPhoto | null;
  /**
   * Vector visual ya calculado durante la detección de coincidencias. Si no
   * viene, el servicio lo calcula antes de guardar para no perder la señal.
   */
  embedding?: number[] | null;
}

export class ReportError extends Error {
  constructor(override readonly message: string) {
    super(message);
    this.name = 'ReportError';
  }
}

@Injectable({ providedIn: 'root' })
export class ReportService {
  private readonly firestore = inject<Firestore>(FIRESTORE);
  private readonly authService = inject(AuthService);
  private readonly photoStorage = inject(PHOTO_STORAGE);
  private readonly similarityService = inject(ImageSimilarityService);
  private readonly routingService = inject(RoutingService);

  /**
   * Crea el reporte completo: sube la fotografía y luego escribe el documento.
   * Si la escritura falla, borra la imagen para no dejar huérfanos ocupando
   * cuota.
   */
  async createReport(datos: NuevoReporte): Promise<string> {
    const usuario = this.authService.user;

    if (!usuario) {
      throw new ReportError('Tu sesión expiró. Vuelve a iniciar sesión para reportar.');
    }

    const descripcion = datos.descripcion.trim();
    this.validarDescripcion(descripcion);
    this.validarUbicacion(datos.ubicacion);

    const referencia = doc(collection(this.firestore, 'reports'));
    const reportId = referencia.id;

    let foto = null;

    if (datos.foto) {
      try {
        foto = await this.photoStorage.upload(reportId, usuario.uid, datos.foto);
      } catch (error) {
        throw new ReportError(this.mensajeDeSubida(error));
      }
    }

    // Reutiliza el vector calculado en la detección de duplicados; solo lo
    // vuelve a calcular si no llegó.
    let embedding = datos.embedding ?? null;

    if (!embedding && datos.foto) {
      embedding = await this.similarityService.computeEmbedding(datos.foto.dataUrl);
    }

    const reporte: Omit<Report, 'id'> = {
      uid: usuario.uid,
      descripcion,
      categoria: datos.categoria,
      ubicacion: datos.ubicacion,
      foto,
      estado: 'reportado',
      confirmaciones: 0,
      // HU-28 · Enrutamiento automático según la categoría del reporte.
      organismo: this.routingService.resolveOrganismo(datos.categoria),
      // Permite consultar reportes cercanos sin soporte geoespacial nativo.
      geohash: geohashForLocation([datos.ubicacion.lat, datos.ubicacion.lng]),
      embedding,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    try {
      await setDoc(referencia, reporte);
      return reportId;
    } catch (error) {
      if (foto) {
        // Best effort: si tampoco se puede borrar, no bloqueamos al usuario.
        await this.photoStorage.remove(foto).catch(() => undefined);
      }

      throw new ReportError(this.mensajeDeEscritura(error));
    }
  }

  /** Reportes del usuario autenticado, del más reciente al más antiguo. */
  async getMyReports(maximo = 20): Promise<Report[]> {
    const usuario = this.authService.user;

    if (!usuario) {
      return [];
    }

    const consulta = query(
      collection(this.firestore, 'reports'),
      where('uid', '==', usuario.uid),
      orderBy('createdAt', 'desc'),
      limit(maximo),
    );

    const snapshot = await getDocs(consulta);
    return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as Report);
  }

  /** Resuelve la imagen de un reporte para mostrarla en un `<img src>`. */
  resolvePhotoUrl(reporte: Report): Promise<string> {
    if (!reporte.foto) {
      return Promise.reject(new ReportError('El reporte no tiene fotografía.'));
    }

    return this.photoStorage.resolveUrl(reporte.foto);
  }

  private validarDescripcion(descripcion: string): void {
    if (descripcion.length < DESCRIPCION_MIN) {
      throw new ReportError(
        `Describe el problema con al menos ${DESCRIPCION_MIN} caracteres.`,
      );
    }

    if (descripcion.length > DESCRIPCION_MAX) {
      throw new ReportError(
        `La descripción no puede superar los ${DESCRIPCION_MAX} caracteres.`,
      );
    }
  }

  private validarUbicacion(ubicacion: GeoPoint): void {
    const latValida = ubicacion.lat >= -90 && ubicacion.lat <= 90;
    const lngValida = ubicacion.lng >= -180 && ubicacion.lng <= 180;

    if (!latValida || !lngValida) {
      throw new ReportError('Las coordenadas obtenidas no son válidas. Vuelve a ubicarte.');
    }
  }

  private mensajeDeSubida(error: unknown): string {
    if (error instanceof FirebaseError) {
      if (error.code === 'storage/unauthorized' || error.code === 'permission-denied') {
        return 'No tienes permiso para subir la fotografía. Revisa las reglas de seguridad.';
      }

      if (error.code === 'storage/retry-limit-exceeded' || error.code === 'unavailable') {
        return 'La fotografía no se pudo subir por problemas de conexión. Intenta otra vez.';
      }
    }

    return error instanceof Error
      ? error.message
      : 'No se pudo subir la fotografía del reporte.';
  }

  private mensajeDeEscritura(error: unknown): string {
    if (error instanceof FirebaseError) {
      if (error.code === 'permission-denied') {
        return 'El reporte fue rechazado por las reglas de seguridad. Revisa que todos los campos estén completos.';
      }

      if (error.code === 'unavailable') {
        return 'Sin conexión con el servidor. Tu reporte no se guardó, inténtalo nuevamente.';
      }
    }

    return 'No se pudo guardar el reporte. Intenta nuevamente.';
  }
}
