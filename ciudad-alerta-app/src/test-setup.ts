import { TestBed } from '@angular/core/testing';
import { afterAll, beforeEach } from 'vitest';

import { cerrarFirebaseDePrueba, proveedoresDePrueba } from './testing';

// Polyfills for running unit tests under jsdom (the default Vitest environment).
// Ionic components such as ion-menu and ion-split-pane query `window.matchMedia`,
// which jsdom does not implement.
if (!window.matchMedia) {
  window.matchMedia = (query: string): MediaQueryList =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    }) as MediaQueryList;
}

// Ionic, router y Firebase sin red para todas las pruebas (ver src/testing).
// Cada prueba puede agregar o sobrescribir proveedores con su propio
// TestBed.configureTestingModule.
beforeEach(() => {
  TestBed.configureTestingModule({ providers: proveedoresDePrueba() });
});

afterAll(() => cerrarFirebaseDePrueba());
