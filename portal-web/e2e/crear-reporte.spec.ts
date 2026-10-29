// Fase 10: crear un reporte desde el portal (administrador), sin fotografía.
// El difuminado de la foto se prueba a mano (DW1 a DW4).
import { expect, test } from '@playwright/test'
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
  await bd.doc('users/admin1').update({ ultimoReporteAt: FieldValue.delete() })
})

async function abrirFormulario(page: Page) {
  await bloquearMosaicos(page)
  await page.goto('/admin/reportes/nuevo')
  await expect(page.getByRole('heading', { name: 'Crear reporte' })).toBeVisible()
}

async function ponerCoordenadas(page: Page, lat: string, lng: string) {
  await page.getByLabel('Latitud').fill(lat)
  await page.getByLabel('Longitud').fill(lng)
}

test('RI7 · Solo se ofrecen las categorías activas', async ({ page }) => {
  await abrirFormulario(page)
  const opciones = await page.getByLabel('Categoría').locator('option').allInnerTexts()
  expect(opciones).toContain('Luminaria')
  expect(opciones).toContain('Microbasural')
  expect(opciones.join('|')).not.toContain('Categoría inactiva')
})

test('WC2 / RI3 · Coordenadas inválidas, punto sin comuna y campos obligatorios', async ({ page }) => {
  await abrirFormulario(page)
  await ponerCoordenadas(page, '95', '-70')
  await expect(page.getByText('La latitud va de -90 a 90 y la longitud de -180 a 180.')).toBeVisible()
  // Un punto en el mar no pertenece a ninguna comuna.
  await ponerCoordenadas(page, '-33.5', '-73.5')
  await expect(page.getByText('No identificada')).toBeVisible()
  await expect(page.getByText(/Punto fuera de las comunas conocidas: se usa el organismo genérico/)).toBeVisible()
  // Campos obligatorios.
  await page.getByRole('button', { name: 'Crear reporte' }).click()
  await expect(page.getByText('Elige una categoría.')).toBeVisible()
  await page.getByLabel('Categoría').selectOption({ label: 'Luminaria' })
  await page.getByLabel('Descripción').fill('Corta')
  await page.getByRole('button', { name: 'Crear reporte' }).click()
  await expect(page.getByText('La descripción debe tener entre 10 y 500 caracteres.')).toBeVisible()
  expect((await bd.collection('reports').where('descripcion', '==', 'Corta').get()).size).toBe(0)
})

test('WC1 / RI2 / RI8 / RI12 · Crear un reporte con comuna, organismo y operador asignados', async ({ page }) => {
  await abrirFormulario(page)
  await ponerCoordenadas(page, '-33.5106', '-70.7571')
  await expect(page.getByText('Municipalidad de Maipú').first()).toBeVisible({ timeout: 20_000 })
  await expect(page.getByText('Operador Maipú').first()).toBeVisible()
  await page.getByLabel('Categoría').selectOption({ label: 'Luminaria' })
  const descripcion = 'E2E luminaria apagada creada desde el portal'
  await page.getByLabel('Descripción').fill(descripcion)
  await page.getByRole('button', { name: 'Crear reporte' }).click()
  await expect(page.getByText(/Reporte creado\. Ya aparece en el mapa\./)).toBeVisible()
  const creados = await bd.collection('reports').where('descripcion', '==', descripcion).get()
  expect(creados.size).toBe(1)
  expect(creados.docs[0].data()).toMatchObject({
    uid: 'admin1',
    estado: 'reportado',
    categoria: 'luminaria',
    comuna: 'Maipú',
    operadorId: 'opr_a',
    origen: 'portal_admin',
    foto: null,
    confirmaciones: 0,
    validacion: { puntos: 0, votos: 0, validado: false, validadoAt: null, veredicto: null },
  })
  expect(creados.docs[0].data().organismo).toMatchObject({ id: 'muni_13119' })
  // El enlace lleva al reporte creado.
  await page.getByRole('link', { name: 'Ver el reporte creado' }).click()
  await expect(page).toHaveURL(new RegExp(`/admin/reportes\\?reporte=${creados.docs[0].id}`))
})

test('WC3 · Comuna sin municipalidad activa: organismo genérico y sin operador', async ({ page }) => {
  await abrirFormulario(page)
  // Santiago centro: su municipalidad está inactiva en los datos de prueba.
  await ponerCoordenadas(page, '-33.4489', '-70.6693')
  await expect(page.getByText(/La municipalidad de esta comuna no está activa: se usa el organismo genérico de la categoría\./)).toBeVisible({ timeout: 20_000 })
  await page.getByLabel('Categoría').selectOption({ label: 'Luminaria' })
  const descripcion = 'E2E luminaria en comuna con organismo inactivo'
  await page.getByLabel('Descripción').fill(descripcion)
  await page.getByRole('button', { name: 'Crear reporte' }).click()
  await expect(page.getByText(/Reporte creado\./)).toBeVisible()
  const creados = await bd.collection('reports').where('descripcion', '==', descripcion).get()
  expect(creados.size).toBe(1)
  const datos = creados.docs[0].data()
  expect(datos.organismo).toMatchObject({ id: 'elec_dist' })
  expect(datos.operadorId).toBeNull()
  expect(datos.comuna).toBe('Santiago')
})
