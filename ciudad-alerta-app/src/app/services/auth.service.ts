import { Injectable, NgZone, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  Auth,
  User,
  UserCredential,
  createUserWithEmailAndPassword,
  deleteUser,
  onAuthStateChanged,
  reload,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from 'firebase/auth';
import {
  Firestore,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { FirebaseError } from 'firebase/app';
import { Observable, ReplaySubject, map } from 'rxjs';

import { FIREBASE_AUTH, FIRESTORE } from '../core/firebase.providers';
import { esCorreoAdministrador } from '../core/admin-emails';
import { UserProfile } from '../models/user-profile.model';

/** Error de dominio con mensaje ya traducido y listo para mostrar en la UI. */
export class AuthFailure extends Error {
  constructor(
    override readonly message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = 'AuthFailure';
  }
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly auth = inject<Auth>(FIREBASE_AUTH);
  private readonly firestore = inject<Firestore>(FIRESTORE);
  private readonly zone = inject(NgZone);

  /**
   * Estado reactivo de la sesión. `onAuthStateChanged` dispara su primer valor
   * recién cuando Firebase terminó de restaurar la sesión persistida, y el
   * callback llega fuera de la zona de Angular, por eso se reingresa con
   * `zone.run` para que la UI se actualice.
   */
  private readonly estado$ = new ReplaySubject<User | null>(1);

  readonly authState$: Observable<User | null> = this.estado$.asObservable();

  /** Versión booleana, útil en guards y plantillas. */
  readonly isAuthenticated$: Observable<boolean> = this.authState$.pipe(
    map((user) => !!user),
  );

  /** Señal del usuario actual para consumir directamente en templates. */
  readonly currentUser = toSignal(this.authState$, { initialValue: null });

  constructor() {
    /**
     * v2-E6 · La suscripción a Firebase se establece una sola vez y vive
     * mientras viva la aplicación. Antes el observable usaba
     * `shareReplay({ refCount: true })` y el único suscriptor habitual era el
     * guard con `take(1)`: cada navegación desuscribía y volvía a suscribir
     * `onAuthStateChanged`, y ante un cierre de sesión simultáneo el guard podía
     * recibir el valor anterior desde el búfer.
     *
     * El callback llega fuera de la zona de Angular, por eso se reingresa con
     * `zone.run`.
     */
    onAuthStateChanged(
      this.auth,
      (user) => this.zone.run(() => this.estado$.next(user)),
      () => this.zone.run(() => this.estado$.next(null)),
    );
  }

  /** Acceso sincrónico al usuario (null si no hay sesión). */
  get user(): User | null {
    return this.auth.currentUser;
  }

  /**
   * CA-48 · Registro con correo y contraseña.
   *
   * BUG 2 · El registro son dos operaciones: crear la cuenta en Auth y escribir
   * el perfil en Firestore. Si la segunda fallaba, quedaba una cuenta sin perfil
   * y el usuario no podía ni registrarse (recibía email-already-in-use) ni usar
   * la app. Ahora, si el perfil no se puede escribir, la cuenta recién creada se
   * elimina para dejar el sistema como estaba.
   */
  async register(
    email: string,
    password: string,
    displayName?: string,
  ): Promise<UserCredential> {
    const correo = email.trim().toLowerCase();
    let credential: UserCredential;

    try {
      credential = await createUserWithEmailAndPassword(this.auth, correo, password);
    } catch (error) {
      throw this.toAuthFailure(error);
    }

    const nombre = (displayName ?? '').trim() || correo.split('@')[0];

    // BUG 3 · El nombre para mostrar es accesorio: si falla, no tiene sentido
    // abortar un registro que por lo demás fue correcto.
    try {
      await updateProfile(credential.user, { displayName: nombre });
    } catch {
      console.warn('No se pudo asignar el nombre para mostrar en Auth.');
    }

    try {
      await this.createUserDocument(credential.user, nombre);
    } catch (error) {
      await this.revertirCuenta(credential.user);
      throw new AuthFailure(
        'No pudimos completar tu registro. Vuelve a intentarlo en unos segundos.',
        'perfil-no-creado',
      );
    }

    return credential;
  }

  /**
   * Elimina la cuenta recién creada cuando el perfil no pudo escribirse.
   * Si el borrado también falla, se informa para que el usuario sepa qué hacer:
   * recuperar la contraseña es la vía para retomar esa cuenta huérfana.
   */
  private async revertirCuenta(user: User): Promise<void> {
    try {
      await deleteUser(user);
    } catch {
      console.error(
        'Registro incompleto: la cuenta existe en Auth pero no tiene perfil en Firestore.',
        user.uid,
      );
    }
  }

  /** CA-49 · Inicio de sesión con credenciales. */
  async login(email: string, password: string): Promise<UserCredential> {
    let credential: UserCredential;

    try {
      credential = await signInWithEmailAndPassword(
        this.auth,
        email.trim().toLowerCase(),
        password,
      );
    } catch (error) {
      throw this.toAuthFailure(error);
    }

    // Crea el perfil si falta y actualiza el rol cuando corresponde.
    await this.asegurarPerfil();

    return credential;
  }

  /**
   * Envía el correo de verificación a la cuenta actual.
   *
   * Firebase limita la frecuencia de estos envíos por cuenta; un reintento
   * inmediato devuelve `auth/too-many-requests`, que se traduce a un mensaje
   * pidiendo esperar.
   */
  async enviarVerificacionCorreo(): Promise<void> {
    const usuario = this.auth.currentUser;

    if (!usuario) {
      throw new AuthFailure('Inicia sesión para verificar tu correo.', 'sin-sesion');
    }

    if (usuario.emailVerified) {
      throw new AuthFailure('Tu correo ya está verificado.', 'ya-verificado');
    }

    try {
      await sendEmailVerification(usuario);
    } catch (error) {
      // El mismo código significa algo distinto aquí que en el inicio de
      // sesión: no son intentos fallidos, sino envíos demasiado seguidos.
      if (error instanceof FirebaseError && error.code === 'auth/too-many-requests') {
        throw new AuthFailure(
          'Ya enviamos un correo hace poco. Espera unos minutos antes de pedir otro.',
          error.code,
        );
      }

      throw this.toAuthFailure(error);
    }
  }

  /**
   * Relee el estado de la cuenta desde Firebase y, si el correo quedó
   * verificado, lo refleja en el perfil.
   *
   * Hace falta porque `emailVerified` no se actualiza solo en la sesión
   * abierta: el usuario verifica desde su bandeja de correo, en otra
   * aplicación, y la app no se entera hasta recargar la cuenta. Además se
   * fuerza la renovación del token, porque las reglas leen
   * `request.auth.token.email_verified` y el token antiguo diría `false`.
   */
  async comprobarVerificacion(): Promise<boolean> {
    const usuario = this.auth.currentUser;

    if (!usuario) {
      return false;
    }

    await reload(usuario);

    if (!usuario.emailVerified) {
      return false;
    }

    await usuario.getIdToken(true);

    try {
      await updateDoc(doc(this.firestore, 'users', usuario.uid), {
        emailVerified: true,
        updatedAt: serverTimestamp(),
      });
    } catch {
      // El dato de Auth es el que manda; el perfil se sincronizará en otro
      // momento si esta escritura falla.
    }

    return true;
  }

  /** CA-77 · Cierre de sesión. */
  async logout(): Promise<void> {
    try {
      await signOut(this.auth);
    } catch (error) {
      throw this.toAuthFailure(error);
    }
  }

  /** CA-75 · Envío del correo con enlace de recuperación de contraseña. */
  async resetPassword(email: string): Promise<void> {
    try {
      await sendPasswordResetEmail(this.auth, email.trim().toLowerCase());
    } catch (error) {
      throw this.toAuthFailure(error);
    }
  }

  /**
   * Repara el perfil del usuario y alinea su rol tras iniciar sesión.
   *
   * Resuelve dos situaciones heredadas:
   *
   * 1. **Cuentas sin perfil.** Existen en Authentication pero no tienen
   *    documento en `users`, porque se registraron antes de que el registro
   *    escribiera el perfil de forma atómica, o porque esa escritura falló sin
   *    revertir la cuenta. Sin documento, la app no puede leer su rol ni su
   *    nivel de confianza, y varias pantallas fallan.
   * 2. **Cuentas con rol desactualizado.** Creadas antes de existir la lista de
   *    administradores, quedaron como `ciudadano`.
   *
   * Las reglas de seguridad acotan lo que esto puede hacer: un perfil solo se
   * crea con valores iniciales, y el rol `admin` solo se admite si el correo
   * del token está en la lista. Un usuario común que llamara a este método
   * obtendría, como mucho, su propio perfil de ciudadano.
   */
  async asegurarPerfil(): Promise<void> {
    const usuario = this.auth.currentUser;

    if (!usuario) {
      return;
    }

    try {
      const perfil = await this.getUserProfile(usuario.uid);

      if (!perfil) {
        const nombre =
          usuario.displayName?.trim() ||
          usuario.email?.split('@')[0] ||
          'Vecino';

        await this.createUserDocument(usuario, nombre);
        return;
      }

      if (esCorreoAdministrador(usuario.email) && perfil.role !== 'admin') {
        await updateDoc(doc(this.firestore, 'users', usuario.uid), {
          role: 'admin',
          updatedAt: serverTimestamp(),
        });
      }
    } catch {
      // No bloquea el ingreso: se reintenta en el próximo inicio de sesión.
    }
  }

  /**
   * Lee el perfil almacenado en Firestore.
   *
   * BUG 7 · Se valida la forma del documento antes de devolverlo: un perfil
   * incompleto por una migración a medias rompía las pantallas que asumen sus
   * campos presentes.
   */
  async getUserProfile(uid: string): Promise<UserProfile | null> {
    const snapshot = await getDoc(doc(this.firestore, 'users', uid));

    if (!snapshot.exists()) {
      return null;
    }

    const datos = snapshot.data() as Partial<UserProfile>;
    const completo =
      typeof datos.uid === 'string' &&
      typeof datos.email === 'string' &&
      typeof datos.displayName === 'string';

    if (!completo) {
      console.warn('Perfil incompleto en users/', uid);
      return null;
    }

    return {
      ...(datos as UserProfile),
      role: datos.role ?? 'ciudadano',
      trustLevel: datos.trustLevel ?? 0,
      validatedReports: datos.validatedReports ?? 0,
    };
  }

  /** Documento base del ciudadano; los campos de confianza quedan sembrados en 0. */
  private async createUserDocument(user: User, displayName: string): Promise<void> {
    const perfil: UserProfile = {
      uid: user.uid,
      email: user.email ?? '',
      displayName,
      // La lista de administradores se valida también en las reglas, que son
      // las que realmente autorizan este valor.
      role: esCorreoAdministrador(user.email) ? 'admin' : 'ciudadano',
      trustLevel: 0,
      validatedReports: 0,
      emailVerified: user.emailVerified,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    await setDoc(doc(this.firestore, 'users', user.uid), perfil, { merge: true });
  }

  /** Traduce los códigos de Firebase Auth a mensajes accionables en español. */
  private toAuthFailure(error: unknown): AuthFailure {
    if (error instanceof FirebaseError) {
      return new AuthFailure(this.messageFor(error.code), error.code);
    }

    if (error instanceof Error) {
      return new AuthFailure(error.message, 'unknown');
    }

    return new AuthFailure('Ocurrió un error inesperado. Intenta de nuevo.', 'unknown');
  }

  private messageFor(code: string): string {
    const mensajes: Record<string, string> = {
      'auth/email-already-in-use':
        'Ese correo ya tiene una cuenta. Inicia sesión o recupera tu contraseña.',
      'auth/invalid-email': 'El formato del correo no es válido.',
      'auth/missing-email': 'Escribe tu correo para continuar.',
      'auth/weak-password': 'La contraseña debe tener al menos 6 caracteres.',
      'auth/invalid-credential': 'Correo o contraseña incorrectos.',
      'auth/wrong-password': 'Correo o contraseña incorrectos.',
      'auth/user-not-found': 'No existe una cuenta con ese correo.',
      'auth/user-disabled': 'Esta cuenta está deshabilitada. Contacta al administrador.',
      'auth/too-many-requests':
        'Demasiados intentos fallidos. Espera unos minutos antes de reintentar.',
      'auth/network-request-failed':
        'Sin conexión con el servidor. Revisa tu red e intenta otra vez.',
      'auth/operation-not-allowed':
        'El proveedor Correo/Contraseña no está habilitado en Firebase Console.',
      'auth/requires-recent-login':
        'Por seguridad, vuelve a iniciar sesión para completar esta acción.',
      'permission-denied': 'No tienes permisos para acceder a estos datos.',
      'unavailable': 'El servicio no está disponible en este momento. Reintenta luego.',
    };

    return mensajes[code] ?? `No pudimos completar la operación (${code}).`;
  }
}
