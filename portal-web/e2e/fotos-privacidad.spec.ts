// Fase 10: la foto de un reporte creado desde el portal se difumina en el navegador y solo se guarda protegida
// (historia J6, con el difuminado en el navegador; el servicio de la nube queda aplazado). Antes esto solo se
// probaba a mano (DW1 a DW4). Se usa una foto de dominio público (Eileen Collins, NASA), la misma con que el
// servicio de privacidad prueba sus modelos, así el criterio de «difuminado» es el mismo.
import { readFileSync } from 'node:fs'
import { expect, test } from './ayudas/prueba'
import type { Page } from '@playwright/test'
import { FieldValue } from 'firebase-admin/firestore'
import { bd, sembrar } from './datos/semilla'
import { bloquearMosaicos } from './ayudas/mapa'
import { rutaSesion } from './ayudas/sesion'

test.use({ storageState: rutaSesion('admin') })
test.beforeAll(async () => {
  await sembrar()
})
// Las reglas exigen 30 s entre un reporte y otro de la misma cuenta: se reinicia el control entre pruebas.
test.beforeEach(async () => {
  test.setTimeout(240_000) // los modelos corren en la CPU del navegador sin pantalla
  await bd.doc('users/admin1').update({ ultimoReporteAt: FieldValue.delete() })
})

const FOTO = readFileSync(new URL('./datos/astronauta.jpg', import.meta.url))
// Dónde está la cara en la foto de 512 × 512 y un trozo de fondo sin personas.
const CARA = { x: 180, y: 60, ancho: 90, alto: 90 }
const FONDO = { x: 380, y: 30, ancho: 100, alto: 100 }
const PROTEGIDA = /Difuminado aplicado: (\d+) rostro\(s\) y (\d+) persona\(s\) lejana\(s\)/

async function abrirFormulario(page: Page) {
  await bloquearMosaicos(page)
  await page.goto('/admin/reportes/nuevo')
  await expect(page.getByRole('heading', { name: 'Crear reporte' })).toBeVisible()
}

async function elegirFoto(page: Page, foto: { name: string; mimeType: string; buffer: Buffer }) {
  await page.locator('input[type=file]').setInputFiles(foto)
}

/** Una imagen lisa de un solo color, sin personas. */
async function imagenLisa(page: Page): Promise<{ name: string; mimeType: string; buffer: Buffer }> {
  const base64 = await page.evaluate(() => {
    const lienzo = document.createElement('canvas')
    lienzo.width = 300
    lienzo.height = 200
    const ctx = lienzo.getContext('2d')!
    ctx.fillStyle = '#88aa66'
    ctx.fillRect(0, 0, 300, 200)
    return lienzo.toDataURL('image/jpeg', 0.9).split(',')[1]
  })
  return { name: 'paisaje.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(base64, 'base64') }
}

/** Rellena el resto del formulario (Maipú, luminaria) y crea el reporte; devuelve su id. */
async function crearReporte(page: Page, descripcion: string): Promise<string> {
  await page.getByLabel('Latitud').fill('-33.5106')
  await page.getByLabel('Longitud').fill('-70.7571')
  await expect(page.getByText('Municipalidad de Maipú').first()).toBeVisible({ timeout: 20_000 })
  await page.getByLabel('Categoría').selectOption({ label: 'Luminaria' })
  await page.getByLabel('Descripción').fill(descripcion)
  await page.getByRole('button', { name: 'Crear reporte' }).click()
  await expect(page.getByText(/Reporte creado\./)).toBeVisible({ timeout: 30_000 })
  const creados = await bd.collection('reports').where('descripcion', '==', descripcion).get()
  expect(creados.size).toBe(1)
  return creados.docs[0].id
}

const vistaPrevia = (page: Page) => page.getByRole('img', { name: /Vista previa de la fotografía/ })

/** Detalle de una zona (diferencia media entre píxeles vecinos de la fila): difuminar la baja mucho. */
function detalleDe(page: Page, fuente: string, zona: { x: number; y: number; ancho: number; alto: number }): Promise<number> {
  return page.evaluate(
    async ({ fuente, zona }) => {
      const img = new Image()
      img.src = fuente
      await img.decode()
      const lienzo = document.createElement('canvas')
      lienzo.width = img.width
      lienzo.height = img.height
      const ctx = lienzo.getContext('2d')!
      ctx.drawImage(img, 0, 0)
      const { data } = ctx.getImageData(zona.x, zona.y, zona.ancho, zona.alto)
      const gris = (i: number) => 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
      let suma = 0
      for (let y = 0; y < zona.alto; y++) {
        for (let x = 1; x < zona.ancho; x++) suma += Math.abs(gris((y * zona.ancho + x) * 4) - gris((y * zona.ancho + x - 1) * 4))
      }
      return suma / (zona.alto * (zona.ancho - 1))
    },
    { fuente, zona },
  )
}

test('WL18 · Una foto con una persona sale con el rostro difuminado y se guarda esa versión (Web)', async ({ page }) => {
  await abrirFormulario(page)
  await elegirFoto(page, { name: 'astronauta.jpg', mimeType: 'image/jpeg', buffer: FOTO })
  await expect(page.getByText(PROTEGIDA)).toContainText('1 rostro(s)', { timeout: 150_000 })

  // La vista previa es la imagen protegida: la cara pierde casi todo su detalle y el fondo lo conserva.
  const protegida = (await vistaPrevia(page).getAttribute('src'))!
  const original = `data:image/jpeg;base64,${FOTO.toString('base64')}`
  expect(await detalleDe(page, protegida, CARA)).toBeLessThan((await detalleDe(page, original, CARA)) * 0.4)
  expect(await detalleDe(page, protegida, FONDO)).toBeGreaterThan((await detalleDe(page, original, FONDO)) * 0.6)

  const id = await crearReporte(page, 'E2E foto con una persona, rostro difuminado')
  const reporte = (await bd.doc(`reports/${id}`).get()).data()
  expect(reporte?.foto).toMatchObject({ kind: 'firestore', path: `reportPhotos/${id}`, mimeType: 'image/jpeg' })
  expect(reporte?.foto.privacidad).toMatchObject({ aplicada: true, rostros: 1 })
  expect(reporte?.foto.privacidad.version).toContain('coco-ssd')
  // Lo que se guarda es exactamente lo que se vio en la vista previa.
  expect((await bd.doc(`reportPhotos/${id}`).get()).data()?.dataUrl).toBe(protegida)
})

test('WL19 · Una foto sin personas queda como protegida, con cero rostros', async ({ page }) => {
  await abrirFormulario(page)
  await elegirFoto(page, await imagenLisa(page))
  await expect(page.getByText(PROTEGIDA)).toContainText('0 rostro(s) y 0 persona(s)', { timeout: 150_000 })
  const id = await crearReporte(page, 'E2E foto sin personas, sin nada que difuminar')
  const reporte = (await bd.doc(`reports/${id}`).get()).data()
  expect(reporte?.foto.privacidad).toMatchObject({ aplicada: true, rostros: 0, personas: 0 })
  expect((await bd.doc(`reportPhotos/${id}`).get()).exists).toBe(true)
})

test('WL20 · Si la protección no puede cargar, la foto no se adjunta ni se publica sin proteger', async ({ page }) => {
  // Sin la copia local de los modelos ni los servidores externos de respaldo.
  await page.route('**/models/**', (ruta) => ruta.abort())
  await page.route(/storage\.googleapis\.com|tfhub\.dev|kaggle\.com|cdn\.jsdelivr\.net/, (ruta) => ruta.abort())
  await abrirFormulario(page)
  await elegirFoto(page, { name: 'astronauta.jpg', mimeType: 'image/jpeg', buffer: FOTO })
  await expect(page.getByText(/No pudimos cargar la protección de privacidad/)).toBeVisible({ timeout: 150_000 })
  await expect(vistaPrevia(page)).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Quitar fotografía' })).toHaveCount(0)

  // El reporte se puede crear, pero sin foto: la imagen original nunca llega a guardarse.
  const id = await crearReporte(page, 'E2E foto que no se pudo proteger')
  expect((await bd.doc(`reports/${id}`).get()).data()?.foto).toBeNull()
  expect((await bd.doc(`reportPhotos/${id}`).get()).exists).toBe(false)
})

test('WL21 · Quitar o cambiar la foto antes de crear el reporte no deja restos', async ({ page }) => {
  await abrirFormulario(page)
  await elegirFoto(page, { name: 'astronauta.jpg', mimeType: 'image/jpeg', buffer: FOTO })
  await expect(page.getByText(PROTEGIDA)).toContainText('1 rostro(s)', { timeout: 150_000 })
  // Quitarla deja el reporte sin foto.
  await page.getByRole('button', { name: 'Quitar fotografía' }).click()
  await expect(vistaPrevia(page)).toHaveCount(0)
  const sinFoto = await crearReporte(page, 'E2E foto quitada antes de crear')
  expect((await bd.doc(`reports/${sinFoto}`).get()).data()?.foto).toBeNull()
  expect((await bd.doc(`reportPhotos/${sinFoto}`).get()).exists).toBe(false)

  // Cambiarla: manda la segunda, con sus propios datos de privacidad.
  await bd.doc('users/admin1').update({ ultimoReporteAt: FieldValue.delete() })
  await abrirFormulario(page)
  await elegirFoto(page, { name: 'astronauta.jpg', mimeType: 'image/jpeg', buffer: FOTO })
  await expect(page.getByText(PROTEGIDA)).toContainText('1 rostro(s)', { timeout: 150_000 })
  await elegirFoto(page, await imagenLisa(page))
  await expect(page.getByText(PROTEGIDA)).toContainText('0 rostro(s) y 0 persona(s)', { timeout: 150_000 })
  const segunda = (await vistaPrevia(page).getAttribute('src'))!
  const conCambio = await crearReporte(page, 'E2E foto cambiada antes de crear')
  const reporte = (await bd.doc(`reports/${conCambio}`).get()).data()
  expect(reporte?.foto.privacidad).toMatchObject({ aplicada: true, rostros: 0 })
  expect((await bd.doc(`reportPhotos/${conCambio}`).get()).data()?.dataUrl).toBe(segunda)
})
