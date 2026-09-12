import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  collection,
  doc,
  getDocs,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
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

    const referenciaReporte = doc(this.firestore, 'reports', report.id);
    const referenciaHistorial = doc(
      collection(this.firestore, 'reports', report.id, 'statusHistory'),
    );

    try {
      /**
       * BUG 14 · Antes se escribía el historial y luego se actualizaba el
       * estado. Si lo segundo fallaba, quedaba registrada una transición que
       * nunca ocurrió. La transacción garantiza que ambas cosas pasen o ninguna,
       * y de paso relee el estado actual: si otro gestor movió el reporte
       * mientras este diálogo estaba abierto, el cambio se rechaza en vez de
       * pisarlo.
       */
      await runTransaction(this.firestore, async (transaccion) => {
        const actual = await transaccion.get(referenciaReporte);

        if (!actual.exists()) {
          throw new RoutingError('El reporte ya no existe.', 'desconocido');
        }

        const estadoActual = actual.data()['estado'] as ReportStatus;

        if (estadoActual !== report.estado) {
          throw new RoutingError(
            `Otro gestor cambió este reporte a "${estadoActual}". Vuelve a abrirlo para continuar.`,
            'transicion_invalida',
          );
        }

        const cambio: StatusChange = {
          reportId: report.id,
          desde: estadoActual,
          hacia: nuevoEstado,
          autorUid: usuario.uid,
          comentario: comentario.trim().slice(0, 300),
          createdAt: serverTimestamp(),
        };

        transaccion.set(referenciaHistorial, cambio);
        transaccion.update(referenciaReporte, {
          estado: nuevoEstado,
          updatedAt: serverTimestamp(),
        });
      });
    } catch (error) {
      if (error instanceof RoutingError) {
        throw error;
      }

      throw this.traducir(error);
    }
  }

  /**
   * Historial de cambios, del más antiguo al más reciente.
   *
   * BUG 22 · Devuelve `null` si la consulta falla, para no mostrar "sin
   * seguimiento" cuando en realidad no se pudo leer.
   */
  async getStatusHistory(reportId: string): Promise<StatusChange[] | null> {
    try {
      const snapshot = await getDocs(
        query(
          collection(this.firestore, 'reports', reportId, 'statusHistory'),
          orderBy('createdAt', 'asc'),
        ),
      );

      return snapshot.docs.map((d) => d.data() as StatusChange);
    } catch {
      return null;
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
