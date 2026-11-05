// Entorno para probar el portal a mano con los datos de prueba (`npm run manual`). No es parte de la suite
// automática: `playwright.config.ts` ignora este archivo. Ver e2e/manual.spec.ts.
import { defineConfig, devices } from '@playwright/test'

const PUERTO = 5174

export default defineConfig({
  testDir: './e2e',
  testMatch: 'manual.spec.ts',
  timeout: 0, // dura hasta que cierres la ventana del navegador
  reporter: [['list']],
  use: { baseURL: `http://localhost:${PUERTO}`, locale: 'es-CL', timezoneId: 'America/Santiago' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 800 } } }],
  webServer: {
    command: `npm run dev -- --mode e2e --port ${PUERTO} --strictPort`,
    url: `http://localhost:${PUERTO}`,
    reuseExistingServer: true,
    stderr: 'ignore',
    timeout: 120_000,
  },
})
