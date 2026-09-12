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

    // Si la comprobación previa no fue concluyente, se intenta igual: las
    // reglas rechazan el duplicado y el mensaje resultante es el mismo.
    if ((await this.hasConfirmed(reportId)) === true) {
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

  /**
   * Indica si el usuario actual ya confirmó el reporte.
   *
   * BUG 21 · Devuelve `null` cuando la consulta falla. Antes devolvía `false`,
   * que la interfaz interpretaba como "puede confirmar" y mostraba el botón a
   * alguien que quizá ya había confirmado.
   */
  async hasConfirmed(reportId: string): Promise<boolean | null> {
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
      return null;
    }
  }

  /**
   * Total de confirmaciones. Usa una consulta de agregación, que cobra una sola
   * lectura en lugar de una por documento.
   */
  async countConfirmations(reportId: string): Promise<number | null> {
    try {
      const snapshot = await getCountFromServer(
        collection(this.firestore, 'reports', reportId, 'confirmations'),
      );
      return snapshot.data().count;
    } catch {
      // BUG 20 · `null` distingue el fallo de consulta de un reporte sin
      // confirmaciones, que son situaciones muy distintas para el usuario.
      return null;
    }
  }

  /**
   * BUG 9 · Conteo real para varios reportes a la vez.
   *
   * El campo `confirmaciones` del documento nunca se incrementa: las reglas
   * impiden que el cliente lo toque, y permitirlo abriría la puerta a que
   * cualquiera inflara el contador de cualquier reporte. Denormalizarlo de forma
   * segura exige un trigger de Cloud Functions, que requiere plan Blaze, así que
   * el valor se calcula con consultas de agregación (una lectura cada una).
   */
  async countMany(reportIds: string[]): Promise<Map<string, number>> {
    const totales = await Promise.all(
      reportIds.map(async (id) => [id, await this.countConfirmations(id)] as const),
    );

    // Los que no se pudieron contar quedan fuera del mapa; la tarjeta
    // simplemente no muestra el dato.
    return new Map(
      totales.filter((par): par is readonly [string, number] => par[1] !== null),
    );
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
