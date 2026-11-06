// Fase 6: términos de uso y política de privacidad (historia J1). El texto sale de comun/src/legal/terminos.ts.
import { expect, test } from './ayudas/prueba'
import { FieldValue } from 'firebase-admin/firestore'
import { CLAVE, CUENTAS, VERSION_TERMINOS, bd, sembrar } from './datos/semilla'
import { paginaDe, rutaSesion } from './ayudas/sesion'

test.beforeAll(async () => {
  await sembrar()
})

test('WL1 · El registro exige aceptar los términos y la política de privacidad', async ({ page }) => {
  await page.goto('/registro')
  await page.getByLabel('Nombre de usuario').fill('sin_aceptar')
  await page.getByLabel('Correo electrónico').fill('sin-aceptar@prueba.cl')
  await page.getByLabel('Contraseña', { exact: true }).fill(CLAVE)
  await page.getByLabel('Confirmar contraseña').fill(CLAVE)
  const casilla = page.getByLabel(/Acepto los términos/)
  await expect(casilla).not.toBeChecked()
  await page.getByRole('button', { name: 'Crear cuenta' }).click()
  await expect(page.getByText('Debes aceptar los términos y la política de privacidad para crear tu cuenta.')).toBeVisible()
  await expect(page).toHaveURL(/\/registro/)
  // No se creó ninguna cuenta.
  expect((await bd.collection('users').where('email', '==', 'sin-aceptar@prueba.cl').get()).size).toBe(0)
  // Los enlaces de la casilla llevan a los documentos.
  await expect(page.getByRole('link', { name: 'términos de uso' })).toHaveAttribute('href', '/terminos')
  await expect(page.getByRole('link', { name: 'política de privacidad' })).toHaveAttribute('href', '/privacidad')
})

test('WL2 · Al registrarse queda guardada la versión de los términos y la hora en que se aceptaron', async ({ page }) => {
  await page.goto('/registro')
  await page.getByLabel('Nombre de usuario').fill('con_terminos')
  await page.getByLabel('Correo electrónico').fill('con-terminos@prueba.cl')
  await page.getByLabel('Contraseña', { exact: true }).fill(CLAVE)
  await page.getByLabel('Confirmar contraseña').fill(CLAVE)
  await page.getByLabel(/Acepto los términos/).check()
  await page.getByRole('button', { name: 'Crear cuenta' }).click()
  await expect(page).toHaveURL('/')
  await expect
    .poll(async () => {
      const docs = (await bd.collection('users').where('email', '==', 'con-terminos@prueba.cl').get()).docs
      const d = docs[0]?.data()
      return d ? { version: d.terminosVersion, hora: Boolean(d.terminosAceptadosAt) } : null
    })
    .toEqual({ version: VERSION_TERMINOS, hora: true })
  // Una cuenta recién registrada no vuelve a ver la pantalla de aceptación.
  await expect(page.getByRole('heading', { name: 'Antes de continuar' })).toHaveCount(0)
})

test('WL3 · Una cuenta que no aceptó la versión vigente la acepta una sola vez al entrar', async ({ browser }) => {
  const page = await paginaDe(browser, 'sinTerminos')
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Antes de continuar' })).toBeVisible()
  // No se puede usar el portal hasta aceptar, ni entrando por otra ruta.
  await page.goto('/historial')
  await expect(page.getByRole('heading', { name: 'Antes de continuar' })).toBeVisible()
  // Se pueden leer los documentos desde la pantalla.
  await expect(page.getByRole('link', { name: 'Términos de uso' })).toHaveAttribute('href', '/terminos')
  await page.getByRole('button', { name: 'Acepto los términos y la política de privacidad' }).click()
  await expect(page.getByRole('heading', { name: 'Antes de continuar' })).toHaveCount(0)
  await expect
    .poll(async () => {
      const d = (await bd.doc(`users/${CUENTAS.sinTerminos.uid}`).get()).data()
      return { version: d?.terminosVersion, hora: Boolean(d?.terminosAceptadosAt) }
    })
    .toEqual({ version: VERSION_TERMINOS, hora: true })
  // Al recargar ya no vuelve a pedirlo.
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Antes de continuar' })).toHaveCount(0)
})

test('WL4 · Los términos y la política de privacidad se leen sin iniciar sesión', async ({ page }) => {
  await page.goto('/terminos')
  await expect(page).toHaveURL(/\/terminos$/)
  await expect(page.getByRole('heading', { name: 'Términos de uso', level: 1 })).toBeVisible()
  await expect(page.getByText('Qué es Ciudad Alerta')).toBeVisible()
  await expect(page.getByText(`Versión ${VERSION_TERMINOS}`)).toBeVisible()
  await page.goto('/privacidad')
  await expect(page).toHaveURL(/\/privacidad$/)
  await expect(page.getByRole('heading', { name: 'Política de privacidad', level: 1 })).toBeVisible()
  // Desde el pie de la página de inicio se llega a ambos documentos.
  await page.goto('/')
  await expect(page.getByRole('navigation', { name: 'Pie de página' }).getByRole('link', { name: 'Términos de uso' })).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Pie de página' }).getByRole('link', { name: 'Política de privacidad' })).toBeVisible()
})

test('WL5 · Las pantallas de términos y privacidad no se desplazan en horizontal en un teléfono (393 px)', async ({ browser }) => {
  const publico = await browser.newContext({ viewport: { width: 393, height: 800 }, baseURL: 'http://localhost:5174' })
  const pagina = await publico.newPage()
  const desborde = () => pagina.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  for (const ruta of ['/terminos', '/privacidad', '/registro', '/login', '/']) {
    await pagina.goto(ruta)
    await expect(pagina.locator('main, form').first()).toBeVisible()
    await pagina.waitForTimeout(500)
    expect(await desborde(), `${ruta} a 393 px`).toBeLessThanOrEqual(1)
  }
  await publico.close()
  // La pantalla de aceptación que ve una cuenta anterior a los términos (WL3 pudo haberla aceptado ya).
  await bd.doc(`users/${CUENTAS.sinTerminos.uid}`).update({ terminosVersion: FieldValue.delete(), terminosAceptadosAt: FieldValue.delete() })
  const contexto = await browser.newContext({ storageState: rutaSesion('sinTerminos'), viewport: { width: 393, height: 800 }, baseURL: 'http://localhost:5174' })
  const aceptacion = await contexto.newPage()
  await aceptacion.goto('/')
  await expect(aceptacion.getByRole('heading', { name: 'Antes de continuar' })).toBeVisible()
  expect(await aceptacion.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1)
  await contexto.close()
})
