// Fase 8: administrar reportes (paginación, filtros, estado, veredicto, lote, CSV, eliminar).
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { MAIPU, R, bd, reporte, sembrar } from './datos/semilla'
import { paginaDe, rutaSesion } from './ayudas/sesion'

test.use({ storageState: rutaSesion('admin') })
test.beforeAll(async () => {
  await sembrar()
})

const tarjeta = (page: Page, texto: string) => page.getByRole('article').filter({ hasText: texto })
const detalle = (page: Page) => page.locator('[aria-labelledby="detalle-reporte-titulo"]')
const rango = (page: Page) => page.getByRole('navigation', { name: 'Paginación de reportes' }).first().locator('[aria-live="polite"]')

async function abrirLista(page: Page, consulta = '') {
  await page.goto(`/admin/reportes${consulta}`)
  await expect(page.getByRole('heading', { name: 'Administrar reportes' })).toBeVisible()
  await expect(page.getByRole('article').first()).toBeVisible({ timeout: 20_000 })
}

async function conTamano48(page: Page) {
  await page.getByRole('navigation', { name: 'Paginación de reportes' }).first().getByLabel('Por página').selectOption('48')
  await expect(page.getByRole('article')).toHaveCount(48)
}

test.describe('Listado', () => {
  test('WG1 · Paginación de 12, 24 (por defecto) y 48 reportes con total y navegación', async ({ page }) => {
    await abrirLista(page)
    const total = 600
    await expect(rango(page)).toHaveText(new RegExp(`1–24 de ${total}`))
    await expect(page.getByRole('article')).toHaveCount(24)
    const nav = page.getByRole('navigation', { name: 'Paginación de reportes' }).first()
    await nav.getByLabel('Por página').selectOption('12')
    await expect(page.getByRole('article')).toHaveCount(12)
    await nav.getByLabel('Por página').selectOption('48')
    await expect(page.getByRole('article')).toHaveCount(48)
    await nav.getByRole('button', { name: /Siguiente/ }).click()
    await expect(rango(page)).toHaveText(new RegExp(`49–96 de ${total}`))
    await nav.getByRole('button', { name: /Anterior/ }).click()
    await expect(rango(page)).toHaveText(new RegExp(`1–48 de ${total}`))
  })

  test('WG2 / AD2 / AD7 · Filtros combinados y «Limpiar filtros»', async ({ page }) => {
    await abrirLista(page)
    await page.getByRole('combobox', { name: 'Categoría' }).selectOption({ label: 'Accesibilidad' })
    await page.getByRole('combobox', { name: 'Estado' }).selectOption({ label: 'Cerrado' })
    // El relleno de Maipú trae 10 reportes de accesibilidad cerrados.
    await expect(rango(page)).toHaveText(/de 10$/)
    await expect(page.getByRole('article')).toHaveCount(10)
    await page.getByRole('button', { name: 'Limpiar filtros' }).click()
    await expect(rango(page)).toHaveText(/de 600$/)
  })

  test('WG11 / WG13 · Filtro de verificación e insignias de las tarjetas', async ({ page }) => {
    await abrirLista(page)
    const verificacion = page.getByRole('combobox', { name: 'Verificación / veredicto' })
    await verificacion.selectOption('falso')
    await expect(page.getByRole('article')).toHaveCount(1)
    await expect(tarjeta(page, R.falso).getByText('Falso', { exact: true })).toBeVisible()
    await verificacion.selectOption('por_verificar')
    await expect(page.getByRole('article')).toHaveCount(1)
    await expect(tarjeta(page, R.validado).getByText('Falta veredicto')).toBeVisible()
    await verificacion.selectOption('validados')
    await expect(tarjeta(page, R.validado)).toBeVisible()
    await verificacion.selectOption('real')
    await expect(page.getByRole('article').first().getByText('Real', { exact: true })).toBeVisible()
    await verificacion.selectOption('sin_veredicto')
    await expect(tarjeta(page, R.nuevo)).toBeVisible()
    await expect(page.getByText(R.real)).toHaveCount(0)
  })

  test('WG12 · «Por verificar» desde el menú lateral', async ({ page }) => {
    await page.goto('/admin')
    await page.getByRole('complementary', { name: 'Secciones del panel' }).getByRole('link', { name: 'Por verificar' }).click()
    await expect(page).toHaveURL(/verificacion=por_verificar/)
    await expect(tarjeta(page, R.validado)).toBeVisible()
    await expect(page.getByRole('article')).toHaveCount(1)
  })
})

test.describe('Detalle, estado y veredicto', () => {
  test('WG9 / MS6 · El historial muestra autor y comentario; el administrador no expone su nombre', async ({ page }) => {
    await abrirLista(page, '?reporte=r_resuelto')
    const d = detalle(page)
    await expect(d.getByRole('heading', { name: 'Historial de estados' })).toBeVisible()
    await expect(d.getByText('Municipalidad de Maipú').first()).toBeVisible()
    await expect(d.getByText('Administración Ciudad Alerta')).toBeVisible()
    await expect(d.getByText('Admin Prueba')).toHaveCount(0)
    await expect(d.getByText('Cuadrilla asignada')).toBeVisible()
    await expect(d.getByText(/Resolución/)).toBeVisible()
  })

  test('CT15 / CT10 / PA1 · Sin veredicto no hay cambio de estado; con veredicto «real» sí', async ({ page }) => {
    await abrirLista(page, '?reporte=r_ajeno3')
    const d = detalle(page)
    await expect(d.getByText('Para cambiar el estado de este reporte, primero da un veredicto: real o falso.')).toBeVisible()
    await expect(d.getByRole('combobox', { name: 'Nuevo estado' })).toHaveCount(0)
    await d.getByRole('button', { name: 'Marcar como real' }).click()
    await d.getByRole('button', { name: 'Confirmar: es real' }).click()
    await expect(d.getByText('Marcado como real')).toBeVisible()
    await expect(d.getByText('Un veredicto no se puede cambiar.')).toBeVisible()
    await expect(d.getByRole('combobox', { name: 'Nuevo estado' })).toBeVisible()
    // CT10: el autor (vec2, 220 puntos) pasa a 230 y suma un reporte real.
    await expect.poll(async () => (await bd.doc('users/vec2/confianza/actual').get()).data()?.puntosConfianza).toBe(230)
    expect((await bd.doc('reports/r_ajeno3').get()).data()?.validacion).toMatchObject({ veredicto: 'real', veredictoPuntos: 10 })
  })

  test('CT11 · El veredicto «falso» exige un motivo y resta 15 puntos', async ({ page }) => {
    await abrirLista(page, '?reporte=r_ajeno4')
    const d = detalle(page)
    await d.getByRole('button', { name: 'Marcar como falso' }).click()
    await expect(d.getByRole('button', { name: 'Confirmar: es falso' })).toBeDisabled()
    await d.getByLabel('Motivo (obligatorio)').fill('No existe en el lugar indicado')
    await d.getByRole('button', { name: 'Confirmar: es falso' }).click()
    await expect(d.getByText('Marcado como falso').first()).toBeVisible()
    await expect.poll(async () => (await bd.doc('users/vec2/confianza/actual').get()).data()?.puntosConfianza).toBe(215)
    expect((await bd.doc('reports/r_ajeno4').get()).data()?.validacion).toMatchObject({
      veredicto: 'falso',
      veredictoComentario: 'No existe en el lugar indicado',
    })
  })

  test('CT13 · Un reporte con veredicto no admite otro', async ({ page }) => {
    await abrirLista(page, '?reporte=r_real')
    const d = detalle(page)
    await expect(d.getByText('Marcado como real')).toBeVisible()
    await expect(d.getByRole('button', { name: 'Marcar como falso' })).toHaveCount(0)
  })

  test('WG4 / MS4 / MS5 · Cambios de estado seguidos en el mismo detalle', async ({ page }) => {
    await abrirLista(page, '?reporte=r_revision')
    const d = detalle(page)
    const cambiar = async (estado: string) => {
      await d.getByRole('combobox', { name: 'Nuevo estado' }).selectOption({ label: estado })
      await d.getByLabel('Comentario del cambio de estado').fill(`Pasa a ${estado}`)
      await d.getByRole('button', { name: 'Aplicar' }).click()
      await expect(d.getByRole('button', { name: 'Aplicar' })).toBeEnabled()
    }
    await cambiar('Derivado')
    await expect(d.getByText('No tienes permiso')).toHaveCount(0)
    await cambiar('En proceso')
    await expect(d.getByText('No tienes permiso')).toHaveCount(0)
    await expect.poll(async () => (await bd.doc('reports/r_revision').get()).data()?.estado).toBe('en_proceso')
    const historial = await bd.collection('reports/r_revision/statusHistory').get()
    expect(historial.size).toBe(2)
    // MS5: solo se ofrece el siguiente estado válido (no se puede saltar a «Reportado»).
    const opciones = await d.getByRole('combobox', { name: 'Nuevo estado' }).locator('option').allInnerTexts()
    expect(opciones).not.toContain('Reportado')
  })
})

test.describe('Acciones en lote, CSV y eliminación', () => {
  test('WG5 · Cambio de estado en lote: omite el reporte sin veredicto', async ({ page }) => {
    await abrirLista(page)
    await conTamano48(page)
    await tarjeta(page, R.real).getByRole('checkbox').check()
    await tarjeta(page, R.nuevo).getByRole('checkbox').check()
    const barra = page.getByRole('region', { name: 'Acciones con los seleccionados' })
    await expect(barra.getByText('2 seleccionados')).toBeVisible()
    await barra.getByRole('button', { name: 'Cambiar estado' }).click()
    await barra.getByLabel('Nuevo estado').selectOption({ label: 'En revisión' })
    await expect(barra.getByText(/Se aplica a 1 de 2/)).toBeVisible()
    await barra.getByRole('button', { name: 'Aplicar' }).click()
    await page.getByRole('dialog').getByRole('button', { name: /^Cambiar 1 reporte/ }).click()
    await expect(page.getByRole('status').filter({ hasText: /actualiz/ })).toBeVisible()
    await expect.poll(async () => (await bd.doc('reports/r_real').get()).data()?.estado).toBe('en_revision')
    expect((await bd.doc('reports/r_nuevo').get()).data()?.estado).toBe('reportado')
  })

  test('WG7 · Reasignar y quitar el operador de un reporte, en lote', async ({ page }) => {
    await abrirLista(page)
    await conTamano48(page)
    await tarjeta(page, R.antiguo).getByRole('checkbox').check()
    const barra = page.getByRole('region', { name: 'Acciones con los seleccionados' })
    await barra.getByRole('button', { name: 'Cambiar operador' }).click()
    await barra.getByRole('combobox', { name: 'Operador' }).selectOption({ label: 'Operador Cerrillos' })
    await barra.getByRole('button', { name: 'Aplicar' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Asignar' }).click()
    await expect.poll(async () => (await bd.doc('reports/r_antiguo').get()).data()?.operadorId).toBe('opr_b')
    await expect(tarjeta(page, R.antiguo).getByText('Operador Cerrillos')).toBeVisible()
    // Quitar el operador.
    await tarjeta(page, R.antiguo).getByRole('checkbox').check()
    await barra.getByRole('button', { name: 'Cambiar operador' }).click()
    await barra.getByRole('combobox', { name: 'Operador' }).selectOption({ label: 'Sin asignar' })
    await barra.getByRole('button', { name: 'Aplicar' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Quitar operador' }).click()
    await expect.poll(async () => (await bd.doc('reports/r_antiguo').get()).data()?.operadorId ?? null).toBeNull()
  })

  test('WG6 · Exportar CSV con todos los reportes filtrados', async ({ page }) => {
    await abrirLista(page)
    await page.getByRole('combobox', { name: 'Categoría' }).selectOption({ label: 'Accesibilidad' })
    await page.getByRole('combobox', { name: 'Estado' }).selectOption({ label: 'Cerrado' })
    await expect(rango(page)).toHaveText(/de 10$/)
    const descarga = page.waitForEvent('download')
    await page.getByRole('button', { name: /Exportar CSV/ }).click()
    const archivo = await descarga
    const ruta = await archivo.path()
    const texto = readFileSync(ruta, 'utf8').replace(/^﻿/, '')
    const lineas = texto.split(/\r?\n/).filter((l) => l.trim() !== '')
    expect(lineas.length).toBe(11) // encabezado + 10 reportes
    expect(texto).not.toContain('data:image')
  })

  test('WG8 · Eliminar un reporte borra también su historial', async ({ page }) => {
    expect((await bd.collection('reports/r_derivado/statusHistory').get()).size).toBe(2)
    await abrirLista(page)
    await conTamano48(page)
    await tarjeta(page, R.derivado).getByRole('button', { name: 'Eliminar' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Eliminar' }).click()
    await expect(tarjeta(page, R.derivado)).toHaveCount(0)
    await expect.poll(async () => (await bd.doc('reports/r_derivado').get()).exists).toBe(false)
    expect((await bd.collection('reports/r_derivado/statusHistory').get()).size).toBe(0)
  })
})

test('PA3 · Al sumar puntos con un veredicto «real» el vecino sube de nivel', async ({ page, browser }) => {
  await bd.doc('users/vec3/confianza/actual').set({ puntosConfianza: 35, trustLevel: 0, validatedReports: 0, reportesFalsos: 0, confirmacionesSuspendidas: false })
  await bd.doc('reports/r_pa3').set(reporte({ id: 'r_pa3', descripcion: 'E2E reporte para subir de nivel', comuna: MAIPU, uid: 'vec3', lat: -33.55, lng: -70.8 }))
  await abrirLista(page, '?reporte=r_pa3')
  const d = detalle(page)
  await d.getByRole('button', { name: 'Marcar como real' }).click()
  await d.getByRole('button', { name: 'Confirmar: es real' }).click()
  await expect(d.getByText('Marcado como real')).toBeVisible()
  await expect.poll(async () => (await bd.doc('users/vec3/confianza/actual').get()).data()).toMatchObject({ puntosConfianza: 45, trustLevel: 1 })
  const vecino = await paginaDe(browser, 'vecino3')
  await vecino.goto('/mi-nivel')
  await expect(vecino.getByText('Nivel 1 · Vecino').first()).toBeVisible()
  await expect(vecino.getByText('45 puntos de confianza')).toBeVisible()
})
