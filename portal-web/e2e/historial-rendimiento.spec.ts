// Fase 12 (parte 3) y 13: historial del vecino, autor del reporte, enlace del mapa de calor y rendimiento del mapa.
import { expect, test } from '@playwright/test'
import { R, bd, sembrar } from './datos/semilla'
import { bloquearMosaicos, filtro } from './ayudas/mapa'
import { paginaDe, rutaSesion } from './ayudas/sesion'

test.beforeAll(async () => {
  await sembrar()
})

test('MS3 · «Historial» lista solo los reportes del vecino con su estado', async ({ browser }) => {
  const page = await paginaDe(browser, 'vecino2')
  await page.goto('/historial')
  await expect(page.getByRole('heading', { name: 'Mi historial de reportes' })).toBeVisible()
  // El vecino 2 es autor de 5 reportes (r_ajeno 1 a 5): nada de otros autores.
  const propios = (await bd.collection('reports').where('uid', '==', 'vec2').count().get()).data().count
  await expect(page.locator('tbody tr')).toHaveCount(propios, { timeout: 20_000 })
  await expect(page.getByRole('row').filter({ hasText: R.ajeno }).getByText('Reportado')).toBeVisible()
  await expect(page.getByText(R.nuevo)).toHaveCount(0)
  await page.getByRole('row').filter({ hasText: R.ajeno }).getByRole('button', { name: 'Ver detalle' }).click()
  await expect(page.locator('[aria-labelledby="detalle-reporte-titulo"]')).toBeVisible()

  const sinReportes = await paginaDe(browser, 'vecino4')
  await sinReportes.goto('/historial')
  await expect(sinReportes.getByText('Todavía no has creado ningún reporte.')).toBeVisible()
})

test.describe('Administrador', () => {
  test.use({ storageState: rutaSesion('admin') })

  test('RI13 · El detalle muestra el nombre del creador del reporte', async ({ page }) => {
    await page.goto('/admin/reportes?reporte=r_nuevo')
    const d = page.locator('[aria-labelledby="detalle-reporte-titulo"]')
    await expect(d.getByText('Autor', { exact: true })).toBeVisible()
    await expect(d.getByText('Vecina Uno')).toBeVisible()
  })

  test('WG3 · Del mapa de calor al listado de reportes de una comuna', async ({ page }) => {
    await bloquearMosaicos(page)
    await page.goto('/admin/mapa-calor')
    const ranking = page.getByRole('region', { name: 'Comunas con más reportes sin resolver' })
    await ranking.getByRole('button').first().click()
    await page.getByRole('link', { name: /Ver reportes de esta comuna/ }).click()
    await expect(page).toHaveURL(/\/admin\/reportes\?comuna=Maip/)
    await expect(page.getByRole('combobox', { name: 'Comuna' })).toHaveValue('Maipú')
    await expect(page.getByRole('article').first()).toBeVisible({ timeout: 20_000 })
  })
})

test.describe('Rendimiento del mapa', () => {
  test.use({ storageState: rutaSesion('vecino1') })

  test('MS7 · El mapa con 500 reportes en la región carga con un P95 menor a 7 s', async ({ page }) => {
    test.setTimeout(420_000)
    await bloquearMosaicos(page)
    const tiempos: number[] = []
    for (let i = 0; i < 20; i++) {
      const inicio = Date.now()
      await page.goto('/mapa')
      await filtro(page, 'Región').selectOption({ label: 'Coquimbo' })
      await expect(page.getByText(/500 incidencias en Coquimbo/)).toBeVisible({ timeout: 30_000 })
      await expect(page.locator('.leaflet-marker-icon').first()).toBeAttached({ timeout: 15_000 })
      tiempos.push(Date.now() - inicio)
    }
    tiempos.sort((a, b) => a - b)
    const p95 = tiempos[18] // ejecución 19 de 20, de menor a mayor
    console.log(`MS7 tiempos (ms): ${tiempos.join(', ')} · P95 = ${p95} ms`)
    expect(p95).toBeLessThan(7000)
  })
})
