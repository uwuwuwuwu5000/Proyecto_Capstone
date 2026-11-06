// Las fotos del landing (en formato WebP): la del inicio, la del mapa y la de municipios. Sin sesión.
import { expect, test } from './ayudas/prueba'

test('WA9 · Las fotos del landing cargan en WebP, con su descripción, y no desbordan en escritorio ni en teléfono', async ({ browser }) => {
  test.setTimeout(120_000)
  for (const ancho of [1440, 393]) {
    const contexto = await browser.newContext({ viewport: { width: ancho, height: 900 }, baseURL: 'http://localhost:5174', reducedMotion: 'reduce' })
    const page = await contexto.newPage()
    await page.route(/tile\.openstreetmap\.org/, (ruta) => ruta.fulfill({ status: 204, body: '' }))
    const webp: string[] = []
    page.on('response', (r) => {
      // Solo las imágenes: el servidor de desarrollo también entrega cada .webp importado como módulo JavaScript.
      if (r.request().resourceType() === 'image' && /\.webp(\?|$)/.test(r.url()) && r.ok()) webp.push(r.headers()['content-type'] ?? '')
    })
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

    // Hay que bajar por la página: las fotos de más abajo se cargan al acercarse (`loading="lazy"`).
    const alto = await page.evaluate(() => document.documentElement.scrollHeight)
    for (let y = 0; y < alto; y += 400) {
      await page.evaluate((yy) => window.scrollTo(0, yy), y)
      await page.waitForTimeout(200)
    }

    const fotos = page.locator('main img')
    await expect(fotos).toHaveCount(3)
    for (const alt of [/barrio de la ciudad/, /Mapa de la ciudad con los reportes/, /municipalidad/]) {
      const foto = page.getByRole('img', { name: alt })
      await expect(foto).toBeVisible()
      // Cargó de verdad (no quedó como imagen rota).
      await expect.poll(() => foto.evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0)).toBe(true)
    }
    // La foto del inicio se pide con prioridad; las demás, al acercarse.
    await expect(page.getByRole('img', { name: /barrio de la ciudad/ })).not.toHaveAttribute('loading', 'lazy')
    await expect(page.getByRole('img', { name: /Mapa de la ciudad/ })).toHaveAttribute('loading', 'lazy')
    // Se sirvieron como WebP, y la del mapa lleva la atribución de OpenStreetMap.
    expect(webp.length, `respuestas .webp a ${ancho}px`).toBeGreaterThanOrEqual(3)
    expect(webp.every((tipo) => tipo.includes('image/webp'))).toBe(true)
    await expect(page.getByRole('link', { name: 'colaboradores de OpenStreetMap' })).toHaveAttribute('href', 'https://www.openstreetmap.org/copyright')

    const desborde = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(desborde, `landing a ${ancho}px`).toBeLessThanOrEqual(1)
    await contexto.close()
  }
})
