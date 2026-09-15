// Inicialización del SDK de Firebase.
// Se usan Firebase Authentication y Cloud Firestore.
import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

// Configuración del proyecto de Firebase "ciudad-alerta-p".
// Estos valores son públicos por diseño (identifican el proyecto en el cliente);
// las reglas de seguridad de Firebase son las que protegen los datos.
// const firebaseConfig = {
//   apiKey: 'AIzaSyC2o_aKmvZWK7ynAeJWqrvr2QWcn5CwpBM',
//   authDomain: 'ciudad-alerta-p.firebaseapp.com',
//   projectId: 'ciudad-alerta-p',
//   storageBucket: 'ciudad-alerta-p.firebasestorage.app',
//   messagingSenderId: '647962679449',
//   appId: '1:647962679449:web:760d29a60e3eb866390008',
//   measurementId: 'G-FHX7MPSZK2',
// }

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

const app = initializeApp(firebaseConfig)

// Instancias únicas compartidas por toda la app.
export const auth = getAuth(app)
export const db = getFirestore(app)
