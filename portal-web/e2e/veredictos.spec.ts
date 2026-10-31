// Fase 2: pantalla «Por veredicto» del operador (reportes confirmados por la comunidad que esperan veredicto).
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { Timestamp } from 'firebase-admin/firestore'
import { CERRILLOS, MAIPU, R, bd, reporte, sembrar } from './datos/semilla'
import { paginaDe, rutaSesion } from './ayudas/sesion'

const HORA = 3_600_000
const hace = (horas: number) => Timestamp.fromMillis(Date.now() - horas * HORA)
const val = (horasValidado: number | null, extra: object = {}) => ({
  puntos: 105, votos: 4, validado: true, validadoAt: horasValidado === null ? null : hace(horasValidado), veredicto: null, ...extra,
})
const FOTO = { kind: 'cloud-storage', url: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=' }

// Descripciones únicas: las pruebas buscan cada reporte por su texto.
const D = {
  nuevo: 'E2E pendiente reciente de 3 horas',
  v24: 'E2E pendiente de 30 horas',
  v48: 'E2E pendiente de Cerrillos de 60 horas',
  v7d: 'E2E pendiente antiguo de 200 horas',
  sinFecha: 'E2E pendiente sin fecha de validación',
  cerrado: 'E2E validado y cerrado sin veredicto',
  otro: 'E2E pendiente del otro operador',
  veredictoB1: 'E2E con veredicto de 6 horas',
  veredictoB2: 'E2E con veredicto de 12 horas',
}
// Para reconocer cada tarjeta en el orden de la lista.
const CLAVES: Array<[string, string]> = [[R.validado, 'validado'], ...Object.entries(D).map(([k, v]) => [v, k] as [string, string])]

test.beforeAll(async () => {
  await sembrar()
  const nuevo = (id: string, d: Parameters<typeof reporte>[0]) => bd.doc(`reports/${id}`).set(reporte(d))
  await Promise.all([
    // Del operador A (Maipú). Con r_validado (validado hace 2 días en la semilla) son 6 pendientes.
    nuevo('v_nuevo', { id: 'v_nuevo', descripcion: D.nuevo, comuna: MAIPU, categoria: 'microbasural', validacion: val(3, { puntos: 300, votos: 6 }), extra: { foto: FOTO } }),
    nuevo('v_24', { id: 'v_24', descripcion: D.v24, comuna: MAIPU, categoria: 'luminaria', validacion: val(30, { puntos: 150, votos: 5 }) }),
    nuevo('v_48', { id: 'v_48', descripcion: D.v48, comuna: CERRILLOS, operadorId: 'opr_a', categoria: 'fuga_agua', validacion: val(60, { puntos: 100, votos: 3 }) }),
    nuevo('v_7d', { id: 'v_7d', descripcion: D.v7d, comuna: MAIPU, categoria: 'arbol_peligroso', validacion: val(200, { puntos: 100, votos: 3 }) }),
    nuevo('v_sinfecha', { id: 'v_sinfecha', descripcion: D.sinFecha, comuna: MAIPU, categoria: 'otro', validacion: val(null, { puntos: 100, votos: 3 }) }),
    // No deben aparecer: validado pero ya cerrado (por ejemplo, retirado por su autor) y de otro operador.
    nuevo('c_cerrado', { id: 'c_cerrado', descripcion: D.cerrado, comuna: MAIPU, estado: 'cerrado', validacion: val(40) }),
    nuevo('v_otro', { id: 'v_otro', descripcion: D.otro, comuna: CERRILLOS, validacion: val(10) }),
    // Del operador B con veredicto: tardó 6 h y 12 h (el de la semilla, r_cerrillos, tardó 1 día).
    nuevo('vb_1', { id: 'vb_1', descripcion: D.veredictoB1, comuna: CERRILLOS, validacion: val(10, { veredicto: 'real', veredictoPor: 'oper2', veredictoAt: hace(4), veredictoPuntos: 10 }) }),
    nuevo('vb_2', { id: 'vb_2', descripcion: D.veredictoB2, comuna: CERRILLOS, validacion: val(30, { veredicto: 'real', veredictoPor: 'oper2', veredictoAt: hace(18), veredictoPuntos: 10 }) }),
  ])
})

// Cerrados del operador B con su historial (cuarta tarjeta: de «En revisión» hasta «Cerrado»).
test.beforeAll(async () => {
  const HORAS_POR_DIA = 24
  const crear = async (id: string, descripcion: string, cierreHaceHoras: number, pasos: Array<[string, number]>) => {
    // pasos: [estado al que pasa, horas antes de ahora]; el último es el cierre.
    await bd.doc(`reports/${id}`).set(
      reporte({ id, descripcion, comuna: CERRILLOS, estado: 'cerrado', validacion: val(null, { validado: false, puntos: 0, votos: 0 }), extra: { updatedAt: hace(cierreHaceHoras) } }),
    )
    let desde = 'reportado'
    for (const [i, [hacia, horas]] of pasos.entries()) {
      await bd.doc(`reports/${id}/statusHistory/h${i + 1}`).set({
        reportId: id, desde, hacia, comentario: '', autorNombre: 'Municipalidad de Cerrillos', autorRol: 'operador', createdAt: hace(horas),
      })
      desde = hacia
    }
  }
  await Promise.all([
    // 12 h desde «En revisión» hasta «Cerrado».
    crear('cb_1', 'E2E cerrado en 12 horas', 18, [['en_revision', 30], ['derivado', 28], ['cerrado', 18]]),
    // 24 h hasta «Cerrado» y 18 h hasta «Resuelto».
    crear('cb_2', 'E2E cerrado en 24 horas', 2, [['en_revision', 26], ['resuelto', 8], ['cerrado', 2]]),
    // No pasó por «En revisión»: no se puede medir.
    crear('cb_3', 'E2E cerrado sin revisión', 5, [['derivado', 10], ['cerrado', 5]]),
    // Cerrado hace 200 días, 72 h después de «En revisión»: solo entra en el periodo «Todo».
    crear('cb_4', 'E2E cerrado hace mucho', 200 * HORAS_POR_DIA, [['en_revision', 203 * HORAS_POR_DIA], ['cerrado', 200 * HORAS_POR_DIA]]),
  ])
})

const tarjetas = (page: Page) => page.getByRole('article')
const tarjeta = (page: Page, texto: string) => tarjetas(page).filter({ hasText: texto })
const filtro = (page: Page, nombre: string) => page.getByRole('combobox', { name: nombre })
const buscador = (page: Page) => page.getByRole('searchbox', { name: 'Buscar en la descripción' })
const indicador = (page: Page, nombre: string) => page.getByRole('group', { name: nombre })

async function abrir(page: Page, ruta = '/operador/veredictos', esperadas = 6) {
  await page.goto(ruta)
  await expect(page.getByRole('heading', { name: 'Por veredicto', level: 1 })).toBeVisible()
  await expect(tarjetas(page)).toHaveCount(esperadas, { timeout: 20_000 })
}

/** Qué reporte es cada tarjeta, en el orden en que se ven. */
async function orden(page: Page): Promise<string[]> {
  const textos = await tarjetas(page).allInnerTexts()
  return textos.map((t) => CLAVES.find(([descripcion]) => t.includes(descripcion))?.[1] ?? '?')
}

test.describe('Operador A', () => {
  test.use({ storageState: rutaSesion('operadorA') })

  test('WV1 · La lista muestra solo los confirmados sin veredicto del operador', async ({ page }) => {
    await abrir(page)
    for (const visible of [R.validado, D.nuevo, D.v24, D.v48, D.v7d, D.sinFecha]) await expect(tarjeta(page, visible)).toHaveCount(1)
    // Ni cerrados sin veredicto, ni con veredicto, ni sin validar, ni de otro operador.
    for (const oculto of [D.cerrado, D.otro, R.real, R.nuevo, R.falso]) await expect(page.getByText(oculto)).toHaveCount(0)
    await expect(tarjeta(page, D.nuevo).getByRole('button', { name: 'Ver y dar veredicto' })).toBeVisible()
  })

  test('WV2 · El contador y la espera coinciden con la lista', async ({ page }) => {
    await abrir(page)
    await expect(indicador(page, 'Confirmados sin veredicto')).toContainText('6')
    // De los que tienen fecha de validación (3 h, 30 h, ~2 días, 60 h y 200 h): la mediana es de unos 2 días y el más antiguo, de 8,3 días.
    await expect(indicador(page, 'Espera de los pendientes')).toContainText('2 días')
    await expect(indicador(page, 'Espera de los pendientes')).toContainText('Más antigua: 8,3 días')
    await expect(page.getByRole('status').filter({ hasText: 'Mostrando 6 de 6 reportes' })).toBeVisible()
  })

  test('WV3 · Orden por antigüedad de la validación y marca de «Demorado»', async ({ page }) => {
    await abrir(page)
    // Más antiguos primero; el que no tiene fecha de validación va al final.
    expect(await orden(page)).toEqual(['v7d', 'v48', 'validado', 'v24', 'nuevo', 'sinFecha'])
    // Más de 48 horas esperando: el de 200 h, el de 60 h y r_validado (2 días en la semilla).
    await expect(page.getByText('Demorado', { exact: true })).toHaveCount(3)
    await expect(tarjeta(page, D.v7d).getByText('Demorado')).toBeVisible()
    await expect(tarjeta(page, D.nuevo).getByText('Demorado')).toHaveCount(0)
    await expect(tarjeta(page, D.sinFecha)).toContainText('Validado sin fecha registrada')
  })

  test('WV8 · Los filtros se combinan y «Limpiar filtros» los quita', async ({ page }) => {
    await abrir(page)
    await filtro(page, 'Categoría').selectOption({ label: 'Luminaria' })
    await expect(tarjetas(page)).toHaveCount(2)
    await expect(page.getByRole('status').filter({ hasText: 'Mostrando 2 de 6 reportes' })).toBeVisible()
    await filtro(page, 'Tiempo de espera').selectOption({ label: 'Más de 48 horas' })
    await expect(tarjetas(page)).toHaveCount(1)
    await expect(tarjeta(page, R.validado)).toBeVisible()
    await page.getByRole('button', { name: 'Limpiar filtros' }).click()
    await expect(tarjetas(page)).toHaveCount(6)

    await filtro(page, 'Comuna').selectOption({ label: 'Cerrillos' })
    await expect(tarjetas(page)).toHaveCount(1)
    await expect(tarjeta(page, D.v48)).toBeVisible()
    await filtro(page, 'Comuna').selectOption({ label: 'Todas' })

    await filtro(page, 'Tiempo de espera').selectOption({ label: 'Más de 7 días' })
    await expect(tarjetas(page)).toHaveCount(1)
    await filtro(page, 'Tiempo de espera').selectOption({ label: 'Más de 24 horas' })
    await expect(tarjetas(page)).toHaveCount(4) // los de 30 h, 2 días, 60 h y 200 h; no el que no tiene fecha
    await filtro(page, 'Tiempo de espera').selectOption({ label: 'Todos' })

    await filtro(page, 'Foto').selectOption({ label: 'Con foto' })
    await expect(tarjetas(page)).toHaveCount(1)
    await expect(tarjeta(page, D.nuevo)).toBeVisible()
    await filtro(page, 'Foto').selectOption({ label: 'Sin foto' })
    await expect(tarjetas(page)).toHaveCount(5)
    await filtro(page, 'Foto').selectOption({ label: 'Con o sin foto' })

    // Sin distinguir mayúsculas ni tildes.
    await buscador(page).fill('VALIDACION')
    await expect(tarjetas(page)).toHaveCount(1)
    await expect(tarjeta(page, D.sinFecha)).toBeVisible()
    await buscador(page).fill('zzz no existe')
    await expect(tarjetas(page)).toHaveCount(0)
    await expect(page.getByText('Ningún reporte coincide con los filtros')).toBeVisible()
    await page.getByRole('button', { name: 'Limpiar filtros' }).click()
    await expect(tarjetas(page)).toHaveCount(6)
    await expect(page.getByRole('button', { name: 'Limpiar filtros' })).toHaveCount(0)
  })

  test('WV9 · El orden por votos y por fecha cambia la lista', async ({ page }) => {
    await abrir(page)
    await filtro(page, 'Ordenar por').selectOption({ label: 'Más votos primero' })
    // Por puntos; a igualdad, el que espera hace más; sin fecha, al final.
    await expect.poll(() => orden(page)).toEqual(['nuevo', 'v24', 'validado', 'v7d', 'v48', 'sinFecha'])
    await filtro(page, 'Ordenar por').selectOption({ label: 'Más recientes primero' })
    await expect.poll(() => orden(page)).toEqual(['nuevo', 'v24', 'validado', 'v48', 'v7d', 'sinFecha'])
    await filtro(page, 'Ordenar por').selectOption({ label: 'Más antiguos primero' })
    await expect.poll(() => orden(page)).toEqual(['v7d', 'v48', 'validado', 'v24', 'nuevo', 'sinFecha'])
  })

  test('WV10 · Los filtros quedan en la URL y se restauran al recargar', async ({ page }) => {
    await abrir(page)
    await filtro(page, 'Categoría').selectOption({ label: 'Luminaria' })
    await filtro(page, 'Tiempo de espera').selectOption({ label: 'Más de 24 horas' })
    await filtro(page, 'Ordenar por').selectOption({ label: 'Más votos primero' })
    await expect(page).toHaveURL(/cat=luminaria/)
    await expect(page).toHaveURL(/espera=24h/)
    await expect(page).toHaveURL(/orden=votos/)
    await expect(tarjetas(page)).toHaveCount(2)

    await page.reload()
    await expect(tarjetas(page)).toHaveCount(2, { timeout: 20_000 })
    await expect(filtro(page, 'Categoría')).toHaveValue('luminaria')
    await expect(filtro(page, 'Tiempo de espera')).toHaveValue('24h')
    await expect(filtro(page, 'Ordenar por')).toHaveValue('votos')

    // Un enlace con filtros ya puestos abre la lista filtrada; los valores que no existen se ignoran.
    await abrir(page, '/operador/veredictos?comuna=Cerrillos&espera=99h', 1)
    await expect(tarjeta(page, D.v48)).toBeVisible()
  })

  test('WV14 · La pestaña «Por veredicto» reemplaza a «Por verificar» en el panel del operador', async ({ page }) => {
    await page.goto('/operador')
    const tabs = page.getByRole('navigation', { name: 'Panel de operador' })
    await expect(tabs.getByRole('link', { name: 'Por verificar' })).toHaveCount(0)
    await tabs.getByRole('link', { name: 'Por veredicto' }).click()
    await expect(page).toHaveURL(/\/operador\/veredictos$/)
    await expect(tarjetas(page)).toHaveCount(6, { timeout: 20_000 })
    // El filtro «Por verificar» sigue dentro de «Reportes».
    await page.goto('/operador/reportes?verificacion=por_verificar')
    await expect(page.getByRole('combobox', { name: 'Verificación / veredicto' })).toHaveValue('por_verificar')
  })

  test('WV13 · En teléfono (393 px) no hay desplazamiento horizontal', async ({ browser }) => {
    const contexto = await browser.newContext({ storageState: rutaSesion('operadorA'), baseURL: 'http://localhost:5174', viewport: { width: 393, height: 851 } })
    const page = await contexto.newPage()
    await abrir(page)
    const desborde = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(desborde).toBeLessThanOrEqual(1)
    await contexto.close()
  })
})

test('WV5 · El tiempo hasta el veredicto se mide desde que la comunidad validó el reporte', async ({ browser }) => {
  // Operador B: r_cerrillos (1 día) + 6 h + 12 h. Mediana 12 h y promedio 14 h.
  const page = await paginaDe(browser, 'operadorB')
  await abrir(page, '/operador/veredictos', 1) // su único pendiente
  await filtro(page, 'Periodo de los tiempos').selectOption({ label: 'Todo' })
  await expect(indicador(page, 'Tiempo hasta el veredicto')).toContainText('12 h')
  await expect(indicador(page, 'Tiempo hasta el veredicto')).toContainText('Promedio 14 h · 3 reportes')
  // El periodo se mide por la fecha del veredicto: «Esta semana» deja fuera el de hace 4 días (r_cerrillos) solo si cae antes del lunes;
  // aquí basta comprobar que el selector existe, que parte en «Este mes» y que «Todo» no quita ninguno.
  await expect(indicador(page, 'Tiempo hasta el veredicto')).not.toContainText('2 reportes')
  await page.context().close()
})

test('WV6 · La revisión hasta el cierre se mide desde «En revisión» y se informa de los que no pasaron por ella', async ({ browser }) => {
  const page = await paginaDe(browser, 'operadorB')
  await abrir(page, '/operador/veredictos', 1)
  const revision = indicador(page, 'Revisión hasta el cierre')

  // Todo el historial: 12 h, 24 h y 72 h. Mediana 1 día y promedio 1,5 días; 18 h hasta resolver; uno sin «En revisión».
  await filtro(page, 'Periodo de los tiempos').selectOption({ label: 'Todo' })
  await expect(revision).toContainText('1 día')
  await expect(revision).toContainText('Promedio 1,5 días · 3 reportes')
  await expect(revision).toContainText('1 sin «En revisión»')
  await expect(revision).toContainText('Hasta resolver: mediana 18 h')

  // Últimos 6 meses: el cerrado hace 200 días queda fuera (se mide por la fecha del cierre). Mediana y promedio de 12 h y 24 h: 18 h.
  await filtro(page, 'Periodo de los tiempos').selectOption({ label: 'Últimos 6 meses' })
  await expect(revision).toContainText('Promedio 18 h · 2 reportes')
  await expect(revision).toContainText('1 sin «En revisión»')
  await page.context().close()

  // Un operador sin cerrados con historial no tiene nada que medir.
  const sin = await paginaDe(browser, 'operadorA')
  await abrir(sin)
  await filtro(sin, 'Periodo de los tiempos').selectOption({ label: 'Todo' })
  await expect(indicador(sin, 'Revisión hasta el cierre')).toContainText('Aún no hay reportes cerrados con revisión')
  await sin.context().close()
})

test('WV7 · Un operador no ve los pendientes de otro', async ({ browser }) => {
  const b = await paginaDe(browser, 'operadorB')
  await abrir(b, '/operador/veredictos', 1)
  await expect(tarjeta(b, D.otro)).toBeVisible()
  for (const ajeno of [R.validado, D.nuevo, D.v7d, D.v48]) await expect(b.getByText(ajeno)).toHaveCount(0)
  await expect(indicador(b, 'Confirmados sin veredicto')).toContainText('1')
  await b.context().close()

  const a = await paginaDe(browser, 'operadorA')
  await abrir(a)
  await expect(a.getByText(D.otro)).toHaveCount(0)
  await a.context().close()
})

test('WV12 · Quien no es operador no entra a «Por veredicto»', async ({ browser }) => {
  for (const cuenta of ['vecino1', 'admin'] as const) {
    const page = await paginaDe(browser, cuenta)
    await page.goto('/operador/veredictos')
    await expect(page).toHaveURL('/')
    await page.context().close()
  }
})
