// No es una prueba: carga los datos de prueba en los emuladores y deja abierto el portal para recorrerlo a mano
// (`npm run manual`). Termina al cerrar la ventana del navegador. Nunca toca el proyecto real: el portal corre en
// modo «e2e» (VITE_USAR_EMULADOR=1) y los datos van a los emuladores de Auth y Firestore.
import { test } from '@playwright/test'
import { CLAVE, CUENTAS, sembrar } from './datos/semilla'

test('Portal con datos de prueba, para recorrerlo a mano', async ({ page }) => {
  await sembrar(true)
  console.log('\nCuentas de prueba (clave de todas: %s)\n', CLAVE)
  for (const [nombre, c] of Object.entries(CUENTAS)) {
    console.log(`  ${nombre.padEnd(12)} ${c.correo.padEnd(28)} ${c.role}`)
  }
  console.log('\nCierra la ventana del navegador para terminar.\n')
  await page.goto('/login')
  await page.waitForEvent('close', { timeout: 0 })
})
