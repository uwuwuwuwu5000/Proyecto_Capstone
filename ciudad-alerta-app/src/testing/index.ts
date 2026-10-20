/**
 * Ayudas para las pruebas de la app (`npm test`). Solo las importan archivos
 * `*.spec.ts` y `src/test-setup.ts`: no entran al build de la aplicación.
 */
export {
  authDePrueba,
  cerrarFirebaseDePrueba,
  provideFirebaseDePrueba,
  proveedoresFirebaseDePrueba,
} from './firebase-de-prueba';
export type { UsuarioDePrueba } from './firebase-de-prueba';
export { proveedoresDePrueba } from './proveedores-de-prueba';
