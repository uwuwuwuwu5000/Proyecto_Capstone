// Fase 12 (parte 1): navegación del panel, mapa de calor, estadísticas, perfil y adaptación a pantallas.
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { CUENTAS, bd, sembrar } from './datos/semilla'
import { paginaDe, rutaSesion } from './ayudas/sesion'
import { bloquearMosaicos } from './ayudas/mapa'

test.beforeAll(async () => {
  await sembrar()
})

test.describe('Panel de administración', () => {
  test.use({ storageState: rutaSesion('admin') })

  test('WA2 · Barra lateral: secciones, sección activa y contraer', async ({ page }) => {
    await page.goto('/admin')
    const barra = page.getByRole('complementary', { name: 'Secciones del panel' })
    await expect(barra.getByRole('link', { name: 'Resumen' })).toHaveAttribute('aria-current', 'page')
    for (const [nombre, ruta] of [
      ['Administrar reportes', /\/admin\/reportes$/],
      ['Categorías', /\/admin\/categorias$/],
      ['Soporte', /\/admin\/soporte$/],
    ] as const) {
      await barra.getByRole('link', { name: nombre }).click()
      await expect(page).toHaveURL(ruta)
      await expect(barra.getByRole('link', { name: nombre })).toHaveAttribute('aria-current', 'page')
    }
    await barra.getByRole('button', { name: 'Contraer menú' }).click()
    await expect(barra.getByRole('button', { name: 'Expandir menú' })).toBeVisible()
    await page.reload()
    await expect(page.getByRole('complementary', { name: 'Secciones del panel' }).getByRole('button', { name: 'Expandir menú' })).toBeVisible()
  })

  test('WA3 · «Panel de administración» lleva al Resumen y la campana cuenta los avisos de soporte', async ({ page }) => {
    await page.goto('/admin/categorias')
    await page.getByRole('link', { name: /^Panel de administración/ }).click()
    await expect(page).toHaveURL(/\/admin$/)
    await expect(page.getByRole('button', { name: /^Avisos, \d+ sin ver/ })).toBeVisible()
  })

  test('WM2 / WM3 · Mapa de calor: detalle de una comuna y cambio de región', async ({ page }) => {
    await bloquearMosaicos(page)
    await page.goto('/admin/mapa-calor')
    await expect(page.getByRole('heading', { name: 'Mapa de calor' })).toBeVisible()
    const sinResolver = (await bd.collection('reports').where('comuna', '==', 'Maipú').get()).docs.filter(
      (d) => !['resuelto', 'cerrado'].includes(d.data().estado),
    ).length
    const ranking = page.getByRole('region', { name: 'Comunas con más reportes sin resolver' })
    await expect(ranking.getByRole('button').first()).toContainText('Maipú', { timeout: 20_000 })
    await expect(ranking.getByRole('button').first()).toContainText(String(sinResolver))
    await ranking.getByRole('button').first().click()
    const detalle = page.getByRole('region', { name: 'Detalle de la comuna' })
    await expect(detalle.getByRole('heading', { name: 'Maipú' })).toBeVisible()
    await expect(detalle.getByText('sin resolver')).toBeVisible()
    await expect(detalle.getByText('resueltos')).toBeVisible()
    await expect(detalle.getByText('cerrados')).toBeVisible()
    await expect(detalle.getByText('Tiempos de respuesta')).toBeVisible()
    await expect(detalle.getByText('Reportes por categoría')).toBeVisible()
    // WM3: al cambiar de región y volver a la Metropolitana, las comunas se dibujan de nuevo.
    const poligonos = page.locator('path.leaflet-interactive')
    await expect(poligonos.first()).toBeVisible()
    const region = page.getByRole('combobox', { name: 'Región' })
    await region.selectOption({ index: 5 })
    await expect(page.getByText(/reportes en la región/)).toBeVisible()
    await region.selectOption({ label: 'Región Metropolitana de Santiago' })
    await expect(poligonos.first()).toBeVisible({ timeout: 20_000 })
    expect(await poligonos.count()).toBeGreaterThan(20)
  })

  test('WE1 · Estadísticas globales por periodo', async ({ page }) => {
    await page.goto('/admin/estadisticas')
    await expect(page.getByRole('heading', { name: 'Estadísticas globales' })).toBeVisible()
    const periodo = page.getByRole('group', { name: 'Periodo' })
    await periodo.getByRole('button', { name: 'Todo' }).click()
    const total = (await bd.collection('reports').count().get()).data().count
    const resumen = page.getByRole('region', { name: 'Resumen' })
    await expect(resumen.getByText('Reportes', { exact: true })).toBeVisible({ timeout: 20_000 })
    await expect(resumen).toContainText(total.toLocaleString('es-CL'))
    await expect(resumen).toContainText('Sin operador')
    await periodo.getByRole('button', { name: 'Esta semana' }).click()
    await expect(periodo.getByRole('button', { name: 'Esta semana' })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByRole('heading', { name: 'Por estado' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Comunas con más reportes' })).toBeVisible()
  })
})

test.describe('Mi perfil', () => {
  test('WF1 / PF1 / PF2 · Datos de la cuenta de un vecino y de un operador', async ({ browser }) => {
    const vecino = await paginaDe(browser, 'vecino1')
    await vecino.goto('/mi-perfil')
    await expect(vecino.getByRole('heading', { name: 'Mi perfil' })).toBeVisible()
    const datos = vecino.locator('dl')
    await expect(datos).toContainText(CUENTAS.vecino1.correo)
    await expect(datos).toContainText('Vecina Uno')
    await expect(datos).toContainText('Ciudadano')
    // PF2: el identificador de la cuenta es el uid de la sesión.
    await expect(datos).toContainText(CUENTAS.vecino1.uid)
    await expect(vecino.getByText('Correo verificado').locator('xpath=following-sibling::dd[1]')).toHaveText('Sí')
    await expect(vecino.getByRole('link', { name: /Mi nivel/ }).first()).toBeVisible()

    const operador = await paginaDe(browser, 'operadorA')
    await operador.goto('/mi-perfil')
    await expect(operador.locator('dl')).toContainText('Operador')
    await expect(operador.locator('dl')).toContainText('Operador')
  })

  test('WF3 · Recordatorio «Verificar correo» solo para el vecino sin verificar', async ({ browser }) => {
    const sinVerificar = await paginaDe(browser, 'sinVerificar')
    await sinVerificar.goto('/mapa')
    await sinVerificar.getByRole('button', { name: /Sin Verificar/ }).click()
    await expect(sinVerificar.getByRole('menuitem', { name: 'Verificar correo' })).toBeVisible()
    await expect(sinVerificar.getByRole('menuitem', { name: 'Mi perfil' })).toBeVisible()
    await sinVerificar.goto('/mi-perfil')
    await expect(sinVerificar.getByRole('button', { name: 'Enviar enlace de verificación' })).toBeVisible()
    await expect(sinVerificar.getByRole('button', { name: 'Ya verifiqué mi correo' })).toBeVisible()

    for (const cuenta of ['vecino1', 'admin'] as const) {
      const pagina = await paginaDe(browser, cuenta)
      await pagina.goto('/mapa')
      await pagina.getByRole('button', { name: new RegExp(CUENTAS[cuenta].nombre) }).click()
      await expect(pagina.getByRole('menuitem', { name: 'Mi perfil' })).toBeVisible()
      await expect(pagina.getByRole('menuitem', { name: 'Verificar correo' })).toHaveCount(0)
    }
  })
})

test.describe('Adaptación a pantallas', () => {
  const anchos = [1440, 1100, 393]

  test('WA6 · Sin desplazamiento horizontal en landing, Resumen, listado y mapa (1440, 1100 y 393 px)', async ({ browser }) => {
    test.setTimeout(180_000)
    const admin = await browser.newContext({ storageState: rutaSesion('admin'), baseURL: 'http://localhost:5174' })
    const pagina: Page = await admin.newPage()
    await bloquearMosaicos(pagina)
    for (const ancho of anchos) {
      await pagina.setViewportSize({ width: ancho, height: 900 })
      for (const ruta of ['/', '/admin', '/admin/reportes', '/mapa']) {
        await pagina.goto(ruta)
        await expect(pagina.locator('main, #root').first()).toBeVisible()
        await pagina.waitForTimeout(1500)
        const desborde = await pagina.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
        expect(desborde, `${ruta} a ${ancho}px`).toBeLessThanOrEqual(1)
      }
    }
    await admin.close()
  })
})

test('PA4 · No hay ranking público: ninguna pantalla del vecino lista a otros vecinos con su nivel', async ({ browser }) => {
  const page = await paginaDe(browser, 'vecino1')
  for (const ruta of ['/mi-nivel', '/historial', '/mi-perfil']) {
    await page.goto(ruta)
    await page.waitForTimeout(1500)
    const texto = await page.locator('body').innerText()
    expect(texto, ruta).not.toMatch(/ranking|clasificaci[oó]n|mejores vecinos/i)
    for (const nombre of ['Vecino Dos', 'Vecina Tres', 'Nivel Maximo']) expect(texto, `${ruta}: ${nombre}`).not.toContain(nombre)
  }
})
