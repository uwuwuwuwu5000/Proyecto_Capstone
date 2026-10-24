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

import { FIRESTORE } from '../../../core/firebase.providers';
import { AuthService } from '../../../services/auth.service';
import { CapturedPhoto } from './camera.service';
import { ComunaDetectada, ComunaService } from '../../../services/comuna.service';
import { RoutingService } from '../../../services/routing.service';
import { PHOTO_STORAGE } from './photo-storage.service';
import { INTERVALO_MINIMO_REPORTE_MS } from '../../../models/user-profile.model';
import {
  DESCRIPCION_MAX,
  DESCRIPCION_MIN,
  GeoPoint,
  Report,
  ReportCategory,
} from '../../../models/report.model';

export interface NuevoReporte {
  /**
   * Id del reporte, si ya se eligió (borrador sin conexión). Si no viene, se
   * crea uno nuevo.
   */
  id?: string;
  descripcion: string;
  categoria: ReportCategory;
  ubicacion: GeoPoint;
  foto: CapturedPhoto | null;
  /**
   * Vector visual de la foto. Si no viene, se usa el que devolvió el servicio
   * de privacidad junto con la foto protegida (`foto.embedding`).
   */
  embedding?: number[] | null;
  /**
   * Comuna ya detectada al registrar la ubicación. Si no viene, el servicio la
   * detecta antes de guardar.
   */
  comuna?: ComunaDetectada | null;
}

export class ReportError extends Error {
  /** `red`: no hubo conexión, el reporte puede guardarse para después. */
  constructor(
    override readonly message: string,
    readonly code: 'red' | 'otro' = 'otro',
  ) {
    super(message);
    this.name = 'ReportError';
  }
}

@Injectable({ providedIn: 'root' })
export class ReportService {
  private readonly firestore = inject<Firestore>(FIRESTORE);
  private readonly authService = inject(AuthService);
  private readonly photoStorage = inject(PHOTO_STORAGE);
  private readonly routingService = inject(RoutingService);
  private readonly comunaService = inject(ComunaService);

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

    // Segunda barrera: ninguna foto se publica sin haber pasado por el
    // difuminado de rostros y personas. Las reglas lo exigen también.
    if (datos.foto && datos.foto.privacidad?.aplicada !== true) {
      throw new ReportError(
        'La foto no pasó por la protección de privacidad. Vuelve a adjuntarla.',
      );
    }

    const descripcion = datos.descripcion.trim();
    this.validarDescripcion(descripcion);
    this.validarUbicacion(datos.ubicacion);

    // El perfil se lee una sola vez: aporta el control de frecuencia y el
    // nombre del autor.
    const perfil = await this.authService.getUserProfile(usuario.uid).catch(() => null);
    this.validarFrecuencia(perfil?.ultimoReporteAt);

    /**
     * El nombre sale del perfil en Firestore, no de Authentication: las reglas
     * comparan contra ese mismo campo, y así nadie puede firmar un reporte con
     * un nombre que no es el suyo.
     */
    const autorNombre = (
      perfil?.displayName ||
      usuario.displayName ||
      usuario.email?.split('@')[0] ||
      'Vecino'
    ).slice(0, 60);

    const comuna = datos.comuna ?? (await this.comunaService.detectar(datos.ubicacion));

    // 1. Organismo: la municipalidad de la comuna donde se hizo el reporte.
    // 2. Operador: el operador activo de ese organismo, si existe.
    const organismo = await this.routingService.resolveOrganismo(datos.categoria, comuna);
    const operadorId = await this.routingService.resolveOperador(organismo.id);

    const referencia = datos.id
      ? doc(this.firestore, 'reports', datos.id)
      : doc(collection(this.firestore, 'reports'));
    const reportId = referencia.id;

    // El vector lo calcula el servicio de privacidad con la foto ya protegida.
    // Si no llegó (MobileNet no disponible en el servidor), el reporte se
    // guarda sin él: la detección de duplicados sigue con ubicación,
    // categoría y tiempo.
    // BUG 18 · Sin fotografía no hay vector posible: guardar uno dejaría el
    // documento en un estado incoherente y contaminaría las comparaciones.
    const embedding: number[] | null = datos.foto
      ? (datos.embedding ?? datos.foto.embedding ?? null)
      : null;

    const reporte: Omit<Report, 'id'> = {
      uid: usuario.uid,
      descripcion,
      categoria: datos.categoria,
      ubicacion: datos.ubicacion,
      comuna: comuna.comuna,
      region: comuna.region,
      comunaFuente: comuna.fuente,
      autorNombre,
      // La referencia se añade en la rama correspondiente, según si la
      // fotografía viaja en el mismo lote o se sube por separado.
      foto: null,
      estado: 'reportado',
      confirmaciones: 0,
      // HU-28 · Enrutamiento automático según la comuna.
      organismo,
      operadorId,
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
          throw new ReportError(this.mensajeDeSubida(error), esFallaDeRed(error) ? 'red' : 'otro');
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

      throw new ReportError(this.mensajeDeEscritura(error), esFallaDeRed(error) ? 'red' : 'otro');
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
  private validarFrecuencia(ultimo: unknown): void {
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
    // El mensaje para el usuario es genérico; el código exacto queda en la
    // consola para poder diagnosticar con chrome://inspect sin adivinar qué
    // condición de las reglas falló.
    console.error('Error al guardar el reporte:', error);

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

/** Falta de conexión, no un rechazo de las reglas ni un dato inválido. */
function esFallaDeRed(error: unknown): boolean {
  return (
    error instanceof FirebaseError &&
    ['unavailable', 'deadline-exceeded', 'storage/retry-limit-exceeded'].includes(error.code)
  );
}
