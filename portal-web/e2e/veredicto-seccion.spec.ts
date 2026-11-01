// Fase 4: dar el veredicto desde «Por veredicto» sin salir de la sección.
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { Timestamp } from 'firebase-admin/firestore'
import { CERRILLOS, MAIPU, bd, reporte, sembrar } from './datos/semilla'
import { paginaDe } from './ayudas/sesion'

const HORA = 3_600_000
const hace = (horas: number) => Timestamp.fromMillis(Date.now() - horas * HORA)
const val = (horasValidado: number, extra: object = {}) => ({
  puntos: 105, votos: 4, validado: true, validadoAt: hace(horasValidado), veredicto: null, ...extra,
})

// Los autores de los reportes son vecinos con puntos (vec2: 220 puntos, nivel 4).
const D = {
  real: 'E2E pendiente para dar veredicto real',
  falso: 'E2E pendiente para dar veredicto falso',
  b1: 'E2E con veredicto de 6 horas',
  b2: 'E2E con veredicto de 12 horas',
}

test.beforeAll(async () => {
  await sembrar()
  const nuevo = (id: string, d: Parameters<typeof reporte>[0]) => bd.doc(`reports/${id}`).set(reporte(d))
  await Promise.all([
    // Operador B: su único pendiente, validado hace 10 h. Con el veredicto de otros dos (6 h y 12 h) y el de la semilla (1 día).
    nuevo('p_real', { id: 'p_real', descripcion: D.real, comuna: CERRILLOS, uid: 'vec2', validacion: val(10) }),
    nuevo('vb_1', { id: 'vb_1', descripcion: D.b1, comuna: CERRILLOS, validacion: val(10, { veredicto: 'real', veredictoPor: 'oper2', veredictoAt: hace(4), veredictoPuntos: 10 }) }),
    nuevo('vb_2', { id: 'vb_2', descripcion: D.b2, comuna: CERRILLOS, validacion: val(30, { veredicto: 'real', veredictoPor: 'oper2', veredictoAt: hace(18), veredictoPuntos: 10 }) }),
    // Operador A: para el veredicto «falso».
    nuevo('p_falso', { id: 'p_falso', descripcion: D.falso, comuna: MAIPU, uid: 'vec2', validacion: val(3) }),
  ])
})

const tarjetas = (page: Page) => page.getByRole('article')
const tarjeta = (page: Page, texto: string) => tarjetas(page).filter({ hasText: texto })
const indicador = (page: Page, nombre: string) => page.getByRole('group', { name: nombre })
const aviso = (page: Page, texto: string) => page.getByRole('status').filter({ hasText: texto })
const confianza = async (uid: string) => (await bd.doc(`users/${uid}/confianza/actual`).get()).data()

async function abrir(page: Page, esperadas: number) {
  await page.goto('/operador/veredictos')
  await expect(page.getByRole('heading', { name: 'Por veredicto', level: 1 })).toBeVisible()
  await expect(tarjetas(page)).toHaveCount(esperadas, { timeout: 20_000 })
}

test('WV4 · Dar el veredicto «real» desde la lista: el detalle muestra el resultado, la tarjeta sale y los indicadores se actualizan', async ({ browser }) => {
  const page = await paginaDe(browser, 'operadorB')
  await abrir(page, 1)
  await page.getByRole('combobox', { name: 'Periodo de los tiempos' }).selectOption({ label: 'Todo' })
  // Antes: los tres veredictos del operador B tardaron 6 h, 12 h y 1 día.
  await expect(indicador(page, 'Tiempo hasta el veredicto')).toContainText('Promedio 14 h · 3 reportes')
  await expect(indicador(page, 'Confirmados sin veredicto')).toContainText('1')
  const antes = (await confianza('vec2'))?.puntosConfianza as number

  await tarjeta(page, D.real).getByRole('button', { name: 'Ver y dar veredicto' }).click()
  const detalle = page.getByRole('dialog')
  await detalle.getByRole('button', { name: 'Marcar como real' }).click()
  await detalle.getByRole('button', { name: 'Confirmar: es real' }).click()

  // El detalle sigue abierto y muestra el resultado, aunque el reporte ya salió de la lista.
  await expect(detalle.getByText(/Veredicto guardado \(\+10 puntos\)/)).toBeVisible()
  await expect(detalle.getByText(/Marcado como real/)).toBeVisible()
  await expect(detalle).toBeVisible()

  // Al cerrarlo: la tarjeta ya no está, aparece el aviso (con el foco) y los indicadores se actualizan.
  await detalle.getByRole('button', { name: 'Cerrar detalle' }).click()
  await expect(tarjetas(page)).toHaveCount(0)
  const mensaje = aviso(page, 'Veredicto «real» guardado')
  await expect(mensaje).toBeVisible()
  await expect(mensaje).toBeFocused()
  await expect(indicador(page, 'Confirmados sin veredicto')).toContainText('0')
  await expect(page.getByText('No tienes reportes confirmados esperando veredicto')).toBeVisible()
  // Ahora hay cuatro veredictos: 6 h, 10 h, 12 h y 1 día → mediana 11 h, promedio 13 h.
  await expect(indicador(page, 'Tiempo hasta el veredicto')).toContainText('Promedio 13 h · 4 reportes')
  await expect(indicador(page, 'Tiempo hasta el veredicto')).toContainText('11 h')

  // Lo que quedó escrito.
  const guardado = (await bd.doc('reports/p_real').get()).data()
  expect(guardado?.validacion).toMatchObject({ veredicto: 'real', veredictoPor: 'oper2', veredictoPuntos: 10 })
  expect((await confianza('vec2'))?.puntosConfianza).toBe(antes + 10)

  // El aviso se cierra solo a los 8 segundos.
  await expect(mensaje).toBeHidden({ timeout: 15_000 })
  await page.context().close()
})

test('WV15 · El veredicto «falso» exige un motivo; el aviso se cierra con su botón', async ({ browser }) => {
  const page = await paginaDe(browser, 'operadorA')
  await page.goto('/operador/veredictos')
  await expect(tarjeta(page, D.falso)).toBeVisible({ timeout: 20_000 })
  const cantidad = await tarjetas(page).count()
  const antes = (await confianza('vec2'))?.puntosConfianza as number

  await tarjeta(page, D.falso).getByRole('button', { name: 'Ver y dar veredicto' }).click()
  const detalle = page.getByRole('dialog')
  await detalle.getByRole('button', { name: 'Marcar como falso' }).click()
  const confirmar = detalle.getByRole('button', { name: 'Confirmar: es falso' })
  await expect(confirmar).toBeDisabled()
  await detalle.getByLabel('Motivo (obligatorio)').fill('No se encontró nada en el lugar')
  await expect(confirmar).toBeEnabled()
  await confirmar.click()
  await expect(detalle.getByText(/Veredicto guardado \(-15 puntos\)/)).toBeVisible()
  await detalle.getByRole('button', { name: 'Cerrar detalle' }).click()

  await expect(tarjeta(page, D.falso)).toHaveCount(0)
  await expect(tarjetas(page)).toHaveCount(cantidad - 1)
  const mensaje = aviso(page, 'Veredicto «falso» guardado')
  await expect(mensaje).toBeVisible()
  // Se cierra antes con su botón.
  await mensaje.getByRole('button', { name: 'Cerrar aviso' }).click()
  await expect(mensaje).toBeHidden()

  const guardado = (await bd.doc('reports/p_falso').get()).data()
  expect(guardado?.validacion).toMatchObject({ veredicto: 'falso', veredictoPor: 'oper1', veredictoComentario: 'No se encontró nada en el lugar', veredictoPuntos: -15 })
  expect((await confianza('vec2'))?.puntosConfianza).toBe(antes - 15)
  await page.context().close()
})
