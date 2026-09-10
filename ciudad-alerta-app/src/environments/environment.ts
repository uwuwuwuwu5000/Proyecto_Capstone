/**
 * CA-45 · Configuración de Firebase
 *
 * Reemplaza los valores por los de tu proyecto:
 * Firebase Console → Configuración del proyecto → Tus apps → App web → SDK setup and configuration.
 *
 * Nota de seguridad: estas claves NO son secretas (viajan en el bundle del cliente).
 * Lo que protege los datos son las reglas de Firestore (CA-79) y las restricciones
 * de la API key en Google Cloud Console.
 */
export const environment = {
  production: false,

  /**
   * Dónde se guardan las fotografías de los reportes.
   *  'firestore'     → colección `reportPhotos`, funciona en el plan Spark.
   *  'cloud-storage' → Firebase Storage, requiere plan Blaze desde feb-2026.
   * Cambiar este valor es lo único necesario para migrar entre ambos.
   */
  photoStorage: 'firestore' as 'firestore' | 'cloud-storage',
  firebase: {
    apiKey: "AIzaSyD2wsLMB3n7MZ7FN2J5j52QlyOvvi7zkbA",
    authDomain: "ciudadalerta.firebaseapp.com",
    projectId: "ciudadalerta",
    storageBucket: "ciudadalerta.firebasestorage.app",
    messagingSenderId: "123870707887",
    appId: "1:123870707887:web:9b29d0c5fe20bf1f40945a",
    measurementId: "G-XT39KJ9704"
  },
};
