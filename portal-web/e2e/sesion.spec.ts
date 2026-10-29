// Sesión guardada y pantallas protegidas: abrir una URL del panel directamente no debe sacar a la cuenta administradora.
import { expect, test } from '@playwright/test'
import { sembrar } from './datos/semilla'
import { paginaDe } from './ayudas/sesion'

test.beforeAll(async () => {
  await sembrar()
})

test('WX3 · Abrir directamente una pantalla de administración con la sesión guardada no redirige al inicio', async ({ browser }) => {
  const rutas = ['/admin/organismos', '/admin/operadores', '/admin/categorias', '/admin/cuentas', '/admin/estadisticas', '/admin/reportes']
  // Primera vuelta: calienta el servidor de desarrollo (descarga las pantallas por primera vez, más lenta).
  // Segunda y tercera: las pantallas ya están listas y bajan más rápido que la lectura del perfil, que es cuando fallaba.
  for (let vuelta = 1; vuelta <= 3; vuelta++) {
    for (const ruta of rutas) {
      const page = await paginaDe(browser, 'admin')
      await page.goto(ruta)
      // La redirección indebida ocurre en las primeras décimas de segundo; se espera a que la pantalla asiente.
      await page.waitForTimeout(1_500)
      await expect(page, `vuelta ${vuelta}: ${ruta}`).toHaveURL(new RegExp(`${ruta}$`))
      await expect(page.getByRole('button', { name: /Admin Prueba/ })).toBeVisible()
      await page.context().close()
    }
  }
})
