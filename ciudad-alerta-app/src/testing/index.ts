/**
 * Ayudas para las pruebas de la app (`npm test`). Solo las importan archivos
 * `*.spec.ts`: no entran al build de la aplicación.
 *
 * Cada prueba empieza con `usarEntornoDePrueba()` (ver entorno-de-prueba.ts).
 */
export { usarEntornoDePrueba } from './entorno-de-prueba';
export {
  authDePrueba,
  cerrarFirebaseDePrueba,
  provideFirebaseDePrueba,
  proveedoresFirebaseDePrueba,
} from './firebase-de-prueba';
export type { UsuarioDePrueba } from './firebase-de-prueba';
export { proveedoresDePrueba } from './proveedores-de-prueba';
