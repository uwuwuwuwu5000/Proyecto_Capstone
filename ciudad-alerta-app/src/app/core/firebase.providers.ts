import {
  EnvironmentProviders,
  InjectionToken,
  makeEnvironmentProviders,
} from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { FirebaseApp, getApps, initializeApp } from 'firebase/app';
import {
  Auth,
  browserLocalPersistence,
  connectAuthEmulator,
  getAuth,
  indexedDBLocalPersistence,
  initializeAuth,
} from 'firebase/auth';
import {
  Firestore,
  connectFirestoreEmulator,
  getFirestore,
} from 'firebase/firestore';
import {
  FirebaseStorage,
  connectStorageEmulator,
  getStorage,
} from 'firebase/storage';

import { environment } from '../../environments/environment';

/**
 * CA-45 / CA-78 · Integración de Firebase sin @angular/fire.
 *
 * AngularFire fija su peer dependency al major de Angular y hoy solo llega a
 * Angular 20, mientras el proyecto corre sobre Angular 22. Usamos el SDK
 * modular oficial (`firebase`), que no depende de Angular, y lo exponemos
 * mediante InjectionTokens para conservar inyección de dependencias y tests.
 */

export const FIREBASE_APP = new InjectionToken<FirebaseApp>('FIREBASE_APP');
export const FIREBASE_AUTH = new InjectionToken<Auth>('FIREBASE_AUTH');
export const FIRESTORE = new InjectionToken<Firestore>('FIRESTORE');

/**
 * Solo lo consume CloudStoragePhotoService. Declararlo no cuesta nada: el SDK
 * no contacta al bucket hasta la primera operación.
 */
export const FIREBASE_STORAGE = new InjectionToken<FirebaseStorage>('FIREBASE_STORAGE');

/** Evita reinicializar la app durante el hot reload de `ionic serve`. */
function createFirebaseApp(): FirebaseApp {
  const existentes = getApps();
  return existentes.length > 0 ? existentes[0] : initializeApp(environment.firebase);
}

/**
 * CA-50 · Persistencia de sesión.
 * En la WebView de Android usamos indexedDBLocalPersistence, que es la que
 * sobrevive al cierre de la app. En navegador basta con localStorage.
 */
function createFirebaseAuth(app: FirebaseApp): Auth {
  if (Capacitor.isNativePlatform()) {
    try {
      return initializeAuth(app, { persistence: indexedDBLocalPersistence });
    } catch {
      // initializeAuth lanza si Auth ya fue inicializado (recarga en caliente).
      return getAuth(app);
    }
  }

  const auth = getAuth(app);
  void auth.setPersistence(browserLocalPersistence);
  return auth;
}

/** BUG 71 · Conexión a los emuladores locales cuando el entorno lo pide. */
function conectarEmuladores(auth: Auth, firestore: Firestore, storage: FirebaseStorage): void {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(firestore, '127.0.0.1', 8080);
  connectStorageEmulator(storage, '127.0.0.1', 9199);
}

export function provideFirebase(): EnvironmentProviders {
  return makeEnvironmentProviders([
    { provide: FIREBASE_APP, useFactory: createFirebaseApp },
    {
      provide: FIREBASE_AUTH,
      useFactory: createFirebaseAuth,
      deps: [FIREBASE_APP],
    },
    {
      provide: FIRESTORE,
      useFactory: (app: FirebaseApp) => getFirestore(app),
      deps: [FIREBASE_APP],
    },
    {
      provide: FIREBASE_STORAGE,
      useFactory: (app: FirebaseApp, auth: Auth, firestore: Firestore) => {
        const storage = getStorage(app);

        if (environment.useEmulators) {
          conectarEmuladores(auth, firestore, storage);
        }

        return storage;
      },
      deps: [FIREBASE_APP, FIREBASE_AUTH, FIRESTORE],
    },
  ]);
}
