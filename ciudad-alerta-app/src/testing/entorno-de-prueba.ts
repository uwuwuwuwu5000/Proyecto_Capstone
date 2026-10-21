import { TestBed } from '@angular/core/testing';
import { addIcons } from 'ionicons';
import { afterAll, beforeEach } from 'vitest';

import { CONFIG_MODULOS } from '../app/modulos.config';
import { iconosDeModulos } from '../app/nucleo/modulos/registro';
import { UsuarioDePrueba, cerrarFirebaseDePrueba } from './firebase-de-prueba';
import { proveedoresDePrueba } from './proveedores-de-prueba';

// Los íconos de los botones de cada módulo los registra provideModulos() en
// la app; en las pruebas no corre, y sin esto Ionicons intenta descargarlos
// (en Windows llena la consola de «Invalid URL»).
addIcons(iconosDeModulos(CONFIG_MODULOS));

/**
 * Prepara cada prueba del archivo con lo mismo que registra `main.ts`, sin
 * red: Ionic, router, Firebase de prueba y almacenamiento de fotos.
 *
 * Va al comienzo de **cada** `*.spec.ts`, fuera del `describe`:
 *
 *   import { usarEntornoDePrueba } from '../../testing';
 *
 *   usarEntornoDePrueba();
 *
 *   describe('MiPantalla', () => { … });
 *
 * Por qué no en `src/test-setup.ts`: en Windows, el builder de Angular carga
 * ese archivo fuera del paquete de pruebas, con otra copia de Angular, y lo que
 * configura ahí no llega a las pruebas (fallaban 32 con «No provider found for
 * InjectionToken FIRESTORE»). Llamarlo desde la prueba funciona igual en
 * Windows, Linux y macOS.
 *
 * Cualquier proveedor se puede reemplazar después en el `beforeEach` del
 * archivo con `TestBed.configureTestingModule({ providers: [...] })`.
 *
 * @param usuario Si se indica, la sesión empieza abierta con ese usuario.
 */
export function usarEntornoDePrueba(usuario: UsuarioDePrueba | null = null): void {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: proveedoresDePrueba(usuario) });
  });

  afterAll(() => cerrarFirebaseDePrueba());
}
