// Fase 8: corregir o retirar el reporte propio (src/components/Reportes/miReporte.ts) contra las reglas
// reales, y que un reporte retirado no cuente en los tiempos del organismo.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { assertFails } from '@firebase/rules-unit-testing'
import type { RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { collection, doc, getDoc, getDocs, setDoc, updateDoc } from 'firebase/firestore'
import { CIUDADANO, VOTANTE, crearEntorno, hace, reporteNuevo, sembrarBase } from './entorno'
import { MiReporteError, corregirReporte, retirarReporte } from '../src/components/Reportes/miReporte'
import { calcularTiempos } from '../src/components/Reportes/tiempos'
import { revisionACierreDelPeriodo } from '../src/pages/Operador/veredictos'
import { VALIDACION_VACIA } from '../src/confianza/tipos'
import type { Reporte } from '../src/components/Reportes/reporte'
import type { CambioEstado } from '../src/components/Reportes/historial'

let env: RulesTestEnvironment

beforeAll(async () => {
  env = await crearEntorno()
})
afterAll(async () => {
  await env.cleanup()
})

const bd = (uid: string) => env.authenticatedContext(uid, { email: `${uid}@x.cl`, email_verified: true }).firestore()
const MIO = { id: 'mio', uid: CIUDADANO }

/** Un reporte propio en «Reportado» (con `extra` para cambiarlo) y uno de otra persona. */
async function sembrar(extra: object = {}) {
  await env.clearFirestore()
  await sembrarBase(env, async (db) => {
    await setDoc(doc(db, 'reports', 'mio'), reporteNuevo(CIUDADANO, () => hace(2 * 3_600_000), { autorNombre: 'Nombre ciud1', ...extra }))
    await setDoc(doc(db, 'reports', 'ajeno'), reporteNuevo(VOTANTE, () => hace(2 * 3_600_000), { autorNombre: 'Nombre ciud2' }))
  })
}

async function leer(id = 'mio') {
  return (await getDoc(doc(bd(CIUDADANO), 'reports', id))).data()
}
async function historial(id = 'mio') {
  const snap = await getDocs(collection(bd(CIUDADANO), 'reports', id, 'statusHistory'))
  return snap.docs.map((d) => d.data())
}
const codigoDe = async (promesa: Promise<unknown>) => {
  try {
    await promesa
  } catch (e) {
    return e instanceof MiReporteError ? e.code : `otro:${String(e)}`
  }
  return 'sin_error'
}

describe('corregirReporte', () => {
  beforeEach(() => sembrar())

  it('cambia solo la descripción (sin espacios en los extremos) y marca la edición', async () => {
    const antes = await leer()
    await corregirReporte(bd(CIUDADANO) as never, MIO, CIUDADANO, '  Hay un hoyo grande frente al número 120  ')
    const despues = await leer()
    expect(despues?.descripcion).toBe('Hay un hoyo grande frente al número 120')
    expect(despues?.estado).toBe('reportado')
    expect(despues?.editadoAt).toBeTruthy()
    expect(despues?.updatedAt.toMillis()).toBeGreaterThan(antes?.updatedAt.toMillis())
    expect(despues?.categoria).toBe(antes?.categoria)
  })

  it('rechaza un texto muy corto o muy largo sin escribir nada', async () => {
    expect(await codigoDe(corregirReporte(bd(CIUDADANO) as never, MIO, CIUDADANO, 'corto'))).toBe('descripcion')
    expect(await codigoDe(corregirReporte(bd(CIUDADANO) as never, MIO, CIUDADANO, 'x'.repeat(501)))).toBe('descripcion')
    expect((await leer())?.descripcion).toBe('Basura acumulada hace una semana')
    expect((await leer())?.editadoAt).toBeUndefined()
  })

  it('si el organismo ya lo pasó a «En revisión» (aunque la pantalla no lo sepa), no se corrige', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), 'reports', 'mio'), { estado: 'en_revision' })
    })
    expect(await codigoDe(corregirReporte(bd(CIUDADANO) as never, MIO, CIUDADANO, 'Un texto nuevo bien largo'))).toBe('ya_revisado')
    expect((await leer())?.descripcion).toBe('Basura acumulada hace una semana')
  })

  it('con confirmaciones con peso ya no se corrige', async () => {
    await sembrar({ validacion: { votos: 2, puntos: 1.5 } })
    expect(await codigoDe(corregirReporte(bd(CIUDADANO) as never, MIO, CIUDADANO, 'Un texto nuevo bien largo'))).toBe('ya_confirmado')
    expect((await leer())?.descripcion).toBe('Basura acumulada hace una semana')
  })

  it('otra persona no puede corregirlo, ni con el servicio ni directo a Firestore', async () => {
    expect(await codigoDe(corregirReporte(bd(VOTANTE) as never, MIO, VOTANTE, 'Un texto nuevo bien largo'))).toBe('no_es_tuyo')
    await assertFails(
      updateDoc(doc(bd(VOTANTE), 'reports', 'mio'), { descripcion: 'Un texto nuevo bien largo', updatedAt: new Date(), editadoAt: new Date() }),
    )
    expect((await leer())?.descripcion).toBe('Basura acumulada hace una semana')
  })
})

describe('retirarReporte', () => {
  beforeEach(() => sembrar())

  it('lo cierra, lo marca como retirado y deja su entrada en el historial firmada «Quien lo reportó»', async () => {
    await retirarReporte(bd(CIUDADANO) as never, MIO, CIUDADANO, '  Lo reporté dos veces  ')
    const r = await leer()
    expect(r).toMatchObject({ estado: 'cerrado', retiradoPorAutor: true, uid: CIUDADANO })
    expect(r?.cerradoSinResolverAt).toBeTruthy()
    const h = await historial()
    expect(h).toHaveLength(1)
    expect(h[0]).toMatchObject({
      desde: 'reportado',
      hacia: 'cerrado',
      autorUid: CIUDADANO,
      autorNombre: 'Quien lo reportó',
      comentario: 'Retirado por quien lo reportó: Lo reporté dos veces',
    })
  })

  it('el motivo es opcional', async () => {
    await retirarReporte(bd(CIUDADANO) as never, MIO, CIUDADANO)
    expect((await historial())[0].comentario).toBe('Retirado por quien lo reportó.')
  })

  it('con confirmaciones con peso todavía se puede retirar', async () => {
    await sembrar({ validacion: { votos: 4, puntos: 3 } })
    await retirarReporte(bd(CIUDADANO) as never, MIO, CIUDADANO)
    expect((await leer())?.estado).toBe('cerrado')
  })

  it('si el organismo ya lo pasó a «En revisión», no se retira y no queda nada en el historial', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), 'reports', 'mio'), { estado: 'en_revision' })
    })
    expect(await codigoDe(retirarReporte(bd(CIUDADANO) as never, MIO, CIUDADANO))).toBe('ya_revisado')
    expect((await leer())?.estado).toBe('en_revision')
    expect(await historial()).toHaveLength(0)
  })

  it('otra persona no puede retirarlo', async () => {
    expect(await codigoDe(retirarReporte(bd(VOTANTE) as never, MIO, VOTANTE))).toBe('no_es_tuyo')
    expect((await leer())?.estado).toBe('reportado')
    expect(await historial()).toHaveLength(0)
  })
})

describe('un reporte retirado no cuenta en los tiempos del organismo', () => {
  const creado = new Date('2026-10-01T10:00:00Z')
  const cambio = (hacia: string, iso: string): CambioEstado =>
    ({ id: hacia, desde: '', hacia, comentario: '', fecha: new Date(iso), autorNombre: null, autorRol: null })
  const reporte = (extra: Partial<Reporte> = {}): Reporte =>
    ({
      id: 'r1', uid: 'u', categoria: 'otro', descripcion: '', estado: 'cerrado', comuna: '', region: '', autorNombre: null,
      fecha: creado, foto: null, operadorId: null, organismoId: null, organismoNombre: null, lat: null, lng: null, origen: null,
      validacion: VALIDACION_VACIA, ...extra,
    }) as Reporte
  const retiro = cambio('cerrado', '2026-10-01T11:00:00Z')

  it('sin primera atención ni resolución', () => {
    expect(calcularTiempos(reporte({ retiradoPorAutor: true }), [retiro])).toEqual({ primeraAtencionMs: null, resolucionMs: null })
  })

  it('uno cerrado por el organismo sí cuenta', () => {
    expect(calcularTiempos(reporte(), [retiro])).toEqual({ primeraAtencionMs: 3_600_000, resolucionMs: 3_600_000 })
  })

  it('no entra en «de En revisión a cierre» ni infla los que no pasaron por «En revisión»', () => {
    const retirado = reporte({ id: 'ret', retiradoPorAutor: true })
    const sinRevision = reporte({ id: 'sin' })
    const historiales = new Map<string, readonly CambioEstado[]>([
      ['ret', [retiro]],
      ['sin', [retiro]],
    ])
    const r = revisionACierreDelPeriodo(historiales, [retirado, sinRevision], { inicio: null, fin: null })
    expect(r.enPeriodo).toBe(1)
    expect(r.sinRevision).toBe(1)
  })
})
