import { expect } from '@playwright/test'
import type { Browser, Page } from '@playwright/test'
import { CLAVE, CUENTAS } from '../datos/semilla'

export type Cuenta = keyof typeof CUENTAS

/** Archivo con la sesión guardada de cada cuenta (lo crea global-setup.ts). */
export const rutaSesion = (cuenta: Cuenta) => `e2e/.sesiones/${cuenta}.json`

/**
 * Uso en un archivo de pruebas: `test.use({ storageState: rutaSesion('admin') })`.
 * Para mezclar cuentas dentro de una misma prueba: `await paginaDe(browser, 'vecino1')`.
 */
export async function paginaDe(browser: Browser, cuenta: Cuenta): Promise<Page> {
  const contexto = await browser.newContext({ storageState: rutaSesion(cuenta), baseURL: 'http://localhost:5174' })
  return contexto.newPage()
}

/** Inicia sesión por la pantalla de login (para probar el login mismo). */
export async function iniciarSesion(page: Page, cuenta: Cuenta): Promise<void> {
  await page.goto('/login')
  await page.getByLabel('Correo').fill(CUENTAS[cuenta].correo)
  await page.getByLabel('Contraseña').fill(CLAVE)
  await page.getByRole('button', { name: 'Iniciar sesión' }).click()
  await expect(page).toHaveURL('/')
}
