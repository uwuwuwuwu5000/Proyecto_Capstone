// El código real de confirmar (src/confianza/confirmar.ts) contra las reglas
// de Firestore en el emulador: lo que el portal escribe debe ser aceptado, y
// los casos que el portal detecta antes deben dar el error correcto.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { CIUDADANO, DIA, HORA, OPERADOR, VOTANTE, crearEntorno, hace, reporteNuevo, sembrarBase } from './entorno'
import { ErrorConfirmacion, confirmarReporte } from '../src/confianza/confirmar'
import { numeroDeDia } from '../src/confianza/reglas'

let env: RulesTestEnvironment
beforeAll(async () => {
  env = await crearEntorno()
})
afterAll(async () => {
  await env.cleanup()
})

const VALIDACION_CERO = { puntos: 0, votos: 0, validado: false, validadoAt: null, veredicto: null }
const antiguaMs = () => Date.now() - 10 * DIA
const hoy = () => String(numeroDeDia())

interface Semilla {
  estado?: string
  validacion?: object | null
  confianza?: object
  limite?: { confirmaciones: number; ultimaAt: ReturnType<typeof hace> }
  votantes?: string[]
}

async function sembrar(s: Semilla = {}) {
  await env.clearFirestore()
  await sembrarBase(env, async (db) => {
    await setDoc(doc(db, 'reports', 'r1'), {
      ...reporteNuevo(CIUDADANO, () => new Date(), s.estado ? { estado: s.estado } : {}),
      ...(s.validacion === null ? {} : { validacion: s.validacion ?? VALIDACION_CERO }),
    })
    if (s.confianza) await setDoc(doc(db, 'users', VOTANTE, 'confianza', 'actual'), s.confianza)
    if (s.limite) await setDoc(doc(db, 'users', VOTANTE, 'limites', hoy()), s.limite)
    for (const uid of s.votantes ?? []) {
      await setDoc(doc(db, 'users', uid), {
        uid, email: `${uid}@x.cl`, displayName: uid, role: 'ciudadano', trustLevel: 0, validatedReports: 0,
        emailVerified: true, createdAt: hace(10 * DIA), updatedAt: hace(10 * DIA),
      })
    }
  })
}

const bd = (uid: string, verificado = true) =>
  env.authenticatedContext(uid, { email: `${uid}@x.cl`, email_verified: verificado }).firestore()

const confirmar = (uid = VOTANTE, o: { verificado?: boolean; creadaEnMs?: number | null } = {}) =>
  confirmarReporte(bd(uid, o.verificado ?? true), {
    reportId: 'r1',
    uid,
    correoVerificado: o.verificado ?? true,
    creadaEnMs: o.creadaEnMs === undefined ? antiguaMs() : o.creadaEnMs,
  })

const leer = async (ruta: string[]) => (await getDoc(doc(bd(VOTANTE), ruta[0], ...ruta.slice(1)))).data()
const codigo = async (p: Promise<unknown>) => {
  try {
    await p
    return 'ok'
  } catch (e) {
    return e instanceof ErrorConfirmacion ? e.codigo : `otro:${String(e)}`
  }
}

describe('confirmar con peso', () => {
  it('un voto de nivel 0 suma 10 puntos y crea el contador del día', async () => {
    await sembrar()
    const r = await confirmar()
    expect(r).toMatchObject({ nivel: 0, peso: 10, puntos: 10, votos: 1, validado: false, motivoPesoCero: null })
    expect((await leer(['reports', 'r1']))?.validacion).toMatchObject({ puntos: 10, votos: 1, validado: false })
    expect(await leer(['reports', 'r1', 'confirmations', VOTANTE])).toMatchObject({ nivel: 0, peso: 10 })
    expect(await leer(['users', VOTANTE, 'limites', hoy()])).toMatchObject({ confirmaciones: 1 })
  })

  it('un votante de nivel 4 pesa 20', async () => {
    await sembrar({ confianza: { puntosConfianza: 190, trustLevel: 4 } })
    expect(await confirmar()).toMatchObject({ nivel: 4, peso: 20, puntos: 20 })
  })

  it('con 95 puntos y 3 personas, el voto siguiente deja el reporte validado', async () => {
    await sembrar({ validacion: { ...VALIDACION_CERO, puntos: 95, votos: 3 } })
    const r = await confirmar()
    expect(r).toMatchObject({ puntos: 105, votos: 4, validado: true, recienValidado: true })
    const v = (await leer(['reports', 'r1']))?.validacion
    expect(v.validado).toBe(true)
    expect(v.validadoAt).toBeTruthy()
  })

  it('un reporte antiguo sin el mapa validacion lo recibe con el primer voto', async () => {
    await sembrar({ validacion: null })
    expect(await confirmar()).toMatchObject({ puntos: 10, votos: 1 })
  })

  it('dos votantes a la vez: las sumas no se pisan', async () => {
    await sembrar({ votantes: ['ciud3'] })
    await Promise.all([confirmar(VOTANTE), confirmar('ciud3')])
    expect((await leer(['reports', 'r1']))?.validacion).toMatchObject({ puntos: 20, votos: 2 })
  })
})

describe('voto con peso 0', () => {
  it('correo sin verificar: se registra, no suma y cuenta el día', async () => {
    await sembrar()
    const r = await confirmar(VOTANTE, { verificado: false })
    expect(r).toMatchObject({ peso: 0, motivoPesoCero: 'correo', puntos: 0, votos: 0 })
    expect((await leer(['reports', 'r1']))?.validacion).toMatchObject({ puntos: 0, votos: 0 })
    expect(await leer(['reports', 'r1', 'confirmations', VOTANTE])).toMatchObject({ peso: 0 })
    expect(await leer(['users', VOTANTE, 'limites', hoy()])).toMatchObject({ confirmaciones: 1 })
  })

  it('cuenta de menos de 24 horas: pesa 0', async () => {
    await sembrar()
    // La antigüedad que ven las reglas es la del perfil guardado.
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'users', VOTANTE), { createdAt: hace(2 * HORA) }, { merge: true })
    })
    const r = await confirmar(VOTANTE, { creadaEnMs: Date.now() - 2 * HORA })
    expect(r).toMatchObject({ peso: 0, motivoPesoCero: 'antiguedad' })
  })
})

describe('casos que el portal detecta antes de escribir', () => {
  it('no se confirma el propio reporte', async () => {
    await sembrar()
    expect(await codigo(confirmar(CIUDADANO))).toBe('propio')
  })
  it('no se confirma dos veces', async () => {
    await sembrar()
    await confirmar()
    expect(await codigo(confirmar())).toBe('ya_confirmo')
  })
  it('confirmaciones suspendidas', async () => {
    await sembrar({ confianza: { puntosConfianza: 0, trustLevel: 0, confirmacionesSuspendidas: true } })
    expect(await codigo(confirmar())).toBe('suspendido')
  })
  it('límite diario (nivel 0: 5)', async () => {
    await sembrar({ limite: { confirmaciones: 5, ultimaAt: hace(10 * 60_000) } })
    expect(await codigo(confirmar())).toBe('limite')
  })
  it('pausa de 20 segundos', async () => {
    await sembrar({ limite: { confirmaciones: 1, ultimaAt: hace(5_000) } })
    expect(await codigo(confirmar())).toBe('pausa')
  })
  it('el reporte no existe', async () => {
    await sembrar()
    const p = confirmarReporte(bd(VOTANTE), { reportId: 'no_existe', uid: VOTANTE, correoVerificado: true, creadaEnMs: antiguaMs() })
    expect(await codigo(p)).toBe('no_existe')
  })
  // Fase 0.3: desde la versión 1.1 las reglas rechazan estas confirmaciones;
  // el portal debe avisarlo con un mensaje claro y no con «rechazada».
  it.each(['resuelto', 'cerrado'])('un reporte «%s» ya no se confirma', async (estado) => {
    await sembrar({ estado })
    expect(await codigo(confirmar())).toBe('finalizado')
    expect(await leer(['reports', 'r1', 'confirmations', VOTANTE])).toBeUndefined()
  })
  it('un reporte con veredicto ya no se confirma', async () => {
    await sembrar({
      validacion: { ...VALIDACION_CERO, validado: true, puntos: 105, votos: 4, veredicto: 'real', veredictoPor: OPERADOR },
    })
    expect(await codigo(confirmar())).toBe('con_veredicto')
  })
  it('las reglas rechazan una confirmación de un reporte cerrado aunque el portal no la detecte', async () => {
    await sembrar({ estado: 'cerrado' })
    const ruta = doc(bd(VOTANTE), 'reports', 'r1', 'confirmations', VOTANTE)
    await expect(
      setDoc(ruta, { uid: VOTANTE, reportId: 'r1', nivel: 0, peso: 10, createdAt: new Date() }),
    ).rejects.toThrow()
  })
  it('una cuenta operador no confirma (lo rechazan las reglas)', async () => {
    await sembrar()
    const p = confirmarReporte(bd(OPERADOR), { reportId: 'r1', uid: OPERADOR, correoVerificado: true, creadaEnMs: antiguaMs() })
    expect(await codigo(p)).toBe('rechazada')
  })
})
