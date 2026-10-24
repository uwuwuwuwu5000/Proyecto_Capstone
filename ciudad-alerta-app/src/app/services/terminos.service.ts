import { Injectable, inject } from '@angular/core';
import { Firestore, doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { VERSION_TERMINOS, terminosAceptados } from '@ciudad-alerta/comun';

import { FIRESTORE } from '../core/firebase.providers';
import { UserProfile } from '../models/user-profile.model';
import { AuthService } from './auth.service';

/**
 * Aceptación de los términos de uso y la política de privacidad
 * (comun/src/legal). Quien se registra los acepta en el formulario; las
 * cuentas anteriores a la 1.0, o las que aceptaron una versión vieja, los
 * aceptan al entrar al inicio.
 */
@Injectable({ providedIn: 'root' })
export class TerminosService {
  private readonly firestore = inject<Firestore>(FIRESTORE);
  private readonly authService = inject(AuthService);

  /** Con perfil y sin la versión vigente aceptada. Sin perfil (sin red) no se insiste. */
  necesitaAceptar(perfil: UserProfile | null): boolean {
    return perfil !== null && !terminosAceptados(perfil.terminosVersion);
  }

  async aceptar(): Promise<void> {
    const usuario = this.authService.user;
    if (!usuario) throw new Error('Sin sesión');

    await updateDoc(doc(this.firestore, 'users', usuario.uid), {
      terminosVersion: VERSION_TERMINOS,
      terminosAceptadosAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }
}
