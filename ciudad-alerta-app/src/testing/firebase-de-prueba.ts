import { EnvironmentProviders, Provider, makeEnvironmentProviders } from '@angular/core';
import { FirebaseApp, deleteApp, initializeApp } from 'firebase/app';
import type { Auth, User } from 'firebase/auth';
import { Firestore, disableNetwork, initializeFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

import {
  FIREBASE_APP,
  FIREBASE_AUTH,
  FIREBASE_STORAGE,
  FIRESTORE,
} from '../app/core/firebase.providers';

/**
 * Firebase para las pruebas, sin red y sin el proyecto real.
 *
 * - **App, Firestore y Storage** son instancias reales del SDK con un proyecto
 *   `demo-*`: `doc()`, `collection()` y `query()` funcionan (el SDK comprueba
 *   que reciben un Firestore de verdad). Firestore nace **sin red**
 *   (`disableNetwork`): una lectura falla al tiro con «unavailable», igual en
 *   todos los computadores. Antes intentaba conectarse a Google y, según la
 *   red, fallaba enseguida, tardaba o cortaba la conexión a mitad de una
 *   prueba (ECONNRESET). Una prueba que necesite datos debe simular el
 *   servicio que los lee, no ir a Firestore.
 * - **Auth** es un doble: una sesión cerrada, o el usuario que se indique.
 *
 * Los registra `usarEntornoDePrueba()`, que cada prueba llama al comienzo.
 */

export interface UsuarioDePrueba {
  uid: string;
  email?: string;
  emailVerified?: boolean;
  displayName?: string;
}

/** Auth falsa: solo lo que usa AuthService para conocer la sesión. */
export function authDePrueba(usuario: UsuarioDePrueba | null = null): Auth {
  const actual = usuario
    ? ({
        uid: usuario.uid,
        email: usuario.email ?? `${usuario.uid}@prueba.cl`,
        emailVerified: usuario.emailVerified ?? true,
        displayName: usuario.displayName ?? null,
        metadata: {},
        providerData: [],
        getIdToken: async () => 'token-de-prueba',
        reload: async () => undefined,
      } as unknown as User)
    : null;

  return {
    currentUser: actual,
    // firebase/auth delega onAuthStateChanged(auth, …) en este método.
    onAuthStateChanged: (siguiente: ((u: User | null) => void) | { next?: (u: User | null) => void }) => {
      const avisar = typeof siguiente === 'function' ? siguiente : siguiente.next?.bind(siguiente);
      queueMicrotask(() => avisar?.(actual));
      return () => undefined;
    },
    onIdTokenChanged: () => () => undefined,
    authStateReady: async () => undefined,
    signOut: async () => undefined,
  } as unknown as Auth;
}

let contador = 0;
const appsCreadas: FirebaseApp[] = [];

function appDePrueba(): FirebaseApp {
  const app = initializeApp(
    { apiKey: 'clave-de-prueba', projectId: 'demo-ciudad-alerta', appId: '1:000000000000:web:prueba' },
    `prueba-${++contador}`,
  );
  appsCreadas.push(app);
  return app;
}

/** Libera las apps creadas (lo llama usarEntornoDePrueba() al terminar cada archivo). */
export async function cerrarFirebaseDePrueba(): Promise<void> {
  await Promise.all(appsCreadas.splice(0).map((app) => deleteApp(app).catch(() => undefined)));
}

/**
 * Proveedores de Firebase para TestBed. Con `usuario`, la sesión empieza
 * abierta con ese usuario.
 */
export function provideFirebaseDePrueba(usuario: UsuarioDePrueba | null = null): EnvironmentProviders {
  return makeEnvironmentProviders(proveedoresFirebaseDePrueba(usuario));
}

export function proveedoresFirebaseDePrueba(usuario: UsuarioDePrueba | null = null): Provider[] {
  return [
    { provide: FIREBASE_APP, useFactory: appDePrueba },
    { provide: FIREBASE_AUTH, useFactory: () => authDePrueba(usuario) },
    {
      provide: FIRESTORE,
      useFactory: (app: FirebaseApp): Firestore => {
        const firestore = initializeFirestore(app, {});
        // Antes que cualquier lectura: la cola de Firestore respeta el orden.
        void disableNetwork(firestore);
        return firestore;
      },
      deps: [FIREBASE_APP],
    },
    { provide: FIREBASE_STORAGE, useFactory: (app: FirebaseApp) => getStorage(app), deps: [FIREBASE_APP] },
  ];
}
