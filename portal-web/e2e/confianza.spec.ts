// Fase 7: sistema de confianza en pantalla (confirmar con peso, barra de verificación, «Mi nivel»).
import { expect, test } from '@playwright/test'
import { Timestamp } from 'firebase-admin/firestore'
import { MAIPU, POSICION, R, bd, reporte, sembrar } from './datos/semilla'
import { abrirDetalle, abrirMapa } from './ayudas/mapa'
import { paginaDe, rutaSesion } from './ayudas/sesion'

test.beforeAll(async () => {
  await sembrar()
})

const panel = (page: import('@playwright/test').Page) => page.getByRole('complementary')

test.describe('Confirmar un reporte (vecino de nivel 0)', () => {
  test.use({ storageState: rutaSesion('vecino1') })

  test('CT3 / VC3 / VC4 / CT7 · Confirmar con peso, no repetir y pausa de 20 s', async ({ page }) => {
    await abrirMapa(page)
    await abrirDetalle(page, 'r_ajeno')
    await expect(panel(page).getByText(R.ajeno)).toBeVisible()
    await expect(panel(page).getByText('Tu voto vale 10 puntos · te quedan 5 confirmaciones hoy.')).toBeVisible()
    await expect(panel(page).getByText(/^0 % ·/)).toBeVisible()
    await panel(page).getByRole('button', { name: 'Confirmar que existe' }).click()
    await expect(panel(page).getByText('Confirmación registrada: aportaste 10 puntos.')).toBeVisible()
    await expect(panel(page).getByText(/^10 % · 1 persona confirmó/)).toBeVisible()
    // VC4: ya no se puede volver a confirmar.
    await expect(panel(page).getByText(/Ya confirmaste este reporte · aportaste 10 puntos/)).toBeVisible()
    await expect(panel(page).getByRole('button', { name: 'Confirmar que existe' })).toHaveCount(0)
    // CT7: en otro reporte el botón espera 20 s con cuenta regresiva.
    await panel(page).getByRole('button', { name: 'Cerrar detalle del reporte' }).click()
    await abrirDetalle(page, 'r_ajeno2')
    const boton = panel(page).getByRole('button', { name: /^Espera \d+ s$/ })
    await expect(boton).toBeVisible()
    await expect(boton).toBeDisabled()
    await expect(panel(page).getByRole('button', { name: 'Confirmar que existe' })).toBeEnabled({ timeout: 25_000 })
  })

  test('VC5 · El número de confirmaciones coincide y la barra usa puntos y personas', async ({ page }) => {
    await abrirMapa(page)
    await abrirDetalle(page, 'r_validado')
    await expect(panel(page).getByText('Confirmaciones')).toBeVisible()
    await expect(panel(page).locator('dd').nth(1)).toHaveText('3')
    await expect(panel(page).getByText(/100 % · 4 personas confirmaron/)).toBeVisible()
    await expect(panel(page).getByText('✓ Validado por la comunidad').first()).toBeVisible()
  })
})

test.describe('Casos especiales de quien confirma', () => {
  test('CT9 · El autor ve «Este es tu reporte»', async ({ browser }) => {
    const page = await paginaDe(browser, 'vecino2')
    await abrirMapa(page)
    await abrirDetalle(page, 'r_ajeno')
    await expect(panel(page).getByText('Este es tu reporte: lo confirman otros vecinos.')).toBeVisible()
  })

  test('CT9 · Un reporte con veredicto ya no se confirma', async ({ browser }) => {
    const page = await paginaDe(browser, 'vecino4')
    await abrirMapa(page)
    await abrirDetalle(page, 'r_real')
    await expect(panel(page).getByText('Un operador ya revisó este reporte: no hace falta confirmarlo.')).toBeVisible()
    await expect(panel(page).getByRole('button', { name: 'Confirmar que existe' })).toHaveCount(0)
  })

  test('WX1 · Un reporte resuelto o cerrado (también el retirado por su autor) no ofrece «Confirmar»', async ({ browser }) => {
    // Un reporte retirado por su autor queda «cerrado» y sin veredicto: las reglas ya no aceptan confirmarlo.
    const id = 'r_retirado'
    POSICION[id] = { lat: -33.53, lng: -70.8 }
    await bd.doc(`reports/${id}`).set(
      reporte({
        id, descripcion: 'E2E reporte retirado por su autor', comuna: MAIPU, uid: 'vec2', estado: 'cerrado',
        ...POSICION[id], extra: { retiradoPorAutor: true, cerradoSinResolverAt: Timestamp.now() },
      }),
    )
    try {
      const page = await paginaDe(browser, 'vecino4')
      await abrirMapa(page)
      for (const [reporteId, mensaje] of [
        [id, 'Este reporte ya está resuelto o cerrado: ya no se puede confirmar.'],
        ['r_resuelto', 'Este reporte ya está resuelto o cerrado: ya no se puede confirmar.'],
        ['r_cerrado', 'Este reporte ya está resuelto o cerrado: ya no se puede confirmar.'],
      ]) {
        await abrirDetalle(page, reporteId)
        await expect(panel(page).getByText(mensaje)).toBeVisible()
        await expect(panel(page).getByRole('button', { name: 'Confirmar que existe' })).toHaveCount(0)
      }
    } finally {
      await bd.doc(`reports/${id}`).delete()
    }
  })

  test('CT5 · Con el correo sin verificar la confirmación pesa 0 y se avisa', async ({ browser }) => {
    const page = await paginaDe(browser, 'sinVerificar')
    await abrirMapa(page)
    await abrirDetalle(page, 'r_ajeno3')
    await expect(panel(page).getByText(/no suma puntos hasta que verifiques tu correo/)).toBeVisible()
    await panel(page).getByRole('button', { name: 'Confirmar que existe' }).click()
    await expect(panel(page).getByText('Tu confirmación ha sido registrada. Debes verificar tu correo para que tu validación tenga peso.')).toBeVisible()
    await expect(panel(page).getByText(/^0 % ·/)).toBeVisible()
  })

  test('CT5 · Una cuenta de menos de 24 horas también pesa 0', async ({ browser }) => {
    const page = await paginaDe(browser, 'recien')
    await abrirMapa(page)
    await abrirDetalle(page, 'r_ajeno4')
    await expect(panel(page).getByText(/las cuentas con menos de 24 horas todavía no suman puntos/)).toBeVisible()
  })

  test('CT6 · Al llegar al límite diario el botón se reemplaza por un aviso', async ({ browser }) => {
    const page = await paginaDe(browser, 'vecino3')
    await abrirMapa(page)
    await abrirDetalle(page, 'r_ajeno5')
    await expect(panel(page).getByText(/Llegaste a tus 5 confirmaciones de hoy\. Se reinician a las /)).toBeVisible()
    await expect(panel(page).getByRole('button', { name: 'Confirmar que existe' })).toHaveCount(0)
  })

  test('CT8 / CT18 · Confirmaciones suspendidas: aviso en el reporte y en «Mi nivel»', async ({ browser }) => {
    const page = await paginaDe(browser, 'suspendido')
    await abrirMapa(page)
    await abrirDetalle(page, 'r_ajeno5')
    await expect(panel(page).getByText(/Tus confirmaciones están suspendidas por un administrador/)).toBeVisible()
    await expect(panel(page).getByRole('button', { name: 'Confirmar que existe' })).toHaveCount(0)
    await page.goto('/mi-nivel')
    await expect(page.getByRole('alert').filter({ hasText: 'suspendidas por la administración' })).toBeVisible()
  })
})

test.describe('Mi nivel', () => {
  test('CT16 / PA2 · Nivel, puntos, siguiente nivel, peso del voto y tabla (nivel 4)', async ({ browser }) => {
    const page = await paginaDe(browser, 'vecino2')
    await page.goto('/mi-nivel')
    await expect(page.getByText('Nivel 4 · Vigía')).toBeVisible()
    await expect(page.getByText('220 puntos de confianza')).toBeVisible()
    await expect(page.getByText('Te faltan 40 puntos para el nivel 5 · Vigía confiable.')).toBeVisible()
    await expect(page.getByText(/Hoy tu voto pesa/)).toContainText('20')
    await expect(page.getByRole('progressbar', { name: 'Avance hacia el siguiente nivel' })).toBeVisible()
    // PA5: contadores del día y de reportes verificados.
    await expect(page.getByText('Reportes reales')).toBeVisible()
    await expect(page.getByText(/Confirmaciones de hoy:/)).toContainText(/de \d+/)
    // PA2: la tabla muestra los 11 niveles con su nombre.
    const tabla = page.getByRole('table')
    await expect(tabla.getByRole('row')).toHaveCount(12)
    await expect(tabla.getByText('0 · Vecino nuevo')).toBeVisible()
    await expect(tabla.getByText('10 · Guardián de la ciudad')).toBeVisible()
  })

  test('CT16 · Nivel máximo y nivel 0 sin datos', async ({ browser }) => {
    const maximo = await paginaDe(browser, 'nivelMaximo')
    await maximo.goto('/mi-nivel')
    await expect(maximo.getByText('Nivel 10 · Guardián de la ciudad').first()).toBeVisible()
    await expect(maximo.getByText('Estás en el nivel máximo.')).toBeVisible()

    const nuevo = await paginaDe(browser, 'vecino4')
    await nuevo.goto('/mi-nivel')
    await expect(nuevo.getByText('Nivel 0 · Vecino nuevo').first()).toBeVisible()
    await expect(nuevo.getByText('Todavía no tienes reportes verificados: empiezas en el nivel 0 con 0 puntos.')).toBeVisible()
  })

  test('CT16 · Sin correo verificado ofrece «Ya verifiqué mi correo»; otros roles vuelven al inicio', async ({ browser }) => {
    const sinVerificar = await paginaDe(browser, 'sinVerificar')
    await sinVerificar.goto('/mi-nivel')
    await expect(sinVerificar.getByRole('button', { name: 'Ya verifiqué mi correo' })).toBeVisible()
    await expect(sinVerificar.getByText(/Mientras falte alguna de estas condiciones tu confirmación se registra, pero pesa 0/)).toBeVisible()

    const admin = await paginaDe(browser, 'admin')
    await admin.goto('/mi-nivel')
    await expect(admin).toHaveURL('/')
  })
})

test('VC6 · La confirmación de otro vecino suma al reporte y cada voto pesa según su nivel', async ({ browser }) => {
  const primera = await paginaDe(browser, 'vecino4')
  await abrirMapa(primera)
  await abrirDetalle(primera, 'r_ajeno5')
  await panel(primera).getByRole('button', { name: 'Confirmar que existe' }).click()
  await expect(panel(primera).getByText('Confirmación registrada: aportaste 10 puntos.')).toBeVisible()
  const segunda = await paginaDe(browser, 'nivelMaximo')
  await abrirMapa(segunda)
  await abrirDetalle(segunda, 'r_ajeno5')
  await expect(panel(segunda).getByText(/^10 % · 1 persona confirmó/)).toBeVisible()
  await panel(segunda).getByRole('button', { name: 'Confirmar que existe' }).click()
  await expect(panel(segunda).getByText('Confirmación registrada: aportaste 34 puntos.')).toBeVisible()
  await expect(panel(segunda).getByText(/^44 % · 2 personas confirmaron/)).toBeVisible()
})
