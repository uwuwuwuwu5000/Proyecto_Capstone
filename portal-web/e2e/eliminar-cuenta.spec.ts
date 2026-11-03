// Fase 7: eliminar la cuenta desde «Mi perfil» (historia J2). Cada prueba crea su propia cuenta, porque
// eliminar es destructivo y la sesión guardada de las cuentas de prueba dejaría de servir.
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { CLAVE, MAIPU, VERSION_TERMINOS, autenticacion, bd, reporte, sembrar } from './datos/semilla'
import { Timestamp } from 'firebase-admin/firestore'
import { rutaSesion } from './ayudas/sesion'

test.beforeAll(async () => {
  await sembrar()
})

const AVISO = 'Tu cuenta fue eliminada. Tus reportes se conservan sin tu nombre.'

/** Una cuenta de ciudadano con dos reportes y una queja a soporte. */
async function crearCuenta(uid: string) {
  const correo = `${uid}@prueba.cl`
  const nombre = `Vecino ${uid}`
  await autenticacion.createUser({ uid, email: correo, password: CLAVE, displayName: nombre, emailVerified: true })
  const hace = Timestamp.fromMillis(Date.now() - 30 * 24 * 3_600_000)
  await bd.doc(`users/${uid}`).set({
    uid, displayName: nombre, email: correo, emailVerified: true, role: 'ciudadano', trustLevel: 0, validatedReports: 0,
    terminosVersion: VERSION_TERMINOS, terminosAceptadosAt: hace, createdAt: hace, updatedAt: hace,
  })
  for (const n of [1, 2]) {
    await bd.doc(`reports/${uid}_${n}`).set({ ...reporte({ id: `${uid}_${n}`, descripcion: `E2E reporte ${n} de ${uid}`, comuna: MAIPU, uid }), autorNombre: nombre })
  }
  await bd.doc(`supportTickets/${uid}_t`).set({
    uid, autorNombre: nombre, autorEmail: correo, tipo: 'queja', asunto: `E2E queja de ${uid}`, estado: 'abierto', asignadoA: null,
    lastMessageAt: hace, lastMessagePreview: 'Hola', createdAt: hace,
  })
  return { correo, nombre }
}

async function entrar(page: Page, correo: string) {
  await page.goto('/login')
  await page.getByLabel('Correo').fill(correo)
  await page.getByLabel('Contraseña').fill(CLAVE)
  await page.getByRole('button', { name: 'Iniciar sesión' }).click()
  await expect(page).toHaveURL('/')
}

const dialogo = (page: Page) => page.getByRole('dialog', { name: 'Eliminar mi cuenta' })

async function abrirDialogo(page: Page) {
  await page.goto('/mi-perfil')
  await page.getByRole('button', { name: 'Eliminar mi cuenta' }).click()
  await expect(dialogo(page)).toBeVisible()
}

test('WL6 · Con una contraseña incorrecta no se borra nada y la sesión sigue', async ({ page }) => {
  const { correo, nombre } = await crearCuenta('del1')
  await entrar(page, correo)
  await abrirDialogo(page)
  await dialogo(page).getByLabel('Contraseña').fill('incorrecta1')
  await dialogo(page).getByRole('button', { name: 'Eliminar mi cuenta' }).click()
  await expect(dialogo(page).getByText('La contraseña no es correcta.')).toBeVisible()
  await expect(page).toHaveURL(/\/mi-perfil/)
  // Nada cambió: reportes, ticket, perfil y cuenta de acceso siguen como estaban.
  expect((await bd.doc('reports/del1_1').get()).data()?.autorNombre).toBe(nombre)
  expect((await bd.doc('supportTickets/del1_t').get()).data()).toMatchObject({ autorNombre: nombre, autorEmail: correo })
  expect((await bd.doc('users/del1').get()).data()).toMatchObject({ displayName: nombre, email: correo })
  expect((await autenticacion.getUser('del1')).email).toBe(correo)
  // Se puede cancelar.
  await dialogo(page).getByRole('button', { name: 'Cancelar' }).click()
  await expect(dialogo(page)).toHaveCount(0)
})

test('WL7 · Al eliminar la cuenta, los reportes quedan como «Cuenta eliminada» y el perfil sin correo ni nombre', async ({ page }) => {
  const { correo } = await crearCuenta('del2')
  await entrar(page, correo)
  await abrirDialogo(page)
  await dialogo(page).getByLabel('Contraseña').fill(CLAVE)
  await dialogo(page).getByRole('button', { name: 'Eliminar mi cuenta' }).click()
  // Se cierra la sesión y se vuelve al inicio con un aviso que no se repite al recargar.
  await expect(page).toHaveURL('/', { timeout: 20_000 })
  await expect(page.getByRole('status').filter({ hasText: AVISO })).toBeVisible()
  await expect
    .poll(async () => (await bd.doc('reports/del2_2').get()).data()?.autorNombre, { timeout: 20_000 })
    .toBe('Cuenta eliminada')
  // Los reportes se conservan, sin tocar nada más; los de otras personas no cambian.
  expect((await bd.doc('reports/del2_1').get()).data()).toMatchObject({ autorNombre: 'Cuenta eliminada', descripcion: 'E2E reporte 1 de del2', uid: 'del2' })
  expect((await bd.doc('reports/del2_1').get()).data()?.uid).toBe('del2')
  const ajenos = await bd.collection('reports').where('uid', '==', 'vec1').get()
  expect(ajenos.docs.every((d) => d.data().autorNombre === 'Vecina Uno')).toBe(true)
  expect((await bd.doc('supportTickets/del2_t').get()).data()).toMatchObject({ autorNombre: 'Cuenta eliminada', autorEmail: '' })
  expect((await bd.doc('users/del2').get()).data()).toMatchObject({ displayName: 'Cuenta eliminada', email: '', role: 'ciudadano' })
  await expect(autenticacion.getUser('del2')).rejects.toMatchObject({ code: 'auth/user-not-found' })
  await page.reload()
  await expect(page.getByRole('status').filter({ hasText: AVISO })).toHaveCount(0)
})

test('WL8 · Una cuenta eliminada no puede volver a iniciar sesión', async ({ page }) => {
  const { correo } = await crearCuenta('del3')
  await entrar(page, correo)
  await abrirDialogo(page)
  await dialogo(page).getByLabel('Contraseña').fill(CLAVE)
  await dialogo(page).getByRole('button', { name: 'Eliminar mi cuenta' }).click()
  await expect(page).toHaveURL('/', { timeout: 20_000 })
  await page.goto('/login')
  await page.getByLabel('Correo').fill(correo)
  await page.getByLabel('Contraseña').fill(CLAVE)
  await page.getByRole('button', { name: 'Iniciar sesión' }).click()
  await expect(page.getByText('Correo o contraseña incorrectos.')).toBeVisible()
  await expect(page).toHaveURL(/\/login/)
})

test.describe('WL9 · Solo los ciudadanos ven «Eliminar mi cuenta»', () => {
  test('un ciudadano la ve', async ({ browser }) => {
    const contexto = await browser.newContext({ storageState: rutaSesion('vecino1'), baseURL: 'http://localhost:5174' })
    const page = await contexto.newPage()
    await page.goto('/mi-perfil')
    await expect(page.getByRole('heading', { name: 'Mi perfil', level: 1 })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Eliminar mi cuenta' })).toBeVisible()
    await contexto.close()
  })

  for (const cuenta of ['operadorA', 'admin'] as const) {
    test(`${cuenta} no la ve`, async ({ browser }) => {
      const contexto = await browser.newContext({ storageState: rutaSesion(cuenta), baseURL: 'http://localhost:5174' })
      const page = await contexto.newPage()
      await page.goto('/mi-perfil')
      await expect(page.getByRole('heading', { name: 'Mi perfil', level: 1 })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Cerrar sesión' })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Eliminar mi cuenta' })).toHaveCount(0)
      await contexto.close()
    })
  }
})

test('WL10 · «Mi perfil», el diálogo y el aviso de cuenta eliminada no se desplazan en horizontal en un teléfono (393 px)', async ({ browser }) => {
  const { correo } = await crearCuenta('del4')
  const contexto = await browser.newContext({ viewport: { width: 393, height: 800 }, baseURL: 'http://localhost:5174' })
  const page = await contexto.newPage()
  const desborde = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  await entrar(page, correo)
  await abrirDialogo(page)
  expect(await desborde(), 'Mi perfil con el diálogo abierto').toBeLessThanOrEqual(1)
  const caja = await dialogo(page).boundingBox()
  expect(caja!.x).toBeGreaterThanOrEqual(0)
  expect(caja!.x + caja!.width).toBeLessThanOrEqual(393)
  await dialogo(page).getByLabel('Contraseña').fill(CLAVE)
  await dialogo(page).getByRole('button', { name: 'Eliminar mi cuenta' }).click()
  await expect(page).toHaveURL('/', { timeout: 20_000 })
  await expect(page.getByRole('status').filter({ hasText: AVISO })).toBeVisible()
  expect(await desborde(), 'inicio con el aviso').toBeLessThanOrEqual(1)
  await contexto.close()
})
