import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  Timestamp,
  collection,
  doc,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { FirebaseError } from 'firebase/app';
import { geohashForLocation } from 'geofire-common';

import { FIRESTORE } from '../core/firebase.providers';
import { AuthService } from './auth.service';
import { CapturedPhoto } from './camera.service';
import { ImageSimilarityService } from './image-similarity.service';
import { RoutingService } from './routing.service';
import { PHOTO_STORAGE } from './photo-storage.service';
import { INTERVALO_MINIMO_REPORTE_MS } from '../models/user-profile.model';
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
   * Crea el reporte junto con su evidencia fotográfica.
   *
   * Con almacenamiento en Firestore ambas escrituras viajan en un mismo lote y
   * se confirman juntas. Con Cloud Storage, que no participa de los lotes, la
   * imagen se sube antes y se borra si la escritura del reporte falla.
   */
  async createReport(datos: NuevoReporte): Promise<string> {
    const usuario = this.authService.user;

    if (!usuario) {
      throw new ReportError('Tu sesión expiró. Vuelve a iniciar sesión para reportar.');
    }

    const descripcion = datos.descripcion.trim();
    this.validarDescripcion(descripcion);
    this.validarUbicacion(datos.ubicacion);
    await this.validarFrecuencia(usuario.uid);

    const referencia = doc(collection(this.firestore, 'reports'));
    const reportId = referencia.id;


    // Reutiliza el vector calculado en la detección de duplicados; solo lo
    // vuelve a calcular si no llegó.
    // BUG 18 · Sin fotografía no hay vector posible: guardar uno dejaría el
    // documento en un estado incoherente y contaminaría las comparaciones.
    let embedding: number[] | null = null;

    if (datos.foto) {
      embedding =
        datos.embedding ??
        (await this.similarityService.computeEmbedding(datos.foto.dataUrl));
    }

    const reporte: Omit<Report, 'id'> = {
      uid: usuario.uid,
      descripcion,
      categoria: datos.categoria,
      ubicacion: datos.ubicacion,
      // La referencia se añade en la rama correspondiente, según si la
      // fotografía viaja en el mismo lote o se sube por separado.
      foto: null,
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
      /**
       * BUG 61 · Antes la fotografía se escribía primero y el reporte después.
       * Si la app moría entre ambas operaciones quedaba una imagen huérfana
       * ocupando cuota. Cuando el almacenamiento vive en Firestore, ambas
       * escrituras viajan en un mismo lote y se confirman juntas.
       */
      if (datos.foto && this.photoStorage.stageInBatch) {
        const lote = writeBatch(this.firestore);
        const foto = this.photoStorage.stageInBatch(
          lote,
          reportId,
          usuario.uid,
          datos.foto,
        );

        lote.set(referencia, { ...reporte, foto });
        await lote.commit();
      } else if (datos.foto) {
        // Cloud Storage no participa de los lotes de Firestore: se sube antes y
        // se borra si la escritura del reporte falla.
        let foto;

        try {
          foto = await this.photoStorage.upload(reportId, usuario.uid, datos.foto);
        } catch (error) {
          throw new ReportError(this.mensajeDeSubida(error));
        }

        try {
          await setDoc(referencia, { ...reporte, foto });
        } catch (error) {
          await this.photoStorage.remove(foto).catch(() => undefined);
          throw error;
        }
      } else {
        await setDoc(referencia, reporte);
      }

      // Registra el envío para el control de frecuencia. Si falla, el reporte
      // ya está creado y no tiene sentido revertirlo por esto.
      void updateDoc(doc(this.firestore, 'users', usuario.uid), {
        ultimoReporteAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }).catch(() => undefined);

      return reportId;
    } catch (error) {
      if (error instanceof ReportError) {
        throw error;
      }

      throw new ReportError(this.mensajeDeEscritura(error));
    }
  }

  /** Resuelve la imagen de un reporte para mostrarla en un `<img src>`. */
  resolvePhotoUrl(reporte: Report): Promise<string> {
    if (!reporte.foto) {
      return Promise.reject(new ReportError('El reporte no tiene fotografía.'));
    }

    return this.photoStorage.resolveUrl(reporte.foto);
  }

  /**
   * BUG 60 · Intervalo mínimo entre reportes del mismo usuario.
   *
   * Es una barrera contra el envío accidental repetido y el spam casual. No es
   * una defensa completa: un cliente manipulado podría omitir la escritura de
   * `ultimoReporteAt`. La protección real contra clientes falsos es App Check,
   * que se habilita en la consola y sí funciona en el plan actual.
   */
  private async validarFrecuencia(uid: string): Promise<void> {
    const perfil = await this.authService.getUserProfile(uid).catch(() => null);
    const ultimo = perfil?.ultimoReporteAt;

    if (!(ultimo instanceof Timestamp)) {
      return;
    }

    const transcurrido = Date.now() - ultimo.toMillis();

    if (transcurrido < INTERVALO_MINIMO_REPORTE_MS) {
      const segundos = Math.ceil((INTERVALO_MINIMO_REPORTE_MS - transcurrido) / 1000);
      throw new ReportError(
        `Espera ${segundos} segundos antes de enviar otro reporte.`,
      );
    }
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
      // BUG 63 · `permission-denied` no significa que falten campos: significa
      // que las reglas rechazaron la escritura.
      if (error.code === 'permission-denied') {
        return 'No tienes permiso para crear este reporte. Vuelve a iniciar sesión e inténtalo otra vez.';
      }

      if (error.code === 'unavailable') {
        return 'Sin conexión con el servidor. Tu reporte no se guardó, inténtalo nuevamente.';
      }
    }

    return 'No se pudo guardar el reporte. Intenta nuevamente.';
  }
}
