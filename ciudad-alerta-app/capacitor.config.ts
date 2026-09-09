import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'cl.ciudadalerta.app',
  appName: 'Ciudad Alerta',
  // Debe apuntar a la carpeta que contiene index.html tras `ionic build`.
  // Con el builder `@angular/build:application` de Angular 17+, revisa angular.json:
  // si outputPath es { "base": "www", "browser": "" } el índice queda en www/
  // si outputPath es "www" a secas, el índice queda en www/browser y debes usar 'www/browser'.
  webDir: 'www',
  android: {
    // Mantener en false. Actívalo solo de forma temporal si usas live reload por http.
    allowMixedContent: false,
  },
  server: {
    androidScheme: 'https',
  },
};

export default config;