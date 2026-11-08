// Fase 15: mejoras visuales del Historial, del mapa y de «Por veredicto» (pedido del equipo del 2026-11-06).
import { expect, test } from './ayudas/prueba'
import type { Locator, Page } from '@playwright/test'
import { Timestamp } from 'firebase-admin/firestore'
import { MAIPU, bd, reporte, sembrar } from './datos/semilla'
import { abrirMapa, filtro } from './ayudas/mapa'
import { rutaSesion } from './ayudas/sesion'

const HORA = 3_600_000
const hace = (horas: number) => Timestamp.fromMillis(Date.now() - horas * HORA)
const val = (horasValidado: number) => ({ puntos: 105, votos: 4, validado: true, validadoAt: hace(horasValidado), veredicto: null })

const PENDIENTES = {
  reciente: 'E2E pendiente reciente (2 horas)',
  atencion: 'E2E pendiente de más de un día (30 horas)',
  demorado: 'E2E pendiente demorado (60 horas)',
}

test.beforeAll(async () => {
  await sembrar()
  const nuevo = (id: string, descripcion: string, horas: number) =>
    bd.doc(`reports/${id}`).set(reporte({ id, descripcion, comuna: MAIPU, uid: 'vec2', validacion: val(horas) }))
  await Promise.all([
    nuevo('pv_reciente', PENDIENTES.reciente, 2),
    nuevo('pv_atencion', PENDIENTES.atencion, 30),
    nuevo('pv_demorado', PENDIENTES.demorado, 60),
  ])
})

/** `a` queda completamente dentro de `b`. */
const dentroDe = async (a: Locator, b: Locator) => {
  const [ca, cb] = [await a.boundingBox(), await b.boundingBox()]
  return !!ca && !!cb && ca.x >= cb.x - 1 && ca.y >= cb.y - 1 && ca.x + ca.width <= cb.x + cb.width + 1 && ca.y + ca.height <= cb.y + cb.height + 1
}
const desborde = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)

// ---------------------------------------------------------------------------------------------------------------
// Historial (vecino)
// ---------------------------------------------------------------------------------------------------------------

test.describe('Historial', () => {
  test.use({ storageState: rutaSesion('vecino2') })

  async function abrirHistorial(page: Page, ancho: number) {
    await page.setViewportSize({ width: ancho, height: 900 })
    await page.goto('/historial')
    await expect(page.getByRole('heading', { name: 'Mi historial de reportes' })).toBeVisible()
    await expect(page.locator('tbody tr').first()).toBeVisible({ timeout: 20_000 })
  }

  test('WH1 · En escritorio la tabla del Historial cabe entera, con icono de categoría, estado con punto, fecha corta y encabezado fijo', async ({ page }) => {
    await abrirHistorial(page, 1440)
    const envoltura = page.locator('[class*="tableWrapper"]')
    // Ocupa más pantalla que antes (1080 px) y todas las columnas caben, sin barra de desplazamiento.
    expect((await envoltura.boundingBox())!.width, 'ancho de la tabla').toBeGreaterThan(1150)
    expect(await envoltura.evaluate((e) => e.scrollWidth - e.clientWidth), 'desplazamiento horizontal de la tabla').toBeLessThanOrEqual(1)
    for (const columna of ['Categoría', 'Descripción', 'Estado', 'Organismo', 'Confirmaciones', 'Fecha']) {
      await expect(page.getByRole('columnheader', { name: columna })).toBeVisible()
    }
    const fila = page.locator('tbody tr').first()
    await expect(fila.locator('[data-icono-categoria]')).toBeVisible()
    await expect(fila.locator('[data-punto-estado]')).toBeVisible()
    await expect(fila.getByRole('button', { name: 'Ver detalle' })).toBeVisible()
    // Fecha corta («26 oct 2026»), no la larga («26 de octubre de 2026»).
    const fecha = (await fila.locator('td').nth(5).innerText()).trim()
    expect(fecha).toMatch(/^\d{1,2} [a-zñ]{3,4}\.? \d{4}$/)
    // La descripción larga se corta a dos líneas.
    const lineas = await fila.locator('[class*="descripcionTexto"]').evaluate((e) => getComputedStyle(e).getPropertyValue('-webkit-line-clamp'))
    expect(lineas).toBe('2')
    // El encabezado se queda fijo bajo la barra al bajar por la página.
    expect(await page.getByRole('columnheader', { name: 'Categoría' }).evaluate((e) => getComputedStyle(e).position)).toBe('sticky')
  })

  test('WH2 · En un ancho medio se quita la columna «Organismo» y la tabla sigue cabiendo', async ({ page }) => {
    await abrirHistorial(page, 900)
    await expect(page.getByRole('columnheader', { name: 'Organismo' })).toBeHidden()
    await expect(page.getByRole('columnheader', { name: 'Estado' })).toBeVisible()
    await expect(page.getByRole('columnheader', { name: 'Fecha' })).toBeVisible()
    const envoltura = page.locator('[class*="tableWrapper"]')
    expect(await envoltura.evaluate((e) => e.scrollWidth - e.clientWidth), 'desplazamiento horizontal de la tabla').toBeLessThanOrEqual(1)
    expect(await desborde(page), 'página a 900 px').toBeLessThanOrEqual(1)
  })

  test('WH3 · En un teléfono cada reporte es una tarjeta apilada, con su icono, su estado y «Ver detalle»', async ({ page }) => {
    await abrirHistorial(page, 393)
    await expect(page.locator('thead')).toBeHidden()
    const tarjeta = page.locator('tbody tr').first()
    await expect(tarjeta.locator('[data-icono-categoria]')).toBeVisible()
    await expect(tarjeta.locator('[data-punto-estado]')).toBeVisible()
    await expect(tarjeta.getByRole('button', { name: 'Ver detalle' })).toBeVisible()
    expect(await dentroDe(tarjeta.getByRole('button', { name: 'Ver detalle' }), page.locator('body'))).toBe(true)
    expect(await desborde(page), 'página a 393 px').toBeLessThanOrEqual(1)
  })
})

// ---------------------------------------------------------------------------------------------------------------
// Mapa (vecino)
// ---------------------------------------------------------------------------------------------------------------

test.describe('Mapa', () => {
  test.use({ storageState: rutaSesion('vecino1') })

  test('WN1 · El mapa ocupa todo el alto, con los filtros y el resumen flotando dentro de él', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 })
    await abrirMapa(page)
    const mapa = page.locator('.leaflet-container')
    const caja = (await mapa.boundingBox())!
    // Sin franjas oscuras encima ni debajo: el mapa llega hasta la barra de navegación (65 px) y hasta el borde de la pantalla.
    expect(caja.height, 'alto del mapa').toBeGreaterThan(720 - 65 - 6)
    const filtros = page.getByRole('group', { name: 'Filtros del mapa' })
    await expect(filtros).toBeVisible()
    expect(await dentroDe(filtros, mapa), 'filtros dentro del mapa').toBe(true)
    const f = (await filtros.boundingBox())!
    expect(f.width, 'ancho del panel de filtros').toBeLessThan(620)
    expect(f.height, 'alto del panel de filtros').toBeLessThan(110)
    for (const nombre of ['Región', 'Categoría', 'Estado'] as const) await expect(filtro(page, nombre)).toBeVisible()
    // El resumen y la leyenda también van sobre el mapa, abajo.
    const resumen = page.getByText(/incidencias? en /)
    expect(await dentroDe(resumen, mapa), 'resumen dentro del mapa').toBe(true)
    const leyenda = page.getByRole('list', { name: 'Leyenda del mapa' })
    await expect(leyenda).toBeVisible()
    expect(await dentroDe(leyenda, mapa), 'leyenda dentro del mapa').toBe(true)
    await expect(page.getByText(/tócalo para acercarte/)).toHaveCount(0)
  })

  test('WN2 · En un teléfono los filtros se pliegan en un botón «Filtros» y el mapa ocupa casi toda la pantalla', async ({ page }) => {
    await page.setViewportSize({ width: 393, height: 800 })
    await abrirMapa(page)
    await expect(filtro(page, 'Región')).toBeHidden()
    const boton = page.getByRole('button', { name: 'Filtros', exact: true })
    await expect(boton).toBeVisible()
    await boton.click()
    for (const nombre of ['Región', 'Categoría', 'Estado'] as const) await expect(filtro(page, nombre)).toBeVisible()
    await boton.click()
    await expect(filtro(page, 'Región')).toBeHidden()
    expect((await page.locator('.leaflet-container').boundingBox())!.height, 'alto del mapa').toBeGreaterThan(800 - 65 - 6)
    expect(await desborde(page), 'mapa a 393 px').toBeLessThanOrEqual(1)
  })
})

// ---------------------------------------------------------------------------------------------------------------
// «Por veredicto» (operador)
// ---------------------------------------------------------------------------------------------------------------

test.describe('Por veredicto', () => {
  test.use({ storageState: rutaSesion('operadorA') })

  async function abrirPorVeredicto(page: Page, ancho: number) {
    await page.setViewportSize({ width: ancho, height: 900 })
    await page.goto('/operador/veredictos')
    await expect(page.getByRole('heading', { name: 'Por veredicto', level: 1 })).toBeVisible()
    await expect(page.getByRole('article').filter({ hasText: PENDIENTES.reciente })).toBeVisible({ timeout: 20_000 })
  }

  test('WV17 · Los cuatro indicadores llevan icono, y en un teléfono se quitan', async ({ page }) => {
    await abrirPorVeredicto(page, 1440)
    const indicadores = page.getByRole('region', { name: 'Indicadores' })
    const iconos = indicadores.locator('[data-icono-kpi]')
    await expect(iconos).toHaveCount(4)
    for (let i = 0; i < 4; i++) await expect(iconos.nth(i)).toBeVisible()
    await page.setViewportSize({ width: 393, height: 900 })
    for (let i = 0; i < 4; i++) await expect(iconos.nth(i)).toBeHidden()
    expect(await desborde(page), 'Por veredicto a 393 px').toBeLessThanOrEqual(1)
  })

  test('WV18 · Cada tarjeta dice con una etiqueta cuánto lleva esperando: menos de 24 h, más de 24 h o «Demorado»', async ({ page }) => {
    await abrirPorVeredicto(page, 1440)
    const urgencia = (texto: string) => page.getByRole('article').filter({ hasText: texto }).locator('[data-urgencia]')
    await expect(urgencia(PENDIENTES.reciente)).toHaveAttribute('data-urgencia', 'reciente')
    await expect(urgencia(PENDIENTES.reciente)).toHaveText('Menos de 24 h')
    await expect(urgencia(PENDIENTES.atencion)).toHaveAttribute('data-urgencia', 'atencion')
    await expect(urgencia(PENDIENTES.atencion)).toHaveText('Más de 24 h')
    await expect(urgencia(PENDIENTES.demorado)).toHaveAttribute('data-urgencia', 'demorado')
    await expect(urgencia(PENDIENTES.demorado)).toHaveText('Demorado')
  })

  test('WV19 · «Ver y dar veredicto» es un botón de acción destacado y las tarjetas se reparten en dos columnas', async ({ page }) => {
    await abrirPorVeredicto(page, 1440)
    const boton = page.getByRole('article').filter({ hasText: PENDIENTES.reciente }).getByRole('button', { name: 'Ver y dar veredicto' })
    const fondo = await boton.evaluate((e) => getComputedStyle(e).backgroundColor)
    expect(fondo, 'fondo del botón').not.toBe('rgba(0, 0, 0, 0)')
    expect(fondo, 'fondo del botón').not.toBe('transparent')
    // Dos tarjetas en la misma fila.
    const cajas = await page.getByRole('article').evaluateAll((a) => a.slice(0, 2).map((e) => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y } }))
    expect(Math.abs(cajas[0].y - cajas[1].y), 'misma fila').toBeLessThanOrEqual(2)
    expect(cajas[1].x, 'segunda columna').toBeGreaterThan(cajas[0].x + 300)
  })

  test('WV20 · Los filtros se ven siempre en escritorio y en un teléfono se pliegan tras un botón «Filtros»', async ({ page }) => {
    await abrirPorVeredicto(page, 1440)
    await expect(page.getByRole('combobox', { name: 'Categoría' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Filtros', exact: true })).toBeHidden()
    await page.setViewportSize({ width: 393, height: 900 })
    await expect(page.getByRole('combobox', { name: 'Categoría' })).toBeHidden()
    const boton = page.getByRole('button', { name: 'Filtros', exact: true })
    await expect(boton).toBeVisible()
    await boton.click()
    await expect(page.getByRole('combobox', { name: 'Categoría' })).toBeVisible()
    await expect(page.getByRole('status').filter({ hasText: /Mostrando \d+ de \d+ reportes?/ })).toBeVisible()
    expect(await desborde(page), 'Por veredicto a 393 px con los filtros abiertos').toBeLessThanOrEqual(1)
  })
})
