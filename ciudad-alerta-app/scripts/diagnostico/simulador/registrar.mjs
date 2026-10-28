/**
 * Se carga con `node --import ./scripts/diagnostico/simulador/registrar.mjs`:
 * hace que `firebase/firestore` y `@firebase/rules-unit-testing` resuelvan al
 * simulador en vez de al emulador de Firestore.
 */
import { register } from 'node:module';

register('./cargador.mjs', import.meta.url);
