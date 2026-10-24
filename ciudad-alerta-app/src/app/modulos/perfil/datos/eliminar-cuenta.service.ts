import { Injectable, inject } from '@angular/core';
import { FirebaseError } from 'firebase/app';
import { EmailAuthProvider, deleteUser, reauthenticateWithCredential } from 'firebase/auth';
import {
  Firestore,
  collection,
  doc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { AUTOR_CUENTA_ELIMINADA } from '@ciudad-alerta/comun';

import { FIRESTORE } from '../../../core/firebase.providers';
import { AuthService } from '../../../services/auth.service';
import { PreferenciasService } from '../../../services/preferencias.service';

export type CodigoEliminarCuenta = 'sin_sesion' | 'contrasena' | 'demasiados' | 'red' | 'desconocido';

export class EliminarCuentaError extends Error {
  constructor(
    override readonly message: string,
    readonly code: CodigoEliminarCuenta,
  ) {
    super(message);
    this.name = 'EliminarCuentaError';
  }
}

/** Escrituras por lote: Firestore admite 500. */
const POR_LOTE = 400;

/**
 * 1.0 · Eliminar la cuenta (lo exige Google Play a las apps con cuentas).
 *
 * Los reportes quedan anónimos, no se borran: son parte del historial del
 * barrio y del trabajo de la municipalidad. En orden:
 *
 *  1. Pide la contraseña otra vez (Firebase la exige para borrar la cuenta).
 *  2. Cambia el autor de cada reporte propio a «Cuenta eliminada».
 *  3. Deja el perfil sin correo ni nombre. El documento se conserva (sin
 *     datos personales) para que nadie pueda saltarse el intervalo entre
 *     reportes borrándolo y creándolo de nuevo.
 *  4. Borra la cuenta de Firebase Authentication: ya no se puede entrar.
 *  5. Borra lo que la app guardó en el teléfono.
 *
 * Si algo falla a mitad, se puede volver a intentar: lo ya hecho no se repite.
 */
@Injectable({ providedIn: 'root' })
export class EliminarCuentaService {
  private readonly firestore = inject<Firestore>(FIRESTORE);
  private readonly authService = inject(AuthService);
  private readonly preferencias = inject(PreferenciasService);

  async eliminar(contrasena: string): Promise<{ reportesAnonimos: number }> {
    const usuario = this.authService.user;

    if (!usuario?.email) {
      throw new EliminarCuentaError('Tu sesión venció. Vuelve a iniciar sesión e inténtalo de nuevo.', 'sin_sesion');
    }

    try {
      await reauthenticateWithCredential(usuario, EmailAuthProvider.credential(usuario.email, contrasena));
    } catch (error) {
      throw this.traducir(error);
    }

    try {
      const propios = await getDocs(query(collection(this.firestore, 'reports'), where('uid', '==', usuario.uid)));
      const pendientes = propios.docs.filter((d) => d.data()['autorNombre'] !== AUTOR_CUENTA_ELIMINADA);

      for (let i = 0; i < pendientes.length; i += POR_LOTE) {
        const lote = writeBatch(this.firestore);
        for (const reporte of pendientes.slice(i, i + POR_LOTE)) {
          lote.update(reporte.ref, { autorNombre: AUTOR_CUENTA_ELIMINADA });
        }
        await lote.commit();
      }

      await updateDoc(doc(this.firestore, 'users', usuario.uid), {
        displayName: AUTOR_CUENTA_ELIMINADA,
        email: '',
        updatedAt: serverTimestamp(),
      });

      await deleteUser(usuario);
      this.preferencias.borrarDatosLocales();

      return { reportesAnonimos: pendientes.length };
    } catch (error) {
      throw this.traducir(error);
    }
  }

  private traducir(error: unknown): EliminarCuentaError {
    if (error instanceof EliminarCuentaError) return error;

    const codigo = error instanceof FirebaseError ? error.code : '';
    if (['auth/wrong-password', 'auth/invalid-credential', 'auth/invalid-login-credentials'].includes(codigo)) {
      return new EliminarCuentaError('La contraseña no es correcta.', 'contrasena');
    }
    if (codigo === 'auth/too-many-requests') {
      return new EliminarCuentaError('Demasiados intentos. Espera unos minutos y vuelve a intentar.', 'demasiados');
    }
    if (['auth/network-request-failed', 'unavailable', 'deadline-exceeded'].includes(codigo)) {
      return new EliminarCuentaError('Sin conexión: tu cuenta no se eliminó. Reintenta con señal.', 'red');
    }

    console.error('Eliminar cuenta:', error);
    return new EliminarCuentaError('No pudimos terminar de eliminar tu cuenta. Vuelve a intentar.', 'desconocido');
  }
}
