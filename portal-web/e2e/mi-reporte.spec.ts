// Fase 8: corregir o retirar un reporte propio desde «Historial» (historia J3). Cada prueba crea su propio
// reporte, porque corregir y retirar cambian el reporte para siempre.
import { expect, test } from '@playwright/test'
import { MAIPU, bd, reporte, sembrar } from './datos/semilla'
import { Timestamp } from 'firebase-admin/firestore'
import { paginaDe } from './ayudas/sesion'
import type { Browser, Page } from '@playwright/test'
import type { Cuenta } from './ayudas/sesion'

test.beforeAll(async () => {
  await sembrar()
})

// Cada página abre su propio contexto de navegador: se cierran al terminar cada prueba, porque si quedan abiertos
// (con sus escuchas de Firestore) la prueba siguiente de otro archivo falla al cerrar su traza (WX2).
const abiertas: Page[] = []
async function pagina(browser: Browser, cuenta: Cuenta): Promise<Page> {
  const p = await paginaDe(browser, cuenta)
  abiertas.push(p)
  return p
}
test.afterEach(async () => {
  for (const p of abiertas.splice(0)) await p.context().close().catch(() => undefined)
})

const DETALLE = '[aria-labelledby="detalle-reporte-titulo"]'

/** Un reporte de la vecina 1 (vec1) listo para abrir; `extra` cambia lo que haga falta. */
async function crear(id: string, extra: Record<string, unknown> = {}) {
  const descripcion = `E2E mi reporte ${id} con un bache grande`
  await bd.doc(`reports/${id}`).set({ ...reporte({ id, descripcion, comuna: MAIPU, uid: 'vec1' }), ...extra })
  return descripcion
}

async function abrir(page: Page, descripcion: string) {
  await page.goto('/historial')
  await page.getByRole('row').filter({ hasText: descripcion }).getByRole('button', { name: 'Ver detalle' }).click()
  const detalle = page.locator(DETALLE)
  await expect(detalle).toBeVisible()
  return detalle
}

test('WL11 · El autor corrige la descripción de su reporte en «Reportado» y queda marcado como editado', async ({ browser }) => {
  const original = await crear('mr1')
  const page = await pagina(browser, 'vecino1')
  const detalle = await abrir(page, original)
  await expect(detalle.getByRole('heading', { name: 'Tu reporte' })).toBeVisible()
  await expect(detalle.getByText(/Editado/)).toHaveCount(0)

  await detalle.getByRole('button', { name: 'Corregir descripción' }).click()
  const campo = detalle.getByLabel('Descripción')
  await expect(campo).toHaveValue(original)

  // Un texto demasiado corto no se guarda.
  await campo.fill('corto')
  await detalle.getByRole('button', { name: 'Guardar cambios' }).click()
  await expect(detalle.getByText('Usa entre 10 y 500 caracteres.')).toBeVisible()
  expect((await bd.doc('reports/mr1').get()).data()?.descripcion).toBe(original)

  // Uno válido sí: se ve de inmediato y se guarda con la marca de edición.
  const nuevo = 'E2E mr1 corregido: el bache está frente al número 340'
  await campo.fill(`  ${nuevo}  `)
  await detalle.getByRole('button', { name: 'Guardar cambios' }).click()
  await expect(detalle.getByText(nuevo)).toBeVisible()
  await expect(detalle.getByText(/Editado/)).toBeVisible()
  await expect(detalle.getByLabel('Descripción')).toHaveCount(0)
  const guardado = (await bd.doc('reports/mr1').get()).data()
  expect(guardado).toMatchObject({ descripcion: nuevo, estado: 'reportado' })
  expect(guardado?.editadoAt).toBeTruthy()
})

test('WL12 · El autor retira su reporte con un motivo: queda cerrado, firmado «Quien lo reportó» y sin más acciones', async ({ browser }) => {
  const descripcion = await crear('mr2')
  const page = await pagina(browser, 'vecino1')
  const detalle = await abrir(page, descripcion)

  await detalle.getByRole('button', { name: 'Retirar reporte' }).click()
  const dialogo = page.getByRole('dialog', { name: 'Retirar mi reporte' })
  await expect(dialogo).toBeVisible()
  // Cancelar no cambia nada.
  await dialogo.getByRole('button', { name: 'Cancelar' }).click()
  await expect(dialogo).toHaveCount(0)
  expect((await bd.doc('reports/mr2').get()).data()?.estado).toBe('reportado')

  await detalle.getByRole('button', { name: 'Retirar reporte' }).click()
  await dialogo.getByLabel('Motivo (opcional)').fill('Lo reporté dos veces por error')
  await dialogo.getByRole('button', { name: 'Sí, retirar' }).click()
  await expect(dialogo).toHaveCount(0)

  await expect(detalle.getByText('Retirado por quien lo reportó el')).toBeVisible()
  await expect(detalle.getByRole('heading', { name: 'Tu reporte' })).toHaveCount(0)
  await expect(detalle.getByRole('button', { name: 'Retirar reporte' })).toHaveCount(0)
  await expect(detalle.getByRole('button', { name: 'Corregir descripción' })).toHaveCount(0)
  // El historial de estados lo muestra con la firma pública, no con el nombre de la persona.
  await expect(detalle.getByText('por Quien lo reportó', { exact: true })).toBeVisible()
  await expect(detalle.getByText('“Retirado por quien lo reportó: Lo reporté dos veces por error”')).toBeVisible()
  await expect(detalle.getByText('Vecina Uno', { exact: true })).toHaveCount(1) // solo en «Autor»

  const r = (await bd.doc('reports/mr2').get()).data()
  expect(r).toMatchObject({ estado: 'cerrado', retiradoPorAutor: true })
  const h = await bd.collection('reports/mr2/statusHistory').get()
  expect(h.docs.map((d) => d.data())).toEqual([
    expect.objectContaining({ desde: 'reportado', hacia: 'cerrado', autorNombre: 'Quien lo reportó', autorUid: 'vec1' }),
  ])
})

test.describe('WL13 · Cuando el organismo ya lo revisa, no se corrige ni se retira', () => {
  test('un reporte «En revisión» no ofrece las acciones', async ({ browser }) => {
    const descripcion = await crear('mr3', { estado: 'en_revision' })
    const page = await pagina(browser, 'vecino1')
    const detalle = await abrir(page, descripcion)
    await expect(detalle.getByText('En revisión').first()).toBeVisible()
    await expect(detalle.getByRole('heading', { name: 'Tu reporte' })).toHaveCount(0)
    await expect(detalle.getByRole('button', { name: 'Retirar reporte' })).toHaveCount(0)
    await expect(detalle.getByRole('button', { name: 'Corregir descripción' })).toHaveCount(0)
  })

  test('si pasa a «En revisión» con el diálogo abierto, el diálogo se cierra, se avisa y no se retira nada', async ({ browser }) => {
    const descripcion = await crear('mr4')
    const page = await pagina(browser, 'vecino1')
    const detalle = await abrir(page, descripcion)
    await detalle.getByRole('button', { name: 'Retirar reporte' }).click()
    const dialogo = page.getByRole('dialog', { name: 'Retirar mi reporte' })
    await expect(dialogo).toBeVisible()
    // Mientras tanto, el organismo lo empieza a revisar.
    await bd.doc('reports/mr4').update({ estado: 'en_revision', updatedAt: Timestamp.now() })
    await expect(page.getByRole('alert').filter({ hasText: 'El organismo ya empezó a revisar este reporte' })).toBeVisible()
    await expect(dialogo).toHaveCount(0)
    await expect(detalle.getByRole('heading', { name: 'Tu reporte' })).toHaveCount(0)
    const r = (await bd.doc('reports/mr4').get()).data()
    expect(r).toMatchObject({ estado: 'en_revision' })
    expect(r?.retiradoPorAutor).toBeUndefined()
    expect((await bd.collection('reports/mr4/statusHistory').get()).size).toBe(0)
  })
})

test('WL14 · Con confirmaciones de vecinos se puede retirar pero ya no corregir la descripción', async ({ browser }) => {
  const descripcion = await crear('mr5', {
    validacion: { puntos: 3, votos: 2, validado: false, validadoAt: null, veredicto: null },
  })
  const page = await pagina(browser, 'vecino1')
  const detalle = await abrir(page, descripcion)
  await expect(detalle.getByRole('heading', { name: 'Tu reporte' })).toBeVisible()
  await expect(detalle.getByRole('button', { name: 'Corregir descripción' })).toHaveCount(0)
  await expect(detalle.getByText(/Ya hay vecinos que confirmaron este reporte/)).toBeVisible()
  await expect(detalle.getByRole('button', { name: 'Retirar reporte' })).toBeVisible()
})

test.describe('WL15 · Solo quien lo reportó ve las acciones, y los retirados se distinguen', () => {
  test('el administrador ve un reporte retirado como tal y no las acciones del autor', async ({ browser }) => {
    const descripcion = await crear('mr6')
    await bd.doc('reports/mr6').update({ estado: 'cerrado', retiradoPorAutor: true, cerradoSinResolverAt: Timestamp.now() })
    const page = await pagina(browser, 'admin')
    await page.goto('/admin/reportes?reporte=mr6')
    const detalle = page.locator(DETALLE)
    await expect(detalle.getByText(descripcion)).toBeVisible()
    await expect(detalle.getByText('Retirado por quien lo reportó el')).toBeVisible()
    await expect(detalle.getByRole('heading', { name: 'Tu reporte' })).toHaveCount(0)
  })

  test('el administrador ve un reporte propio de otra persona sin las acciones', async ({ browser }) => {
    const descripcion = await crear('mr7')
    const page = await pagina(browser, 'admin')
    await page.goto('/admin/reportes?reporte=mr7')
    const detalle = page.locator(DETALLE)
    await expect(detalle.getByText(descripcion)).toBeVisible()
    await expect(detalle.getByRole('button', { name: 'Retirar reporte' })).toHaveCount(0)
    await expect(detalle.getByRole('button', { name: 'Corregir descripción' })).toHaveCount(0)
  })

  test('otra vecina no tiene el reporte en su historial', async ({ browser }) => {
    const descripcion = await crear('mr8')
    const page = await pagina(browser, 'vecino2')
    await page.goto('/historial')
    await expect(page.getByRole('heading', { name: 'Mi historial de reportes' })).toBeVisible()
    await expect(page.locator('tbody tr').first()).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText(descripcion)).toHaveCount(0)
  })
})

test('WL16 · El detalle con las acciones, el editor y el diálogo no se desplazan en horizontal en un teléfono (393 px)', async ({ browser }) => {
  const descripcion = await crear('mr9')
  const contexto = await browser.newContext({
    storageState: 'e2e/.sesiones/vecino1.json',
    baseURL: 'http://localhost:5174',
    viewport: { width: 393, height: 800 },
  })
  const page = await contexto.newPage()
  const desborde = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  const detalle = await abrir(page, descripcion)
  await expect(detalle.getByRole('heading', { name: 'Tu reporte' })).toBeVisible()
  const cabe = async (locator: ReturnType<Page['locator']>, que: string) => {
    const caja = (await locator.boundingBox())!
    expect(caja.x, `${que} no se sale por la izquierda`).toBeGreaterThanOrEqual(0)
    expect(caja.x + caja.width, `${que} no se sale por la derecha`).toBeLessThanOrEqual(393)
  }
  expect(await desborde(), 'detalle con las acciones').toBeLessThanOrEqual(1)
  await cabe(detalle.getByRole('heading', { name: 'Tu reporte' }), 'la tarjeta')

  await detalle.getByRole('button', { name: 'Corregir descripción' }).click()
  await cabe(detalle.getByLabel('Descripción'), 'el editor')
  await cabe(detalle.getByRole('button', { name: 'Guardar cambios' }), 'Guardar cambios')
  expect(await desborde(), 'editor abierto').toBeLessThanOrEqual(1)
  await detalle.getByRole('button', { name: 'Cancelar' }).click()

  await detalle.getByRole('button', { name: 'Retirar reporte' }).click()
  const dialogo = page.getByRole('dialog', { name: 'Retirar mi reporte' })
  await expect(dialogo).toBeVisible()
  await cabe(dialogo, 'el diálogo')
  expect(await desborde(), 'diálogo abierto').toBeLessThanOrEqual(1)
  await contexto.close()
})
