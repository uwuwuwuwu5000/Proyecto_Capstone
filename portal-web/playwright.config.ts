// Pruebas de pantalla del portal (Playwright). Ver e2e/LEEME.md.
import { defineConfig, devices } from '@playwright/test'

const PUERTO = 5174
const carpetaEvidencia = process.env.EVIDENCIA_DIR // si existe, el reporte JUnit se deja allí

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  // Las pruebas comparten un único emulador y los mismos datos: se ejecutan en serie.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 7_000 },
  reporter: [
    ['list'],
    ['html', { open: 'never' }],
    ['junit', { outputFile: `${carpetaEvidencia ?? 'test-results'}/e2e-portal.xml` }],
  ],
  use: {
    baseURL: `http://localhost:${PUERTO}`,
    locale: 'es-CL',
    timezoneId: 'America/Santiago',
    reducedMotion: 'reduce', // sin animaciones del mapa
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // El modo «e2e» carga .env.e2e (se crea en la fase 2, con la conexión a los emuladores).
    command: `npm run dev -- --mode e2e --port ${PUERTO} --strictPort`,
    url: `http://localhost:${PUERTO}`,
    reuseExistingServer: true,
    stderr: 'ignore',
    timeout: 120_000,
  },
})
