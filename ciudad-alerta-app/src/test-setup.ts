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

// Solo polyfills globales. Los proveedores de las pruebas (Ionic, router,
// Firebase sin red) NO van aquí: en Windows este archivo se carga fuera del
// paquete de pruebas, con otra copia de Angular, y lo que configure en TestBed
// no llega a las pruebas. Cada *.spec.ts llama a usarEntornoDePrueba()
// (src/testing/entorno-de-prueba.ts).
export {};
