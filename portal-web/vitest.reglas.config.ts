import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

// Pruebas de las reglas de Firestore (corren contra el emulador; ver
// "test:reglas" en package.json). Aparte de la configuración de la app.
export default defineConfig({
  resolve: {
    alias: {
      '@ciudad-alerta/comun': fileURLToPath(new URL('../comun/src/index.ts', import.meta.url)),
    },
  },
  test: {
    include: ['rules-tests/**/*.test.ts'],
    environment: 'node',
    // Las pruebas comparten un único emulador: se ejecutan en serie.
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 30000,
  },
})
