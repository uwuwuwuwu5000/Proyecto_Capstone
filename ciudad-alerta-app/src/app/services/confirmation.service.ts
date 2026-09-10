import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  collection,
  doc,
  getCountFromServer,
  getDoc,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import { FirebaseError } from 'firebase/app';

import { FIRESTORE } from '../core/firebase.providers';
import { AuthService } from './auth.service';
import { Confirmation } from '../models/report.model';

export class ConfirmationError extends Error {
  constructor(
    override readonly message: string,
    readonly code: 'no_autenticado' | 'duplicada' | 'red' | 'desconocido',
  ) {
    super(message);
    this.name = 'ConfirmationError';
  }
}

/**
 * Confirmación comunitaria de un reporte existente.
 *
 * Cada confirmación vive en `reports/{reportId}/confirmations/{uid}`. Usar el
 * uid como identificador del documento hace que la unicidad la garantice la
 * propia estructura: un segundo intento sería una actualización, y las reglas
 * de seguridad solo permiten la creación.
 */
@Injectable({ providedIn: 'root' })
export class ConfirmationService {
  private readonly firestore = inject<Firestore>(FIRESTORE);
  private readonly authService = inject(AuthService);

  async confirm(reportId: string): Promise<void> {
    const usuario = this.authService.user;

    if (!usuario) {
      throw new ConfirmationError(
        'Necesitas iniciar sesión para confirmar un reporte.',
        'no_autenticado',
      );
    }

    if (await this.hasConfirmed(reportId)) {
      throw new ConfirmationError('Ya confirmaste este reporte.', 'duplicada');
    }

    const registro: Confirmation = {
      uid: usuario.uid,
      reportId,
      createdAt: serverTimestamp(),
    };

    try {
      await setDoc(
        doc(this.firestore, 'reports', reportId, 'confirmations', usuario.uid),
        registro,
      );
    } catch (error) {
      throw this.traducir(error);
    }
  }

  /** Indica si el usuario actual ya confirmó el reporte. */
  async hasConfirmed(reportId: string): Promise<boolean> {
    const usuario = this.authService.user;

    if (!usuario) {
      return false;
    }

    try {
      const snapshot = await getDoc(
        doc(this.firestore, 'reports', reportId, 'confirmations', usuario.uid),
      );
      return snapshot.exists();
    } catch {
      return false;
    }
  }

  /**
   * Total de confirmaciones. Usa una consulta de agregación, que cobra una sola
   * lectura en lugar de una por documento.
   */
  async countConfirmations(reportId: string): Promise<number> {
    try {
      const snapshot = await getCountFromServer(
        collection(this.firestore, 'reports', reportId, 'confirmations'),
      );
      return snapshot.data().count;
    } catch {
      return 0;
    }
  }

  private traducir(error: unknown): ConfirmationError {
    if (error instanceof FirebaseError) {
      if (error.code === 'permission-denied') {
        // La regla rechaza la actualización, que es lo que ocurre al reconfirmar.
        return new ConfirmationError('Ya confirmaste este reporte.', 'duplicada');
      }

      if (error.code === 'unavailable') {
        return new ConfirmationError(
          'Sin conexión con el servidor. Tu confirmación no se registró.',
          'red',
        );
      }
    }

    return new ConfirmationError(
      'No pudimos registrar tu confirmación. Intenta nuevamente.',
      'desconocido',
    );
  }
}
