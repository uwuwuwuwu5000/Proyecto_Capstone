// Fase 11 (parte 2): soporte del administrador (/admin/soporte).
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { Timestamp } from 'firebase-admin/firestore'
import { bd, sembrar } from './datos/semilla'
import { rutaSesion } from './ayudas/sesion'

test.use({ storageState: rutaSesion('admin') })
test.beforeAll(async () => {
  await sembrar()
})

const lista = (page: Page) => page.getByRole('region', { name: 'Conversaciones' })
const conversacion = (page: Page, asunto: string) => page.getByRole('region', { name: `Conversación: ${asunto}` })

test('WS1 · Bandeja en tiempo real con filtros', async ({ page }) => {
  await page.goto('/admin/soporte')
  await expect(page.getByRole('heading', { name: 'Chat de Soporte' })).toBeVisible()
  await expect(lista(page).getByRole('link')).toHaveCount(2)
  await lista(page).getByRole('combobox', { name: 'Tipo' }).selectOption({ label: 'Queja' })
  await expect(lista(page).getByRole('link')).toHaveCount(1)
  await expect(lista(page).getByText('E2E queja por luminaria')).toBeVisible()
  await lista(page).getByRole('combobox', { name: 'Tipo' }).selectOption('todos')
  await lista(page).getByRole('combobox', { name: 'Estado' }).selectOption({ label: 'En atención' })
  await expect(lista(page).getByText('E2E sugerencia de ciclovía')).toBeVisible()
  await expect(lista(page).getByRole('link')).toHaveCount(1)
  await lista(page).getByRole('combobox', { name: 'Estado' }).selectOption('todos')
  await lista(page).getByPlaceholder('Asunto, vecino o mensaje…').fill('luminaria')
  await expect(lista(page).getByRole('link')).toHaveCount(1)
  await lista(page).getByPlaceholder('Asunto, vecino o mensaje…').fill('')
  // Tiempo real: un mensaje nuevo del vecino aparece sin recargar.
  await bd.doc('supportTickets/t1/messages/m2').set({
    ticketId: 't1', autorUid: 'vec1', autorNombre: 'Vecina Uno', autorRol: 'ciudadano', texto: 'Sigo sin luz', createdAt: Timestamp.now(),
  })
  await bd.doc('supportTickets/t1').update({ lastMessageAt: Timestamp.now(), lastMessagePreview: 'Sigo sin luz' })
  await expect(lista(page).getByText('Sigo sin luz')).toBeVisible()
})

test('WS2 / ATN2 · Responder: el mensaje sale como equipo y el caso queda en atención', async ({ page }) => {
  await page.goto('/admin/soporte/t1')
  const c = conversacion(page, 'E2E queja por luminaria')
  await expect(c.getByText('Sin asignar')).toBeVisible()
  await c.getByPlaceholder('Escribe tu respuesta…').fill('Ya enviamos a una cuadrilla')
  await c.getByRole('button', { name: 'Enviar respuesta' }).click()
  await expect(c.getByText('Ya enviamos a una cuadrilla')).toBeVisible()
  await expect(c.getByText('Asignado a ti')).toBeVisible()
  await expect.poll(async () => (await bd.doc('supportTickets/t1').get()).data()?.estado).toBe('en_atencion')
  const mensajes = await bd.collection('supportTickets/t1/messages').where('texto', '==', 'Ya enviamos a una cuadrilla').get()
  expect(mensajes.docs[0].data()).toMatchObject({ autorRol: 'staff', autorUid: 'admin1' })
})

test('WS3 · Cerrar, reabrir y reabrir respondiendo', async ({ page }) => {
  await page.goto('/admin/soporte/t2')
  const c = conversacion(page, 'E2E sugerencia de ciclovía')
  await c.getByRole('button', { name: 'Cerrar conversación' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Confirmar' }).click()
  await expect.poll(async () => (await bd.doc('supportTickets/t2').get()).data()?.estado).toBe('cerrado')
  await c.getByRole('button', { name: 'Reabrir' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Confirmar' }).click()
  await expect.poll(async () => (await bd.doc('supportTickets/t2').get()).data()?.estado).toBe('en_atencion')
  // Responder a una conversación cerrada la reabre.
  await c.getByRole('button', { name: 'Cerrar conversación' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Confirmar' }).click()
  await expect.poll(async () => (await bd.doc('supportTickets/t2').get()).data()?.estado).toBe('cerrado')
  await c.getByPlaceholder('Escribe tu respuesta…').fill('Retomamos tu sugerencia')
  await c.getByRole('button', { name: 'Enviar respuesta' }).click()
  await expect.poll(async () => (await bd.doc('supportTickets/t2').get()).data()?.estado).toBe('en_atencion')
})

test.describe('Teléfono (393 px)', () => {
  test.use({ viewport: { width: 393, height: 851 } })

  test('WS4 · Una sola vista a la vez y conversación inexistente', async ({ page }) => {
    await page.goto('/admin/soporte')
    await expect(lista(page).getByRole('link').first()).toBeVisible()
    await expect(page.getByText('Elige una conversación para leerla y responder.')).toBeHidden()
    await lista(page).getByRole('link').first().click()
    await expect(page.getByRole('link', { name: '← Conversaciones' })).toBeVisible()
    await expect(lista(page)).toBeHidden()
    await page.goto('/admin/soporte/no-existe')
    await expect(page.getByText('Esta conversación ya no existe.')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Volver a la bandeja' })).toHaveAttribute('href', '/admin/soporte')
  })
})
