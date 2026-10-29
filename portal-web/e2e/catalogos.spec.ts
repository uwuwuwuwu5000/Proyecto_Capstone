// Fase 11 (parte 1): organismos, operadores, cuentas y categorías.
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { CLAVE, bd, sembrar } from './datos/semilla'
import { rutaSesion } from './ayudas/sesion'

test.use({ storageState: rutaSesion('admin') })
test.beforeAll(async () => {
  await sembrar()
})

const fila = (page: Page, texto: string | RegExp) => page.getByRole('row').filter({ hasText: texto })

test.describe('Organismos', () => {
  test('WO1 · Tabla con paginación, búsqueda y filtros', async ({ page }) => {
    await page.goto('/admin/organismos')
    await expect(page.getByRole('heading', { name: 'Organismos activos' })).toBeVisible()
    const nav = page.getByRole('navigation', { name: 'Paginación de organismos' })
    const total = (await bd.collection('organismos').count().get()).data().count
    await expect(page.getByText(new RegExp(`${total} de ${total} organismos · ${total - 1} activos`))).toBeVisible({ timeout: 20_000 })
    // 25 por página por defecto; luego 100.
    await expect(page.locator('tbody tr')).toHaveCount(25)
    await nav.getByLabel(/Por página/).selectOption('100')
    await expect(page.locator('tbody tr')).toHaveCount(100)
    // Búsqueda y filtro de estado.
    await page.getByPlaceholder('Comuna, nombre o id…').fill('Maipú')
    await expect(fila(page, 'Municipalidad de Maipú')).toBeVisible()
    await page.getByPlaceholder('Comuna, nombre o id…').fill('')
    await page.getByRole('combobox', { name: 'Estado' }).selectOption('inactivos')
    await expect(page.locator('tbody tr')).toHaveCount(1)
    await expect(fila(page, 'Municipalidad de Santiago')).toContainText('Inactivo')
  })

  test('WO2 · Desactivar y volver a activar un organismo', async ({ page }) => {
    await page.goto('/admin/organismos')
    await page.getByPlaceholder('Comuna, nombre o id…').fill('Maipú')
    const f = fila(page, 'Municipalidad de Maipú')
    await f.getByRole('button', { name: 'Desactivar' }).click()
    const dialogo = page.getByRole('dialog')
    await expect(dialogo.getByText(/dejarán de llegar a esta municipalidad/)).toBeVisible()
    await dialogo.getByRole('button', { name: 'Desactivar' }).click()
    await expect(f).toContainText('Inactivo')
    await expect.poll(async () => (await bd.doc('organismos/muni_13119').get()).data()?.activo).toBe(false)
    await f.getByRole('button', { name: 'Activar' }).click()
    await expect(f).toContainText('Activo')
    await expect.poll(async () => (await bd.doc('organismos/muni_13119').get()).data()?.activo).toBe(true)
  })
})

test.describe('Operadores y cuentas', () => {
  test('WO5 · Operadores activos sin cuenta', async ({ page }) => {
    await page.goto('/admin/operadores?sinCuenta=1')
    await expect(page.getByRole('heading', { name: 'Operadores', exact: true })).toBeVisible()
    await expect(page.locator('tbody tr')).toHaveCount(1)
    await expect(fila(page, 'Operador sin cuenta').getByRole('link', { name: 'Crear cuenta' })).toBeVisible()
    await page.getByLabel('Solo activos sin cuenta').uncheck()
    await expect(page.locator('tbody tr')).toHaveCount(3)
  })

  test('WO4 · Alta de un operador y de su cuenta, sin cerrar la sesión del administrador', async ({ page }) => {
    await page.goto('/admin/operadores')
    await page.getByRole('button', { name: '+ Nuevo operador' }).click()
    await page.getByRole('combobox', { name: 'Comuna' }).selectOption({ label: 'Pudahuel' })
    await page.getByRole('button', { name: 'Buscar organismo responsable' }).click()
    await page.getByPlaceholder('op_maipu').fill('op_pudahuel')
    await page.getByPlaceholder('Municipalidad de Maipú — Aseo y Ornato').fill('Operador Pudahuel')
    await page.getByRole('button', { name: 'Crear operador' }).click()
    await expect(fila(page, 'Operador Pudahuel')).toBeVisible()
    await expect.poll(async () => (await bd.doc('operadores/op_pudahuel').get()).exists).toBe(true)
    // Cuenta de acceso del operador.
    await fila(page, 'Operador Pudahuel').getByRole('link', { name: 'Crear cuenta' }).click()
    await expect(page).toHaveURL(/\/admin\/cuentas\?operador=op_pudahuel/)
    await page.getByPlaceholder('Municipalidad de Maipú').fill('Municipalidad de Pudahuel')
    await page.getByRole('textbox', { name: 'Correo' }).fill('pudahuel@prueba.cl')
    await page.getByLabel('Contraseña').fill(CLAVE)
    await page.getByRole('button', { name: 'Crear cuenta de organismo' }).click()
    await expect(page.getByText('Cuenta creada para pudahuel@prueba.cl.')).toBeVisible()
    // La sesión del administrador sigue abierta.
    await expect(page.getByRole('button', { name: /Admin Prueba/ })).toBeVisible()
    const perfiles = await bd.collection('users').where('email', '==', 'pudahuel@prueba.cl').get()
    expect(perfiles.size).toBe(1)
    expect(perfiles.docs[0].data()).toMatchObject({ role: 'operador', operadorId: 'op_pudahuel' })
    const operador = (await bd.doc('operadores/op_pudahuel').get()).data()
    expect(operador?.cuentas).toHaveLength(1)
  })
})

test.describe('Categorías', () => {
  test('WK1 · Crear y editar una categoría', async ({ page }) => {
    await page.goto('/admin/categorias')
    await expect(page.getByRole('heading', { name: 'Categorías' })).toBeVisible()
    await page.getByPlaceholder('senaletica').fill('senaletica')
    await page.locator('label', { hasText: 'Orden' }).locator('input').fill('9')
    await page.getByPlaceholder('Señalética dañada').fill('Señalética dañada')
    await page.getByRole('button', { name: 'Crear categoría' }).click()
    await expect(fila(page, 'Señalética dañada')).toBeVisible()
    await expect.poll(async () => (await bd.doc('categorias/senaletica').get()).data()).toMatchObject({ nombre: 'Señalética dañada', orden: 9, activa: true })
    // Editar el nombre (el id no cambia).
    await page.reload()
    await expect(async () => {
      await fila(page, 'Señalética dañada').getByRole('button', { name: 'Editar' }).click()
      await expect(page.getByRole('heading', { name: 'Editar "senaletica"' })).toBeVisible({ timeout: 2_000 })
    }).toPass({ timeout: 15_000 })
    await page.getByLabel('Nombre').fill('Señalética vial')
    await page.getByRole('button', { name: 'Guardar cambios' }).click()
    await expect(fila(page, 'Señalética vial')).toBeVisible()
    expect((await bd.doc('categorias/senaletica').get()).data()?.nombre).toBe('Señalética vial')
  })

  test('WK2 · Desactivar una categoría sin perder la historia de sus reportes', async ({ page }) => {
    await page.goto('/admin/categorias')
    const f = fila(page, /^.*Luminaria/)
    await f.getByRole('button', { name: 'Desactivar' }).first().click()
    await page.getByRole('dialog').getByRole('button', { name: 'Desactivar' }).click()
    await expect(f.first()).toContainText('Inactiva')
    await expect.poll(async () => (await bd.doc('categorias/luminaria').get()).data()?.activa).toBe(false)
    // Ya no se ofrece al crear reportes…
    await page.goto('/admin/reportes/nuevo')
    const opciones = await page.getByLabel('Categoría').locator('option').allInnerTexts()
    expect(opciones).not.toContain('Luminaria')
    // …pero los reportes antiguos siguen mostrando su nombre.
    await page.goto('/admin/reportes?reporte=r_nuevo')
    await expect(page.locator('[aria-labelledby="detalle-reporte-titulo"]').getByText('Luminaria').first()).toBeVisible()
  })

  test('WK3 · Reordenar con el teclado y ver cuántos reportes tiene cada categoría', async ({ page }) => {
    await page.goto('/admin/categorias')
    const cantidad = (await bd.collection('reports').where('categoria', '==', 'microbasural').count().get()).data().count
    await expect(fila(page, 'Microbasural').first()).toContainText(String(cantidad))
    const asa = page.getByRole('button', { name: /Mover "Microbasural"/ })
    await asa.focus()
    await asa.press('ArrowDown')
    await expect.poll(async () => (await bd.doc('categorias/microbasural').get()).data()?.orden).toBeGreaterThan(1)
    const ordenadas = await bd.collection('categorias').orderBy('orden').get()
    expect(ordenadas.docs[0].id).not.toBe('microbasural')
  })
})
