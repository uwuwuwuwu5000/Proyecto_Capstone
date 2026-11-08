// Fase 14: mejoras visuales de la administración y de Mi perfil (pedido del equipo del 2026-11-06):
// iconos en los cuadros de Estadísticas globales, gráficos de torta, escala azul → rojo del mapa de calor y más
// espacio entre los enlaces legales y «Cerrar sesión».
import { expect, test } from './ayudas/prueba'
import { sembrar } from './datos/semilla'
import { bloquearMosaicos } from './ayudas/mapa'
import { rutaSesion } from './ayudas/sesion'
import type { Page } from '@playwright/test'

test.beforeAll(async () => {
  await sembrar()
})

const NOMBRES = ['Por estado', 'Por categoría', 'Comunas con más reportes'] as const

async function abrirEstadisticas(page: Page) {
  await page.goto('/admin/estadisticas')
  await expect(page.getByRole('heading', { name: 'Estadísticas globales' })).toBeVisible()
  await page.getByRole('group', { name: 'Periodo' }).getByRole('button', { name: 'Todo' }).click()
  await expect(page.getByRole('region', { name: 'Resumen' }).getByText('Reportes', { exact: true })).toBeVisible({ timeout: 20_000 })
}

test.describe('Administrador', () => {
  test.use({ storageState: rutaSesion('admin') })

  test('WE2 · «Por estado», «Por categoría» y «Comunas con más reportes» son gráficos de torta con su leyenda', async ({ page }) => {
    await abrirEstadisticas(page)
    for (const nombre of NOMBRES) {
      const tarjeta = page.locator('section').filter({ has: page.getByRole('heading', { name: nombre, exact: true }) })
      const torta = tarjeta.getByRole('img', { name: new RegExp(`Gráfico de torta: ${nombre}`) })
      await expect(torta, `${nombre}: torta`).toBeVisible()
      const rebanadas = tarjeta.locator('[data-rebanada]')
      const cantidad = await rebanadas.count()
      expect(cantidad, `${nombre}: rebanadas`).toBeGreaterThanOrEqual(1)
      // Como máximo 8 más «Otras».
      expect(cantidad, `${nombre}: rebanadas`).toBeLessThanOrEqual(9)
      // Ya no hay barras horizontales en esa tarjeta.
      await expect(tarjeta.locator('[class*="barraCarril"]')).toHaveCount(0)
      // La leyenda dice cantidad y porcentaje de cada rebanada, y los porcentajes suman 100.
      const leyenda = tarjeta.getByRole('list', { name: `Leyenda de ${nombre}` })
      const etiquetas = await leyenda.getByRole('listitem').evaluateAll((li) => li.map((e) => e.getAttribute('aria-label') ?? ''))
      expect(etiquetas.length, `${nombre}: leyenda`).toBeGreaterThanOrEqual(cantidad)
      const suma = etiquetas.reduce((s, t) => s + Number(/\((\d+)%\)/.exec(t)?.[1] ?? 0), 0)
      expect(suma, `${nombre}: los porcentajes suman`).toBe(100)
    }
    // «Por estado» muestra los seis estados, también los que están en cero.
    const estado = page.getByRole('list', { name: 'Leyenda de Por estado' })
    await expect(estado.getByRole('listitem')).toHaveCount(6)
    // Al imprimir (Exportar PDF) las tortas se siguen viendo.
    await page.emulateMedia({ media: 'print' })
    await expect(page.getByRole('img', { name: /Gráfico de torta: Por estado/ })).toBeVisible()
    const relleno = await page.locator('[data-rebanada]').first().evaluate((e) => getComputedStyle(e).fill)
    expect(relleno).not.toBe('none')
  })

  test('WE3 · Los cuatro cuadros de arriba llevan icono, y en un teléfono se quitan', async ({ page }) => {
    await abrirEstadisticas(page)
    const resumen = page.getByRole('region', { name: 'Resumen' })
    const iconos = resumen.locator('[data-icono-kpi]')
    await expect(iconos).toHaveCount(4)
    for (let i = 0; i < 4; i++) await expect(iconos.nth(i)).toBeVisible()
    // El icono no tapa el texto: queda dentro de su cuadro.
    for (let i = 0; i < 4; i++) {
      const cuadro = await resumen.locator('[data-icono-kpi]').nth(i).locator('xpath=ancestor::div[1]').boundingBox()
      const icono = await iconos.nth(i).boundingBox()
      expect(icono!.x + icono!.width).toBeLessThanOrEqual(cuadro!.x + cuadro!.width)
    }
    await page.setViewportSize({ width: 393, height: 800 })
    for (let i = 0; i < 4; i++) await expect(iconos.nth(i)).toBeHidden()
    const desborde = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(desborde, 'Estadísticas globales a 393 px').toBeLessThanOrEqual(1)
  })

  test('WM4 · El mapa de calor pinta del azul (pocos sin resolver) al rojo (muchos); las comunas en cero quedan sin color', async ({ page }) => {
    await bloquearMosaicos(page)
    await page.goto('/admin/mapa-calor')
    await expect(page.getByRole('heading', { name: 'Mapa de calor' })).toBeVisible()
    const poligonos = page.locator('path.leaflet-interactive')
    await expect(poligonos.first()).toBeVisible({ timeout: 20_000 })
    // Los polígonos se dibujan antes que los reportes: se espera a que lleguen (el ranking ya lista a Maipú).
    await expect(page.getByRole('region', { name: 'Comunas con más reportes sin resolver' }).getByRole('button').first()).toContainText('Maipú', { timeout: 20_000 })
    const colores = await poligonos.evaluateAll((ps) => ps.map((p) => p.getAttribute('fill') ?? ''))
    const rgb = (s: string) => (/rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(s) ?? []).slice(1, 4).map(Number)
    const sinColor = colores.filter((c) => c.replace(/\s/g, '') === 'rgba(17,24,39,0.08)')
    const conColor = colores.filter((c) => c && !sinColor.includes(c))
    expect(sinColor.length, 'comunas en cero sin color').toBeGreaterThan(10)
    expect(conColor.length, 'comunas con reportes sin resolver').toBeGreaterThanOrEqual(2)
    // Hay al menos una comuna azul y una roja.
    expect(conColor.some((c) => { const [r, , b] = rgb(c); return b > r + 60 }), 'alguna comuna azul').toBe(true)
    expect(conColor.some((c) => { const [r, , b] = rgb(c); return r > b + 100 }), 'alguna comuna roja').toBe(true)
    // La leyenda: el cero sin color y luego la escala de azul a rojo.
    const colorDe = (i: number) => page.getByLabel('Leyenda').locator('i').nth(i).evaluate((e) => getComputedStyle(e).backgroundColor)
    const primero = rgb(await colorDe(1))
    const ultimo = rgb(await colorDe((await page.getByLabel('Leyenda').locator('i').count()) - 1))
    expect(primero[2], 'primer tramo, azul').toBeGreaterThan(primero[0])
    expect(ultimo[0], 'último tramo, rojo').toBeGreaterThan(ultimo[2])
  })
})

test.describe('Vecino', () => {
  test.use({ storageState: rutaSesion('vecino1') })

  test('WF5 · En Mi perfil, «Cerrar sesión» queda separado de los enlaces de términos y privacidad', async ({ page }) => {
    await page.goto('/mi-perfil')
    await expect(page.getByRole('heading', { name: 'Mi perfil', level: 1 })).toBeVisible()
    const enlaces = await page.getByRole('link', { name: 'Política de privacidad' }).boundingBox()
    const salir = await page.getByRole('button', { name: 'Cerrar sesión' }).boundingBox()
    const separacion = salir!.y - (enlaces!.y + enlaces!.height)
    expect(separacion, 'píxeles entre los enlaces legales y «Cerrar sesión»').toBeGreaterThanOrEqual(28)
  })
})
