import { Injectable, NgZone, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  Auth,
  User,
  UserCredential,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
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
} from 'firebase/firestore';
import { FirebaseError } from 'firebase/app';
import { Observable, firstValueFrom, map, shareReplay } from 'rxjs';

import { FIREBASE_AUTH, FIRESTORE } from '../core/firebase.providers';
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
  readonly authState$: Observable<User | null> = new Observable<User | null>(
    (subscriber) =>
      onAuthStateChanged(
        this.auth,
        (user) => this.zone.run(() => subscriber.next(user)),
        (error) => this.zone.run(() => subscriber.error(error)),
      ),
  ).pipe(shareReplay({ bufferSize: 1, refCount: true }));

  /** Versión booleana, útil en guards y plantillas. */
  readonly isAuthenticated$: Observable<boolean> = this.authState$.pipe(
    map((user) => !!user),
  );

  /** Señal del usuario actual para consumir directamente en templates. */
  readonly currentUser = toSignal(this.authState$, { initialValue: null });

  /** Acceso sincrónico al usuario (null si no hay sesión). */
  get user(): User | null {
    return this.auth.currentUser;
  }

  /**
   * CA-48 · Registro con correo y contraseña.
   * Crea la cuenta en Firebase Auth y el documento base en `users/{uid}`.
   * Los duplicados los rechaza Firebase con `auth/email-already-in-use`.
   */
  async register(
    email: string,
    password: string,
    displayName?: string,
  ): Promise<UserCredential> {
    try {
      const credential = await createUserWithEmailAndPassword(
        this.auth,
        email.trim().toLowerCase(),
        password,
      );

      const nombre = (displayName ?? '').trim() || email.split('@')[0];
      await updateProfile(credential.user, { displayName: nombre });
      await this.createUserDocument(credential.user, nombre);

      return credential;
    } catch (error) {
      throw this.toAuthFailure(error);
    }
  }

  /** CA-49 · Inicio de sesión con credenciales. */
  async login(email: string, password: string): Promise<UserCredential> {
    try {
      return await signInWithEmailAndPassword(
        this.auth,
        email.trim().toLowerCase(),
        password,
      );
    } catch (error) {
      throw this.toAuthFailure(error);
    }
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

  /** CA-50 · Resuelve una sola vez el estado de sesión (lo usa el guard). */
  isLoggedIn(): Promise<boolean> {
    return firstValueFrom(this.isAuthenticated$);
  }

  /** Lee el perfil almacenado en Firestore para el usuario indicado. */
  async getUserProfile(uid: string): Promise<UserProfile | null> {
    const snapshot = await getDoc(doc(this.firestore, 'users', uid));
    return snapshot.exists() ? (snapshot.data() as UserProfile) : null;
  }

  /** Documento base del ciudadano; los campos de confianza quedan sembrados en 0. */
  private async createUserDocument(user: User, displayName: string): Promise<void> {
    const perfil: UserProfile = {
      uid: user.uid,
      email: user.email ?? '',
      displayName,
      role: 'ciudadano',
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