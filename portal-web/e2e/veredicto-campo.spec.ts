// DEF-010: la app móvil nunca escribe `validacion.veredicto` (ni al crear el reporte ni al confirmarlo), así que los
// reportes validados por la comunidad no traen ese campo. «Por veredicto» debe mostrarlos igual que a los que lo traen en null.
import { expect, test } from '@playwright/test'
import { Timestamp } from 'firebase-admin/firestore'
import { MAIPU, R, bd, reporte, sembrar } from './datos/semilla'
import { rutaSesion } from './ayudas/sesion'

const HORA = 3_600_000
const hace = (horas: number) => Timestamp.fromMillis(Date.now() - horas * HORA)

const D = {
  deLaApp: 'E2E validado desde la app, sin el campo veredicto',
  conNulo: 'E2E validado con veredicto nulo',
}

test.beforeAll(async () => {
  await sembrar()
  await Promise.all([
    // Como los deja la app: puntos, votos, validado y validadoAt; sin `veredicto`.
    bd.doc('reports/app_1').set(reporte({ id: 'app_1', descripcion: D.deLaApp, comuna: MAIPU, validacion: { puntos: 105, votos: 4, validado: true, validadoAt: hace(5) } })),
    // Como los deja el portal al crear un reporte: con `veredicto: null`.
    bd.doc('reports/app_2').set(reporte({ id: 'app_2', descripcion: D.conNulo, comuna: MAIPU, validacion: { puntos: 105, votos: 4, validado: true, validadoAt: hace(2), veredicto: null } })),
  ])
})

test.use({ storageState: rutaSesion('operadorA') })

test('WV16 · «Por veredicto» muestra los validados por la app, que no traen el campo veredicto', async ({ page }) => {
  await page.goto('/operador/veredictos')
  await expect(page.getByRole('heading', { name: 'Por veredicto', level: 1 })).toBeVisible()
  // r_validado (de la semilla, con veredicto nulo) + el de la app + el del portal.
  await expect(page.getByRole('article')).toHaveCount(3, { timeout: 20_000 })
  await expect(page.getByRole('article').filter({ hasText: D.deLaApp })).toHaveCount(1)
  await expect(page.getByRole('article').filter({ hasText: D.conNulo })).toHaveCount(1)
  await expect(page.getByRole('article').filter({ hasText: R.validado })).toHaveCount(1)
  await expect(page.getByRole('group', { name: 'Confirmados sin veredicto' })).toContainText('3')
})
