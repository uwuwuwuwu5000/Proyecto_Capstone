// Fase 0.6: una cuenta de organismo (rol de la app móvil, solo lectura) no tiene vista en el portal.
// Debe ver un mensaje claro, sin errores de permiso, y poder cerrar la sesión.
import { expect, test } from '@playwright/test'
import { sembrar } from './datos/semilla'
import { paginaDe } from './ayudas/sesion'

test.beforeAll(async () => {
  await sembrar()
})

test('WX2 · Una cuenta de organismo ve el mensaje de la app móvil, sin errores de permiso', async ({ browser }) => {
  const page = await paginaDe(browser, 'organismo')
  const errores: string[] = []
  page.on('console', (m) => m.type() === 'error' && errores.push(m.text()))

  // En el inicio y en cualquier ruta del portal ve el mismo mensaje.
  for (const ruta of ['/', '/mapa', '/historial', '/admin', '/operador', '/mi-nivel']) {
    await page.goto(ruta)
    await expect(page.getByRole('heading', { name: 'Esta cuenta se usa desde la app móvil' })).toBeVisible()
  }

  // La barra no ofrece vistas que no existen para este rol.
  await expect(page.getByRole('link', { name: 'Mapas' })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Historial' })).toHaveCount(0)
  await page.getByRole('button', { name: /Organismo Maipú/ }).click()
  await expect(page.getByText('Organismo', { exact: true })).toBeVisible()

  // Ninguna consulta de reportes: no hubo errores de permiso en la consola.
  expect(errores.filter((e) => /permission|permisos/i.test(e))).toEqual([])

  // Puede cerrar la sesión y vuelve al inicio público.
  await page.getByRole('button', { name: 'Cerrar sesión' }).first().click()
  await expect(page).toHaveURL('/')
  await expect(page.getByRole('heading', { name: 'Esta cuenta se usa desde la app móvil' })).toHaveCount(0)
})
