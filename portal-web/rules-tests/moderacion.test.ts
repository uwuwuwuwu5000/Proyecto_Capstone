// Moderación de confirmaciones (src/confianza/moderacion.ts) contra las reglas.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { ADMIN, CIUDADANO, DIA, OPERADOR, VOTANTE, crearEntorno, reporteNuevo, sembrarBase } from './entorno'
import { cambiarSuspension, cargarConfirmantes, leerSuspension } from '../src/confianza/moderacion'
import { ErrorConfirmacion, confirmarReporte } from '../src/confianza/confirmar'

let env: RulesTestEnvironment
beforeAll(async () => {
  env = await crearEntorno()
})
afterAll(async () => {
  await env.cleanup()
})

const VALIDACION_CERO = { puntos: 0, votos: 0, validado: false, validadoAt: null, veredicto: null }

async function sembrar(confianzaVotante?: object) {
  await env.clearFirestore()
  await sembrarBase(env, async (db) => {
    await setDoc(doc(db, 'reports', 'r1'), { ...reporteNuevo(CIUDADANO, () => new Date()), validacion: VALIDACION_CERO })
    if (confianzaVotante) await setDoc(doc(db, 'users', VOTANTE, 'confianza', 'actual'), confianzaVotante)
  })
}

const bd = (uid: string) => env.authenticatedContext(uid, { email: `${uid}@x.cl`, email_verified: true }).firestore()
const leerConfianza = async () => {
  let d: Record<string, any> | undefined
  await env.withSecurityRulesDisabled(async (ctx) => {
    d = (await getDoc(doc(ctx.firestore(), 'users', VOTANTE, 'confianza', 'actual'))).data()
  })
  return d
}
const confirmar = () =>
  confirmarReporte(bd(VOTANTE), { reportId: 'r1', uid: VOTANTE, correoVerificado: true, creadaEnMs: Date.now() - 10 * DIA })
const codigo = async (p: Promise<unknown>) => {
  try {
    await p
    return 'ok'
  } catch (e) {
    return e instanceof ErrorConfirmacion ? e.codigo : `otro:${String(e)}`
  }
}

describe('suspender y rehabilitar', () => {
  beforeEach(() => sembrar())

  it('un administrador suspende a un usuario sin documento de confianza, y deja de poder confirmar', async () => {
    await cambiarSuspension(bd(ADMIN), VOTANTE, true)
    expect(await leerSuspension(bd(ADMIN), VOTANTE)).toBe(true)
    expect(await codigo(confirmar())).toBe('suspendido')
  })

  it('al rehabilitarlo, vuelve a poder confirmar', async () => {
    await cambiarSuspension(bd(ADMIN), VOTANTE, true)
    await cambiarSuspension(bd(ADMIN), VOTANTE, false)
    expect(await codigo(confirmar())).toBe('ok')
  })

  it('no toca los puntos, el nivel ni los contadores', async () => {
    await sembrar({ puntosConfianza: 50, trustLevel: 1, validatedReports: 5, reportesFalsos: 1, confirmacionesSuspendidas: false })
    await cambiarSuspension(bd(ADMIN), VOTANTE, true)
    expect(await leerConfianza()).toMatchObject({
      puntosConfianza: 50, trustLevel: 1, validatedReports: 5, reportesFalsos: 1, confirmacionesSuspendidas: true,
    })
  })

  it('funciona aunque el usuario ya haya recibido un veredicto (su documento tiene ultimoReporteId)', async () => {
    await sembrar({
      puntosConfianza: 10, trustLevel: 0, validatedReports: 1, reportesFalsos: 0, confirmacionesSuspendidas: false, ultimoReporteId: 'r1',
    })
    await cambiarSuspension(bd(ADMIN), VOTANTE, true)
    expect(await leerConfianza()).toMatchObject({ confirmacionesSuspendidas: true, ultimoReporteId: 'r1' })
  })

  it('un operador no puede suspender', async () => {
    await expect(cambiarSuspension(bd(OPERADOR), VOTANTE, true)).rejects.toThrow(/administrador/)
  })

  it('un vecino no puede rehabilitarse a sí mismo', async () => {
    await cambiarSuspension(bd(ADMIN), VOTANTE, true)
    await expect(cambiarSuspension(bd(VOTANTE), VOTANTE, false)).rejects.toThrow(/administrador/)
    expect(await leerSuspension(bd(ADMIN), VOTANTE)).toBe(true)
  })

  it('un vecino no puede suspender a otro', async () => {
    await expect(cambiarSuspension(bd(CIUDADANO), VOTANTE, true)).rejects.toThrow(/administrador/)
  })
})

describe('quiénes confirmaron un reporte', () => {
  it('lista a los confirmantes con su nivel, peso y si están suspendidos', async () => {
    await sembrar()
    await confirmar()
    await cambiarSuspension(bd(ADMIN), VOTANTE, true)
    const lista = await cargarConfirmantes(bd(ADMIN), 'r1')
    expect(lista).toHaveLength(1)
    expect(lista[0]).toMatchObject({ uid: VOTANTE, nivel: 0, peso: 10, suspendido: true })
  })

  it('un reporte sin confirmaciones devuelve la lista vacía', async () => {
    await sembrar()
    expect(await cargarConfirmantes(bd(ADMIN), 'r1')).toEqual([])
  })
})

