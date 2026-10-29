// Fase 1: comprueba que Playwright, el navegador y el servidor del portal funcionan.
// No toca ninguna base de datos: se bloquean todas las llamadas a Firebase.
import { expect, test } from '@playwright/test'

test('FASE1 · El portal abre sin conectarse a Firebase', async ({ page }) => {
  const bloqueadas: string[] = []
  await page.route(/googleapis\.com|firebaseio\.com|firebaseapp\.com|gstatic\.com|firebase\.google/, (ruta) => {
    bloqueadas.push(ruta.request().url())
    return ruta.abort()
  })
  await page.goto('/')
  await expect(page.locator('#root')).not.toBeEmpty()
  await expect(page).toHaveTitle(/.+/)
})
