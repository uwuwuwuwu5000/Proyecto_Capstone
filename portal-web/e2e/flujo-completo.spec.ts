// IN1 (parte web): flujo completo de una incidencia en el portal.
// El vecino crea sus reportes desde la app; aquí el reporte ya existe y se prueba todo lo que sigue en el portal:
// otros vecinos lo confirman hasta validarlo, el operador da el veredicto, avanza el estado hasta cerrarlo
// y la persona que reportó ve el resultado en su historial y en sus avisos.
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { MAIPU, POSICION, bd, reporte, sembrar } from './datos/semilla'
import { abrirDetalle, abrirMapa } from './ayudas/mapa'
import { paginaDe } from './ayudas/sesion'

const DESCRIPCION = 'E2E flujo completo de gestión'

test.beforeAll(async () => {
  await sembrar()
  POSICION.r_in1 = { lat: -33.56, lng: -70.82 }
  await bd.doc('reports/r_in1').set(
    reporte({
      id: 'r_in1', descripcion: DESCRIPCION, comuna: MAIPU, uid: 'vec4', ...POSICION.r_in1,
      // Ya lo confirmaron dos personas (70 puntos): falta una tercera para validarlo.
      validacion: { puntos: 70, votos: 2, validado: false, validadoAt: null, veredicto: null },
    }),
  )
  for (const uid of ['vec2', 'vec3']) {
    await bd.doc(`reports/r_in1/confirmations/${uid}`).set({ uid, reportId: 'r_in1', nivel: 0, peso: 35, createdAt: new Date() })
  }
})

test('IN1 · Flujo completo: confirmar, validar, veredicto, cambios de estado hasta cerrar y seguimiento del vecino', async ({ browser }) => {
  test.setTimeout(240_000)

  // 1. Una tercera persona (nivel 10, voto de 34 puntos) lo confirma y el reporte queda validado.
  const confirmante = await paginaDe(browser, 'nivelMaximo')
  await abrirMapa(confirmante)
  await abrirDetalle(confirmante, 'r_in1')
  await confirmante.getByRole('button', { name: 'Confirmar que existe' }).click()
  await expect(confirmante.getByText('Con tu confirmación el reporte quedó validado por la comunidad. ¡Gracias!')).toBeVisible()
  await expect.poll(async () => (await bd.doc('reports/r_in1').get()).data()?.validacion).toMatchObject({ validado: true, votos: 3, puntos: 104 })

  // 2. El operador asignado ve el reporte en «Por verificar» y da el veredicto «real».
  const operador: Page = await paginaDe(browser, 'operadorA')
  await operador.goto('/operador/reportes?verificacion=por_verificar')
  const tarjeta = operador.getByRole('article').filter({ hasText: DESCRIPCION })
  await expect(tarjeta.getByText('Falta veredicto')).toBeVisible({ timeout: 20_000 })
  await tarjeta.getByRole('button', { name: 'Ver detalle' }).click()
  const detalle = operador.locator('[aria-labelledby="detalle-reporte-titulo"]')
  await detalle.getByRole('button', { name: 'Marcar como real' }).click()
  await detalle.getByRole('button', { name: 'Confirmar: es real' }).click()
  await expect(detalle.getByText('Marcado como real')).toBeVisible()

  // 3. Avanza el estado hasta cerrarlo, sin saltarse etapas.
  for (const estado of ['En revisión', 'Derivado', 'En proceso', 'Resuelto', 'Cerrado']) {
    await detalle.getByRole('combobox', { name: 'Nuevo estado' }).selectOption({ label: estado })
    await detalle.getByRole('button', { name: 'Aplicar' }).click()
    await expect(detalle.getByRole('button', { name: 'Aplicar' }).or(detalle.getByText('Este reporte está en su estado final'))).toBeVisible()
  }
  await expect.poll(async () => (await bd.doc('reports/r_in1').get()).data()?.estado, { timeout: 20_000 }).toBe('cerrado')
  const historial = await bd.collection('reports/r_in1/statusHistory').orderBy('createdAt').get()
  expect(historial.docs.map((d) => d.data().hacia)).toEqual(['en_revision', 'derivado', 'en_proceso', 'resuelto', 'cerrado'])

  // 4. La persona que reportó ve el resultado: historial, puntos y avisos.
  const vecino = await paginaDe(browser, 'vecino4')
  await vecino.goto('/historial')
  await expect(vecino.getByRole('row').filter({ hasText: DESCRIPCION }).getByText('Cerrado')).toBeVisible({ timeout: 20_000 })
  await vecino.goto('/mi-nivel')
  await expect(vecino.getByText('10 puntos de confianza')).toBeVisible()
  await vecino.goto('/mapa')
  await vecino.getByRole('button', { name: /^Avisos/ }).click()
  const avisos = vecino.getByRole('dialog', { name: 'Avisos' })
  await expect(avisos.getByText('Tu reporte pasó a «Cerrado»')).toBeVisible()
  await expect(avisos.getByText('Tu reporte fue verificado como real (+10 puntos)')).toBeVisible()
  await expect(avisos.getByText('Tu reporte fue validado por la comunidad')).toBeVisible()
})
