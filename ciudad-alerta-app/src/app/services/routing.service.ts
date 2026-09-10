import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  collection,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { FirebaseError } from 'firebase/app';

import { FIRESTORE } from '../core/firebase.providers';
import { AuthService } from './auth.service';
import {
  ORGANISMOS,
  Organismo,
  Report,
  ReportCategory,
  ReportStatus,
  StatusChange,
  TRANSICIONES,
} from '../models/report.model';

export class RoutingError extends Error {
  constructor(
    override readonly message: string,
    readonly code: 'transicion_invalida' | 'sin_permiso' | 'red' | 'desconocido',
  ) {
    super(message);
    this.name = 'RoutingError';
  }
}

/**
 * HU-28 · Enrutamiento al organismo responsable y evolución de estados.
 *
 * El enrutamiento se resuelve por categoría contra un catálogo simulado. Los
 * cambios de estado quedan registrados en la subcolección `statusHistory`, lo
 * que da trazabilidad sin inflar el documento del reporte.
 */
@Injectable({ providedIn: 'root' })
export class RoutingService {
  private readonly firestore = inject<Firestore>(FIRESTORE);
  private readonly authService = inject(AuthService);

  /** Determina el organismo responsable. Se invoca al crear el reporte. */
  resolveOrganismo(categoria: ReportCategory): Organismo {
    return ORGANISMOS[categoria] ?? ORGANISMOS.otro;
  }

  /** Estados a los que puede avanzar un reporte desde su estado actual. */
  transicionesDisponibles(estadoActual: ReportStatus): ReadonlyArray<ReportStatus> {
    return TRANSICIONES[estadoActual] ?? [];
  }

  esTransicionValida(desde: ReportStatus, hacia: ReportStatus): boolean {
    return this.transicionesDisponibles(desde).includes(hacia);
  }

  /**
   * Cambia el estado del reporte y deja constancia del movimiento.
   * Las reglas de seguridad exigen rol de gestión, de modo que la validación
   * del cliente es solo para dar mejor retroalimentación.
   */
  async changeStatus(
    report: Report,
    nuevoEstado: ReportStatus,
    comentario = '',
  ): Promise<void> {
    const usuario = this.authService.user;

    if (!usuario) {
      throw new RoutingError('Debes iniciar sesión para gestionar reportes.', 'sin_permiso');
    }

    if (!this.esTransicionValida(report.estado, nuevoEstado)) {
      throw new RoutingError(
        `No es posible pasar de "${report.estado}" a "${nuevoEstado}".`,
        'transicion_invalida',
      );
    }

    const cambio: StatusChange = {
      reportId: report.id,
      desde: report.estado,
      hacia: nuevoEstado,
      autorUid: usuario.uid,
      comentario: comentario.trim().slice(0, 300),
      createdAt: serverTimestamp(),
    };

    try {
      // El historial primero: si la actualización falla, queda el intento
      // registrado y no se pierde trazabilidad.
      await setDoc(
        doc(collection(this.firestore, 'reports', report.id, 'statusHistory')),
        cambio,
      );

      await updateDoc(doc(this.firestore, 'reports', report.id), {
        estado: nuevoEstado,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      throw this.traducir(error);
    }
  }

  /** Historial de cambios de un reporte, del más antiguo al más reciente. */
  async getStatusHistory(reportId: string): Promise<StatusChange[]> {
    try {
      const snapshot = await getDocs(
        query(
          collection(this.firestore, 'reports', reportId, 'statusHistory'),
          orderBy('createdAt', 'asc'),
        ),
      );

      return snapshot.docs.map((d) => d.data() as StatusChange);
    } catch {
      return [];
    }
  }

  private traducir(error: unknown): RoutingError {
    if (error instanceof FirebaseError) {
      if (error.code === 'permission-denied') {
        return new RoutingError(
          'No tienes permisos para cambiar el estado de este reporte.',
          'sin_permiso',
        );
      }

      if (error.code === 'unavailable') {
        return new RoutingError(
          'Sin conexión con el servidor. El cambio no se guardó.',
          'red',
        );
      }
    }

    return new RoutingError('No se pudo actualizar el estado del reporte.', 'desconocido');
  }
}
