// Fase 12 (parte 2): campana de avisos. Se usa el vecino 4, que no tiene reportes propios,
// para controlar exactamente qué avisos debe ver.
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { Timestamp } from 'firebase-admin/firestore'
import { MAIPU, FALSO, VALIDADO, bd, reporte, sembrar } from './datos/semilla'
import { paginaDe } from './ayudas/sesion'

const HORA = 3_600_000

test.beforeAll(async () => {
  await sembrar()
  const nuevo = (id: string, extra: Parameters<typeof reporte>[0]) => bd.doc(`reports/${id}`).set(reporte(extra))
  await nuevo('r_av_estado', { id: 'r_av_estado', descripcion: 'E2E aviso de cambio de estado', comuna: MAIPU, uid: 'vec4', estado: 'en_revision' })
  await bd.doc('reports/r_av_estado/statusHistory/h1').set({
    desde: 'reportado', hacia: 'en_revision', comentario: 'Revisamos el caso', autorNombre: 'Municipalidad de Maipú', autorRol: 'operador', createdAt: Timestamp.fromMillis(Date.now() - 2 * HORA),
  })
  await nuevo('r_av_validado', { id: 'r_av_validado', descripcion: 'E2E aviso de validación', comuna: MAIPU, uid: 'vec4', validacion: { ...VALIDADO, validadoAt: Timestamp.fromMillis(Date.now() - HORA) } })
  await nuevo('r_av_falso', { id: 'r_av_falso', descripcion: 'E2E aviso de veredicto falso', comuna: MAIPU, uid: 'vec4', validacion: { ...FALSO, veredictoAt: Timestamp.fromMillis(Date.now() - 3 * HORA) } })
  // Un reporte propio que otros vecinos confirmaron: no debe generar ningún aviso (AV7).
  await nuevo('r_av_confirmado', { id: 'r_av_confirmado', descripcion: 'E2E reporte confirmado por otros', comuna: MAIPU, uid: 'vec4' })
  await bd.doc('reports/r_av_confirmado/confirmations/vec2').set({ uid: 'vec2', reportId: 'r_av_confirmado', nivel: 0, peso: 10, createdAt: Timestamp.now() })
})

const campana = (page: Page) => page.getByRole('button', { name: /^Avisos/ })
const panel = (page: Page) => page.getByRole('dialog', { name: 'Avisos' })

test('AV1 / AV2 / AV3 / AV7 · Avisos de estado, validación y veredicto (y ninguno por confirmaciones)', async ({ browser }) => {
  const page = await paginaDe(browser, 'vecino4')
  await page.goto('/mapa')
  await expect(campana(page)).toHaveAccessibleName(/Avisos, 3 sin ver/, { timeout: 20_000 })
  await campana(page).click()
  const p = panel(page)
  await expect(p.getByText('Tu reporte pasó a «En revisión»')).toBeVisible()
  await expect(p.getByText('“Revisamos el caso”')).toBeVisible()
  await expect(p.getByText('Tu reporte fue validado por la comunidad')).toBeVisible()
  await expect(p.getByText('Tu reporte fue marcado como falso (−15 puntos)')).toBeVisible()
  await expect(p.getByText('“No se encontró nada en el lugar”')).toBeVisible()
  // AV7: el reporte confirmado por otro vecino no genera aviso.
  await expect(p.getByText('E2E reporte confirmado por otros')).toHaveCount(0)
  await expect(p.getByRole('button')).toHaveCount(3 + 1) // 3 avisos + «Marcar todos como vistos»
})

test('AV5 · Marcar como vistos persiste al recargar', async ({ browser }) => {
  const page = await paginaDe(browser, 'vecino4')
  await page.goto('/mapa')
  await expect(campana(page)).toHaveAccessibleName(/Avisos, 3 sin ver/, { timeout: 20_000 })
  await campana(page).click()
  await panel(page).getByRole('button', { name: 'Marcar todos como vistos' }).click()
  await expect(campana(page)).toHaveAccessibleName('Avisos')
  await page.reload()
  await expect(campana(page)).toBeVisible()
  await expect(campana(page)).toHaveAccessibleName('Avisos')
  const estado = (await bd.doc('users/vec4/avisos/estado').get()).data()
  expect(estado?.vistosHasta).toBeTruthy()
})

test('AV4 · Avisos de cambio de nivel: neutro, subida y bajada', async ({ browser }) => {
  const confianza = (puntos: number, nivel: number) =>
    bd.doc('users/vec3/confianza/actual').set({ puntosConfianza: puntos, trustLevel: nivel, validatedReports: 1, reportesFalsos: 0, confirmacionesSuspendidas: false })
  const page = await paginaDe(browser, 'vecino3')
  // Primera vez (nivel 2 sin referencia): texto neutro.
  await confianza(80, 2)
  await page.goto('/mapa')
  await campana(page).click()
  await expect(panel(page).getByText('Ahora estás en el Nivel 2 · Colaborador')).toBeVisible()
  // Al abrirlo se marca visto y lleva a «Mi nivel».
  await panel(page).getByText('Ahora estás en el Nivel 2 · Colaborador').click()
  await expect(page).toHaveURL(/\/mi-nivel/)
  await expect.poll(async () => JSON.stringify((await bd.doc('users/vec3/avisos/estado').get()).data()?.vistos ?? [])).toContain('nivel:2')
  // Sube a 3.
  await confianza(130, 3)
  await page.goto('/mapa')
  await campana(page).click()
  await expect(panel(page).getByText('Subiste al Nivel 3 · Colaborador activo')).toBeVisible()
  await panel(page).getByText('Subiste al Nivel 3 · Colaborador activo').click()
  await expect.poll(async () => JSON.stringify((await bd.doc('users/vec3/avisos/estado').get()).data()?.vistos ?? [])).toContain('nivel:3')
  // Baja a 1.
  await confianza(40, 1)
  await page.goto('/mapa')
  await campana(page).click()
  await expect(panel(page).getByText('Bajaste al Nivel 1 · Vecino')).toBeVisible()
})

test('AV6 · Avisos de soporte para el administrador: cada conversación abierta y los mensajes nuevos', async ({ browser }) => {
  const page = await paginaDe(browser, 'admin')
  await page.goto('/admin')
  await expect(campana(page)).toBeVisible()
  await campana(page).click()
  await expect(panel(page).getByText('Soporte: E2E queja por luminaria')).toBeVisible()
  await panel(page).getByText('Soporte: E2E queja por luminaria').click()
  await expect(page).toHaveURL(/\/admin\/soporte\/t1/)
  await page.goto('/admin')
  await campana(page).click()
  const visto = await page.getByText('Soporte: E2E queja por luminaria').count()
  expect(visto).toBeLessThanOrEqual(1)
  // Un mensaje nuevo en la misma conversación vuelve a avisar.
  await bd.doc('supportTickets/t1/messages/m9').set({ ticketId: 't1', autorUid: 'vec1', autorNombre: 'Vecina Uno', autorRol: 'ciudadano', texto: 'Otro mensaje', createdAt: Timestamp.now() })
  await bd.doc('supportTickets/t1').update({ lastMessageAt: Timestamp.now(), lastMessagePreview: 'Otro mensaje' })
  await page.reload()
  await expect(campana(page)).toHaveAccessibleName(/Avisos, \d+ sin ver/, { timeout: 20_000 })
})

test('AV8 · La campana la ven el vecino y el administrador, no el operador', async ({ browser }) => {
  for (const [cuenta, visible] of [['vecino4', true], ['admin', true], ['operadorA', false]] as const) {
    const page = await paginaDe(browser, cuenta)
    await page.goto(cuenta === 'operadorA' ? '/operador' : '/mapa')
    await expect(page.getByRole('navigation', { name: 'Principal' })).toBeVisible()
    if (visible) await expect(campana(page)).toBeVisible()
    else await expect(campana(page)).toHaveCount(0)
  }
})
