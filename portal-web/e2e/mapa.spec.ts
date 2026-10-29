// Fase 6: mapa público (vecino con sesión). Los mosaicos de OpenStreetMap se bloquean.
import { expect, test } from '@playwright/test'
import { POSICION, R, sembrar } from './datos/semilla'
import { abrirDetalle, abrirMapa, acercarA, filtro, pinDe } from './ayudas/mapa'
import { paginaDe, rutaSesion } from './ayudas/sesion'

test.beforeAll(async () => {
  await sembrar()
})

test.describe('Mapa público', () => {
  test.use({ storageState: rutaSesion('vecino1') })

  test('MS1 / WB1 · Filtros de región, categoría y estado', async ({ page }) => {
    await abrirMapa(page)
    // Toda la Región Metropolitana: 80 incidencias (incluye el reporte antiguo sin campo región: WB6).
    await expect(page.getByText(/80 incidencias en /)).toBeVisible()
    await filtro(page, 'Estado').selectOption({ label: 'Cerrado' })
    await expect(page.getByText(/11 incidencias en /)).toBeVisible()
    await filtro(page, 'Categoría').selectOption({ label: 'Luminaria' })
    await expect(page.getByText(/1 incidencia en /)).toBeVisible()
    await filtro(page, 'Categoría').selectOption({ label: 'Otro' })
    await expect(page.getByText(/No hay incidencias en .* con estos filtros/)).toBeVisible()
  })

  test('WB6 · El reporte antiguo sin región aparece una sola vez', async ({ page }) => {
    await abrirMapa(page)
    await expect(page.getByText(/80 incidencias en /)).toBeVisible()
    await pinDe(page, 'r_antiguo')
    await expect(page.locator('[data-reporte-id="r_antiguo"]')).toHaveCount(1)
  })

  test('WB5 · La lectura se limita a 500 por región y lo avisa', async ({ page }) => {
    await abrirMapa(page)
    await filtro(page, 'Región').selectOption({ label: 'Coquimbo' })
    await expect(page.getByText(/500 incidencias en Coquimbo/)).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText(/Se muestran las 500 más recientes/)).toBeVisible()
  })

  test('WB1 · Al cambiar de región se muestran los pines sin tener que mover el mapa', async ({ page }) => {
    await abrirMapa(page)
    await filtro(page, 'Región').selectOption({ label: 'Coquimbo' })
    await expect(page.getByText(/incidencias en Coquimbo/)).toBeVisible({ timeout: 20_000 })
    await expect(page.locator('.leaflet-marker-icon').first()).toBeAttached({ timeout: 10_000 })
  })

  test('MS2 / WB8 · Panel del reporte con foto, fecha, confirmaciones, verificación e historial', async ({ page }) => {
    await abrirMapa(page)
    await abrirDetalle(page, 'r_resuelto')
    const panel = page.getByRole('complementary')
    await expect(panel.getByText(R.resuelto)).toBeVisible()
    await expect(panel.getByText('Confirmaciones')).toBeVisible()
    await expect(panel.getByRole('progressbar', { name: 'Verificación de la comunidad' })).toBeVisible()
    await panel.getByRole('button', { name: 'Ver historial de estados' }).click()
    await expect(panel.getByText('Revisamos el caso')).toBeVisible()
    await panel.getByRole('button', { name: 'Cerrar detalle del reporte' }).click()
    await expect(panel).toHaveCount(0)
  })

  test('WB7 · El enlace de administración solo lo ve el administrador', async ({ page, browser }) => {
    await abrirMapa(page)
    await abrirDetalle(page, 'r_nuevo')
    await expect(page.getByRole('link', { name: /Editar \/ ver más en administración/ })).toHaveCount(0)

    const admin = await paginaDe(browser, 'admin')
    await abrirMapa(admin)
    await abrirDetalle(admin, 'r_nuevo')
    await admin.getByRole('link', { name: /Editar \/ ver más en administración/ }).click()
    await expect(admin).toHaveURL(/\/admin\/reportes\?reporte=r_nuevo/)
  })

  test('WB3 · Los reportes cercanos se agrupan en un círculo con el total y se separan al acercar', async ({ page }) => {
    await abrirMapa(page)
    const grupos = page.locator('.grupo-incidencias__burbuja')
    await expect(grupos.first()).toBeVisible()
    const total = await grupos.count()
    const texto = await grupos.first().innerText()
    expect(Number(texto.replace('+', ''))).toBeGreaterThan(1)
    await grupos.first().click()
    // Tras acercar, cambia lo que se ve (más pines sueltos o grupos más chicos).
    await expect.poll(async () => (await grupos.count()) + (await page.locator('[data-reporte-id]').count())).not.toBe(total)
  })

  test('WB4 · Tres reportes en el mismo punto: lista y «Ver detalle» sin errores', async ({ page }) => {
    await abrirMapa(page)
    const { lat, lng } = POSICION.r_punto1
    const grupo = page.locator('.grupo-incidencias__burbuja', { hasText: /^3$/ })
    await acercarA(page, lat, lng, () => expect(grupo).toBeVisible({ timeout: 2_000 }))
    await grupo.click()
    await expect(page.getByText('3 reportes en el mismo lugar')).toBeVisible()
    await page.getByRole('button', { name: 'Ver detalle' }).first().click()
    const panel = page.getByRole('complementary')
    await expect(panel.getByText(/E2E reporte \d en el mismo punto/)).toBeVisible()
    // El detalle se mantiene abierto (antes se cerraba solo).
    await page.waitForTimeout(800)
    await expect(panel.getByText(/E2E reporte \d en el mismo punto/)).toBeVisible()
  })
})

test.describe('Mapa: ubicación', () => {
  test.use({ storageState: rutaSesion('vecino1'), geolocation: { latitude: -29.9, longitude: -71.25 }, permissions: ['geolocation'] })

  test('WB2 · «Mi región» usa la ubicación y, sin permiso, deja elegir una región', async ({ page, context }) => {
    await abrirMapa(page)
    await expect(filtro(page, 'Región')).toBeVisible()
    await filtro(page, 'Región').selectOption({ label: 'Coquimbo' })
    await expect(page.getByText(/incidencias en Coquimbo/)).toBeVisible({ timeout: 20_000 })
    // La ubicación simulada está en La Serena (Coquimbo): «Mi región» la detecta.
    await filtro(page, 'Región').selectOption({ index: 0 })
    await expect(filtro(page, 'Región')).toHaveValue(/actual|04/)
    await context.clearPermissions()
  })
})
