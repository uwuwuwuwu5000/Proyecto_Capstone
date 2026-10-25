import { defineConfig, devices } from '@playwright/test';

/**
 * Pruebas de punta a punta: la app compilada (maqueta, sin Firebase) en un
 * Chromium con tamaño de teléfono. Ver docs/GUIA_PRUEBAS.md.
 *
 *   npm run e2e            compila la maqueta y corre todo
 *   npm run e2e -- --ui    con la interfaz de Playwright
 */
const PUERTO = Number(process.env.PUERTO ?? 4300);

export default defineConfig({
  testDir: './pruebas',
  outputDir: './.resultados',
  fullyParallel: true,
  workers: process.env.CI ? 2 : undefined,
  retries: 0,
  timeout: 45_000,
  expect: { timeout: 8_000 },
  reporter: [['list'], ['html', { outputFolder: './.informe', open: 'never' }]],
  use: {
    baseURL: `http://127.0.0.1:${PUERTO}`,
    ...devices['Pixel 7'],
    // Un teléfono chico: lo que cabe aquí cabe en casi todos.
    viewport: { width: 360, height: 780 },
    locale: 'es-CL',
    timezoneId: 'America/Santiago',
    geolocation: { latitude: -33.5106, longitude: -70.7572, accuracy: 12 },
    permissions: ['geolocation'],
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'telefono', use: { browserName: 'chromium' } }],
  webServer: {
    command: 'node servidor.mjs',
    url: `http://127.0.0.1:${PUERTO}/`,
    reuseExistingServer: !process.env.CI,
    env: { PUERTO: String(PUERTO) },
  },
});
