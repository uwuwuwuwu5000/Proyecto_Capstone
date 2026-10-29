// Fase 9: Resumen del administrador y panel del operador.
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { R, bd, sembrar } from './datos/semilla'
import { bloquearMosaicos } from './ayudas/mapa'
import { paginaDe, rutaSesion } from './ayudas/sesion'

test.beforeAll(async () => {
  await sembrar()
})

const tarjeta = (page: Page, texto: string) => page.getByRole('article').filter({ hasText: texto })
const rango = (page: Page) => page.getByRole('navigation', { name: 'Paginación de reportes' }).first().locator('[aria-live="polite"]')
const indicador = (page: Page, etiqueta: string) =>
  page.getByRole('region', { name: 'Indicadores' }).getByRole('link').filter({ hasText: etiqueta })

test.describe('Resumen del administrador', () => {
  test.use({ storageState: rutaSesion('admin') })

  test('WR1 / AD9 · Indicadores del día', async ({ page }) => {
    await page.goto('/admin')
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Admin Prueba')
    await expect(indicador(page, 'Reportes nuevos hoy')).toContainText(/Ayer: \d/)
    // Las 520 de La Serena no tienen operador; las demás sí.
    await expect(indicador(page, 'Pendientes de asignar')).toContainText('520')
    await expect(indicador(page, 'Pendientes de asignar')).toContainText('Requieren atención')
    // Tres operadores activos, uno sin cuenta.
    await expect(indicador(page, 'Operadores activos')).toContainText('3')
    await expect(indicador(page, 'Operadores activos')).toContainText('1 sin cuenta')
    // Solo la conversación «abierta» espera respuesta.
    await expect(indicador(page, 'Soporte sin atender')).toContainText('1')
    await expect(indicador(page, 'Soporte sin atender')).toContainText('Vecinos esperando respuesta')
  })

  test('WR2 · Alertas con enlace a la lista ya filtrada', async ({ page }) => {
    await page.goto('/admin')
    const alertas = page.getByRole('region', { name: 'Alertas' })
    await expect(alertas.getByText('operadores activos no tienen cuenta de acceso')).toBeVisible()
    await expect(alertas.getByText('conversaciones de soporte esperan respuesta')).toBeVisible()
    await alertas.getByRole('link', { name: /operadores activos no tienen cuenta/ }).click()
    await expect(page).toHaveURL(/\/admin\/operadores\?sinCuenta=1/)
  })

  test('WR3 · Estado de los reportes: porcentaje de cerrados y enlace por estado', async ({ page }) => {
    await page.goto('/admin')
    const panel = page.getByRole('region', { name: 'Estado de los reportes' })
    const cerrados = (await bd.collection('reports').where('estado', '==', 'cerrado').count().get()).data().count
    const total = (await bd.collection('reports').count().get()).data().count
    await expect(panel.getByText(new RegExp(`cerrados · ${cerrados} de ${total} reportes`))).toBeVisible()
    await expect(panel.getByRole('listitem')).toHaveCount(6)
    await panel.getByRole('link', { name: /Resuelto/ }).click()
    await expect(page).toHaveURL(/\/admin\/reportes\?estado=resuelto/)
  })

  test('WR4 · Actividad reciente: el detalle abre sobre el Resumen y permite cambiar el estado', async ({ page }) => {
    await page.goto('/admin')
    const actividad = page.getByRole('region', { name: 'Actividad reciente' })
    await expect(actividad.getByRole('button')).toHaveCount(6)
    await actividad.getByRole('button').first().click()
    const d = page.locator('[aria-labelledby="detalle-reporte-titulo"]')
    await expect(d).toBeVisible()
    await expect(page).toHaveURL(/\/admin$/)
    await d.getByRole('button', { name: 'Cerrar detalle' }).click()
    await expect(d).toHaveCount(0)
  })

  test('WR5 · Resueltos del mes y tiempo promedio de resolución', async ({ page }) => {
    await page.goto('/admin')
    await expect(indicador(page, 'Resueltos este mes')).toContainText(/Cerrados sin resolver: \d+/)
    const promedio = indicador(page, 'Tiempo promedio de resolución')
    await expect(promedio).not.toContainText('—')
    await expect(promedio).toContainText(/En \d+ reportes resueltos/)
  })
})

test.describe('Panel del operador A', () => {
  test.use({ storageState: rutaSesion('operadorA') })

  test('WP1 / AD6 · El operador ve solo los reportes asignados a su operador', async ({ page }) => {
    await page.goto('/operador/reportes')
    await expect(page.getByRole('heading', { name: 'Mis reportes' })).toBeVisible()
    await expect(rango(page)).toHaveText(/de 79$/, { timeout: 20_000 })
    await page.getByRole('navigation', { name: 'Paginación de reportes' }).first().getByLabel('Por página').selectOption('48')
    await expect(page.getByText(R.cerrillos)).toHaveCount(0)
    await expect(tarjeta(page, R.real)).toBeVisible()
  })

  test('WP2 / AD8 · El operador cambia el estado de un reporte propio con veredicto', async ({ page }) => {
    await page.goto('/operador/reportes')
    await page.getByRole('navigation', { name: 'Paginación de reportes' }).first().getByLabel('Por página').selectOption('48')
    // Sin veredicto no hay cambio de estado.
    await expect(tarjeta(page, R.nuevo).getByText('Falta el veredicto para cambiar el estado')).toBeVisible()
    const t = tarjeta(page, R.real)
    await t.getByRole('button', { name: 'Cambiar estado' }).click()
    await t.getByRole('combobox', { name: 'Nuevo estado' }).selectOption({ label: 'En revisión' })
    await t.getByRole('button', { name: 'Guardar' }).click()
    await expect.poll(async () => (await bd.doc('reports/r_real').get()).data()?.estado).toBe('en_revision')
    const historial = await bd.collection('reports/r_real/statusHistory').get()
    expect(historial.docs[0].data()).toMatchObject({ autorNombre: 'Municipalidad de Maipú', autorRol: 'operador', hacia: 'en_revision' })
  })

  test('WG12 · «Por verificar» desde la pestaña del operador', async ({ page }) => {
    await page.goto('/operador')
    await page.getByRole('navigation', { name: 'Panel de operador' }).getByRole('link', { name: 'Por verificar' }).click()
    await expect(page).toHaveURL(/verificacion=por_verificar/)
    await expect(tarjeta(page, R.validado)).toBeVisible()
    await expect(page.getByRole('article')).toHaveCount(1)
  })

  test('WP3 · Estadísticas del operador: solo sus reportes', async ({ page }) => {
    await page.goto('/operador/estadisticas')
    await expect(page.getByRole('heading', { name: 'Estadísticas' })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Resumen' })).toBeVisible({ timeout: 20_000 })
  })

  test('WP3 · Mapa de gestión del operador', async ({ page }) => {
    await bloquearMosaicos(page)
    await page.goto('/operador')
    await expect(page.getByRole('heading', { name: 'Mis reportes' })).toBeVisible()
    await expect(page.locator('.leaflet-container')).toBeVisible()
  })
})

test('WP1 · El operador B solo ve su único reporte', async ({ browser }) => {
  const page = await paginaDe(browser, 'operadorB')
  await page.goto('/operador/reportes')
  await expect(rango(page)).toHaveText(/1–1 de 1$/, { timeout: 20_000 })
  await expect(tarjeta(page, R.cerrillos)).toBeVisible()
  await expect(page.getByText(R.real)).toHaveCount(0)
})
