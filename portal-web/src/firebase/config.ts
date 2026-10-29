// Inicialización del SDK de Firebase.
// Se usan Firebase Authentication y Cloud Firestore.
import { getApps, initializeApp } from 'firebase/app'
import { connectAuthEmulator, getAuth } from 'firebase/auth'
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore'

// Configuración del proyecto de Firebase "ciudadalerta".
// Estos valores son públicos por diseño (identifican el proyecto en el cliente);
// las reglas de seguridad de Firebase son las que protegen los datos.
const firebaseConfig = {
  apiKey: "AIzaSyD2wsLMB3n7MZ7FN2J5j52QlyOvvi7zkbA",
  authDomain: "ciudadalerta.firebaseapp.com",
  databaseURL: "https://ciudadalerta-default-rtdb.firebaseio.com",
  projectId: "ciudadalerta",
  storageBucket: "ciudadalerta.firebasestorage.app",
  messagingSenderId: "123870707887",
  appId: "1:123870707887:web:9b29d0c5fe20bf1f40945a",
  measurementId: "G-XT39KJ9704"
};

// Pruebas de pantalla (Playwright): con VITE_USAR_EMULADOR=1 el portal se conecta a los
// emuladores locales de Auth y Firestore y NUNCA al proyecto real. Ver e2e/LEEME.md.
export const USAR_EMULADOR = import.meta.env.VITE_USAR_EMULADOR === '1'
const configActiva = USAR_EMULADOR
  ? { ...firebaseConfig, apiKey: 'demo-key', projectId: 'demo-ciudad-alerta' }
  : firebaseConfig

const app = initializeApp(configActiva)

// Instancias únicas compartidas por toda la app.
export const auth = getAuth(app)
export const db = getFirestore(app)
if (USAR_EMULADOR) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
  connectFirestoreEmulator(db, '127.0.0.1', 8080)
}

// Sprint 4 · Al crear una cuenta de organismo desde el panel de admin,
// createUserWithEmailAndPassword() iniciaría sesión como esa cuenta nueva en
// vez de mantener al admin logueado. Se evita con una segunda instancia de
// Firebase, con su propio Auth aislado — nunca toca la sesión principal.
const NOMBRE_APP_APROVISIONAMIENTO = 'aprovisionamiento-admin'

export function getAuthAprovisionamiento() {
  const existente = getApps().find((a) => a.name === NOMBRE_APP_APROVISIONAMIENTO)
  const appSecundaria =
    existente ?? initializeApp(configActiva, NOMBRE_APP_APROVISIONAMIENTO)
  const authSecundaria = getAuth(appSecundaria)
  if (USAR_EMULADOR && !existente) {
    connectAuthEmulator(authSecundaria, 'http://127.0.0.1:9099', { disableWarnings: true })
  }
  return authSecundaria
}
