// Fase 1 de «Por veredicto»: las consultas de src/pages/Operador/useReportesPorVeredicto.ts contra las
// reglas de Firestore en el emulador. Un operador lee los reportes pendientes y con veredicto de su
// operador (y solo esos), y una cuenta de organismo no puede ejecutarlas.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { assertFails } from '@firebase/rules-unit-testing'
import type { RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { doc, getDocs, setDoc } from 'firebase/firestore'
import { CIUDADANO, DIA, OPERADOR, crearEntorno, hace, reporteNuevo, sembrarBase } from './entorno'
import {
  consultaPendientes,
  consultasConVeredicto,
} from '../src/pages/Operador/useReportesPorVeredicto'
import { mapearReporte } from '../src/components/Reportes/reporte'
import { esPendienteDeVeredicto } from '../src/pages/Operador/veredictos'

let env: RulesTestEnvironment
beforeAll(async () => {
  env = await crearEntorno()
  await env.clearFirestore()
  const val = (extra: object = {}) => ({ puntos: 105, votos: 4, validado: true, validadoAt: hace(2 * DIA), veredicto: null, ...extra })
  await sembrarBase(env, async (db) => {
    const reporte = (id: string, operadorId: string, extra: object) =>
      setDoc(doc(db, 'reports', id), { ...reporteNuevo(CIUDADANO, () => new Date(), { operadorId, ...extra }) })
    // Del operador opr1
    await reporte('p1', 'opr1', { validacion: val() })
    await reporte('p2', 'opr1', { estado: 'en_proceso', validacion: val() })
    await reporte('c1', 'opr1', { estado: 'cerrado', validacion: val() }) // validado y retirado/cerrado sin veredicto
    await reporte('v1', 'opr1', { validacion: val({ veredicto: 'real', veredictoAt: hace(DIA) }) })
    await reporte('v2', 'opr1', { validacion: val({ veredicto: 'falso', veredictoAt: hace(DIA) }) })
    await reporte('n1', 'opr1', { validacion: { puntos: 0, votos: 0, validado: false, validadoAt: null, veredicto: null } })
    // De otro operador
    await reporte('q1', 'opr2', { validacion: val() })
    await reporte('w1', 'opr2', { validacion: val({ veredicto: 'real', veredictoAt: hace(DIA) }) })
    // Otra cuenta de operador y una cuenta de organismo
    await setDoc(doc(db, 'operadores', 'opr2'), { organismoId: 'org2', activo: true, nombre: 'Op 2' })
    await setDoc(doc(db, 'users', 'oper2'), {
      uid: 'oper2', email: 'o2@x.cl', displayName: 'Op2', role: 'operador', operadorId: 'opr2',
      trustLevel: 0, validatedReports: 0, createdAt: hace(DIA), updatedAt: hace(DIA),
    })
    await setDoc(doc(db, 'users', 'org1'), {
      uid: 'org1', email: 'org@x.cl', displayName: 'Organismo', role: 'organismo', organismoId: 'org1',
      trustLevel: 0, validatedReports: 0, createdAt: hace(DIA), updatedAt: hace(DIA),
    })
  })
})
afterAll(async () => {
  await env.cleanup()
})

const bd = (uid: string) => env.authenticatedContext(uid, { email: `${uid}@x.cl`, email_verified: true }).firestore()
const ids = (snap: Awaited<ReturnType<typeof getDocs>>) => snap.docs.map((d) => d.id).sort()

describe('consulta de pendientes de veredicto', () => {
  it('el operador recibe solo los validados sin veredicto de su operador', async () => {
    const snap = await getDocs(consultaPendientes(bd(OPERADOR) as never, 'opr1'))
    // c1 llega porque la consulta no filtra por estado; la lista final lo descarta.
    expect(ids(snap)).toEqual(['c1', 'p1', 'p2'])
    const pendientes = snap.docs.map((d) => mapearReporte(d as never)).filter(esPendienteDeVeredicto)
    expect(pendientes.map((r) => r.id).sort()).toEqual(['p1', 'p2'])
  })

  it('otro operador recibe solo los suyos', async () => {
    const snap = await getDocs(consultaPendientes(bd('oper2') as never, 'opr2'))
    expect(ids(snap)).toEqual(['q1'])
  })

  it('un administrador también puede ejecutarla', async () => {
    const snap = await getDocs(consultaPendientes(bd('admin1') as never, 'opr1'))
    expect(ids(snap)).toEqual(['c1', 'p1', 'p2'])
  })

  it('una cuenta de organismo no puede ejecutarla (las reglas solo le dejan ver lo validado de su organismo)', async () => {
    await assertFails(getDocs(consultaPendientes(bd('org1') as never, 'opr1')))
  })
})

describe('consultas de reportes con veredicto', () => {
  it('juntas devuelven los reportes con veredicto real o falso del operador', async () => {
    const consultas = consultasConVeredicto(bd(OPERADOR) as never, 'opr1')
    expect(consultas).toHaveLength(2)
    const resultados = await Promise.all(consultas.map((c) => getDocs(c)))
    expect(resultados.flatMap(ids).sort()).toEqual(['v1', 'v2'])
  })

  it('no incluyen los de otro operador', async () => {
    const resultados = await Promise.all(consultasConVeredicto(bd('oper2') as never, 'opr2').map((c) => getDocs(c)))
    expect(resultados.flatMap(ids)).toEqual(['w1'])
  })

  it('una cuenta de organismo no puede ejecutarlas', async () => {
    const [primera] = consultasConVeredicto(bd('org1') as never, 'opr1')
    await assertFails(getDocs(primera))
  })
})
