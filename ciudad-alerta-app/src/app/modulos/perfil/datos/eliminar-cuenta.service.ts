import { Injectable, inject } from '@angular/core';
import { FirebaseError } from 'firebase/app';
import { EmailAuthProvider, User, deleteUser, reauthenticateWithCredential } from 'firebase/auth';
import {
  DocumentReference,
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
 *  3. Deja sus tickets de soporte sin datos de contacto (nombre y correo),
 *     como promete la página /eliminar-cuenta.
 *  4. Deja el perfil sin correo ni nombre. El documento se conserva (sin
 *     datos personales) para que nadie pueda saltarse el intervalo entre
 *     reportes borrándolo y creándolo de nuevo.
 *  5. Borra la cuenta de Firebase Authentication: ya no se puede entrar.
 *  6. Borra lo que la app guardó en el teléfono.
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
      await this.reautenticar(usuario, usuario.email, contrasena);
    } catch (error) {
      throw this.traducir(error);
    }

    try {
      const reportes = (await this.propios('reports', usuario.uid)).filter(
        (d) => d.datos['autorNombre'] !== AUTOR_CUENTA_ELIMINADA,
      );
      await this.actualizarEnLotes(reportes.map((d) => d.ref), { autorNombre: AUTOR_CUENTA_ELIMINADA });

      // Antes quedaban con el nombre y el correo, aunque la página pública
      // dice que los mensajes a soporte quedan sin datos de contacto.
      const tickets = (await this.propios('supportTickets', usuario.uid)).filter(
        (d) => d.datos['autorNombre'] !== AUTOR_CUENTA_ELIMINADA || d.datos['autorEmail'] !== '',
      );
      await this.actualizarEnLotes(tickets.map((d) => d.ref), { autorNombre: AUTOR_CUENTA_ELIMINADA, autorEmail: '' });

      await this.vaciarPerfil(usuario.uid);
      await this.borrarCuenta(usuario);
      // También el reporte que esperaba señal: ya no hay cuenta que lo envíe.
      this.preferencias.borrarDatosLocales({ tambienLoPendiente: true });

      return { reportesAnonimos: reportes.length };
    } catch (error) {
      throw this.traducir(error);
    }
  }

  // Cada paso con Firebase, aparte para poder probar el orden sin red.

  protected reautenticar(usuario: User, correo: string, contrasena: string): Promise<unknown> {
    return reauthenticateWithCredential(usuario, EmailAuthProvider.credential(correo, contrasena));
  }

  protected async propios(
    coleccion: 'reports' | 'supportTickets',
    uid: string,
  ): Promise<{ ref: DocumentReference; datos: Record<string, unknown> }[]> {
    const snapshot = await getDocs(query(collection(this.firestore, coleccion), where('uid', '==', uid)));
    return snapshot.docs.map((d) => ({ ref: d.ref, datos: d.data() }));
  }

  protected async actualizarEnLotes(refs: DocumentReference[], cambios: Record<string, string>): Promise<void> {
    for (let i = 0; i < refs.length; i += POR_LOTE) {
      const lote = writeBatch(this.firestore);
      for (const ref of refs.slice(i, i + POR_LOTE)) lote.update(ref, cambios);
      await lote.commit();
    }
  }

  protected vaciarPerfil(uid: string): Promise<void> {
    return updateDoc(doc(this.firestore, 'users', uid), {
      displayName: AUTOR_CUENTA_ELIMINADA,
      email: '',
      updatedAt: serverTimestamp(),
    });
  }

  protected borrarCuenta(usuario: User): Promise<void> {
    return deleteUser(usuario);
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
