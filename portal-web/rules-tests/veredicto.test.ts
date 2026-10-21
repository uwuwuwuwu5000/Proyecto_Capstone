// El código real del veredicto (src/confianza/veredicto.ts) contra las reglas
// de Firestore en el emulador.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { ADMIN, CIUDADANO, DIA, OPERADOR, VOTANTE, crearEntorno, hace, reporteNuevo, sembrarBase } from './entorno'
import { ErrorVeredicto, darVeredicto } from '../src/confianza/veredicto'

let env: RulesTestEnvironment
beforeAll(async () => {
  env = await crearEntorno()
})
afterAll(async () => {
  await env.cleanup()
})

const VALIDACION_CERO = { puntos: 0, votos: 0, validado: false, validadoAt: null, veredicto: null }

interface Semilla {
  confianzaAutor?: object
  origen?: string
  operadorId?: string | null
  validacion?: object
}

async function sembrar(s: Semilla = {}) {
  await env.clearFirestore()
  await sembrarBase(env, async (db) => {
    await setDoc(doc(db, 'reports', 'r1'), {
      ...reporteNuevo(CIUDADANO, () => new Date()),
      validacion: s.validacion ?? VALIDACION_CERO,
      ...(s.origen ? { origen: s.origen } : {}),
      ...(s.operadorId !== undefined ? { operadorId: s.operadorId } : {}),
    })
    if (s.confianzaAutor) await setDoc(doc(db, 'users', CIUDADANO, 'confianza', 'actual'), s.confianzaAutor)
    // Reporte de un administrador, para el caso «no al propio reporte».
    await setDoc(doc(db, 'reports', 'r_admin'), { ...reporteNuevo(ADMIN, () => new Date()), validacion: VALIDACION_CERO })
    await setDoc(doc(db, 'operadores', 'opr2'), { organismoId: 'org2', activo: true, nombre: 'Op 2' })
    await setDoc(doc(db, 'users', 'oper2'), {
      uid: 'oper2', email: 'o2@x.cl', displayName: 'Op2', role: 'operador', operadorId: 'opr2',
      trustLevel: 0, validatedReports: 0, createdAt: hace(DIA), updatedAt: hace(DIA),
    })
  })
}

const bd = (uid: string) => env.authenticatedContext(uid, { email: `${uid}@x.cl`, email_verified: true }).firestore()
// Se lee sin reglas: aquí importa lo que quedó escrito, no quién puede leerlo.
const leer = async (...ruta: [string, ...string[]]) => {
  let datos: Record<string, any> | undefined
  await env.withSecurityRulesDisabled(async (ctx) => {
    datos = (await getDoc(doc(ctx.firestore(), ...ruta))).data()
  })
  return datos
}

const dar = (quien: string, v: 'real' | 'falso', comentario = '', reportId = 'r1') =>
  darVeredicto(bd(quien), { reportId, veredicto: v, comentario, gestorUid: quien })

const codigo = async (p: Promise<unknown>) => {
  try {
    await p
    return 'ok'
  } catch (e) {
    return e instanceof ErrorVeredicto ? e.codigo : `otro:${String(e)}`
  }
}

describe('veredicto real', () => {
  beforeEach(() => sembrar())

  it('el operador asignado suma 10 puntos a un autor sin historial', async () => {
    const r = await dar(OPERADOR, 'real')
    expect(r).toEqual({ puntosAntes: 0, puntos: 10, nivelAntes: 0, nivel: 0, aplicados: 10 })
    expect((await leer('reports', 'r1'))?.validacion).toMatchObject({
      veredicto: 'real', veredictoPor: OPERADOR, veredictoPuntos: 10,
    })
    expect(await leer('users', CIUDADANO, 'confianza', 'actual')).toMatchObject({
      puntosConfianza: 10, trustLevel: 0, validatedReports: 1, reportesFalsos: 0, ultimoReporteId: 'r1',
    })
    expect(await leer('users', CIUDADANO)).toMatchObject({ trustLevel: 0, validatedReports: 1 })
  })

  it('sube de nivel: 35 + 10 = 45 PC → nivel 1, y el espejo en users lo refleja', async () => {
    await sembrar({ confianzaAutor: { puntosConfianza: 35, trustLevel: 0, validatedReports: 3, reportesFalsos: 0 } })
    const r = await dar(OPERADOR, 'real', 'Verificado en terreno')
    expect(r).toMatchObject({ puntos: 45, nivelAntes: 0, nivel: 1 })
    expect((await leer('reports', 'r1'))?.validacion.veredictoComentario).toBe('Verificado en terreno')
    expect(await leer('users', CIUDADANO)).toMatchObject({ trustLevel: 1, validatedReports: 4 })
  })

  it('tope de 760: 755 + 10 aplica solo 5', async () => {
    await sembrar({ confianzaAutor: { puntosConfianza: 755, trustLevel: 9, validatedReports: 70, reportesFalsos: 0 } })
    expect(await dar(ADMIN, 'real')).toMatchObject({ puntos: 760, nivel: 10, aplicados: 5 })
  })

  it('el administrador también da veredicto', async () => {
    expect(await codigo(dar(ADMIN, 'real'))).toBe('ok')
  })
})

describe('veredicto falso', () => {
  it('con 20 PC baja a 5 y cuenta un reporte falso', async () => {
    await sembrar({ confianzaAutor: { puntosConfianza: 20, trustLevel: 0, validatedReports: 2, reportesFalsos: 0 } })
    const r = await dar(OPERADOR, 'falso', 'La foto no corresponde')
    expect(r).toMatchObject({ puntos: 5, aplicados: -15 })
    expect(await leer('users', CIUDADANO, 'confianza', 'actual')).toMatchObject({ reportesFalsos: 1, validatedReports: 2 })
  })

  it('piso en 0: con 5 PC se aplican −5', async () => {
    await sembrar({ confianzaAutor: { puntosConfianza: 5, trustLevel: 0, validatedReports: 0, reportesFalsos: 0 } })
    expect(await dar(OPERADOR, 'falso', 'No existe')).toMatchObject({ puntos: 0, aplicados: -5 })
  })

  it('puede bajar de nivel: 45 PC (nivel 1) → 30 PC (nivel 0)', async () => {
    await sembrar({ confianzaAutor: { puntosConfianza: 45, trustLevel: 1, validatedReports: 4, reportesFalsos: 0 } })
    expect(await dar(OPERADOR, 'falso', 'Falso')).toMatchObject({ nivelAntes: 1, nivel: 0 })
    expect(await leer('users', CIUDADANO)).toMatchObject({ trustLevel: 0 })
  })

  it('sin comentario no se guarda', async () => {
    await sembrar()
    expect(await codigo(dar(OPERADOR, 'falso', '   '))).toBe('sin_comentario')
  })
})

describe('casos que se rechazan', () => {
  beforeEach(() => sembrar())

  it('un veredicto no se cambia', async () => {
    await dar(OPERADOR, 'real')
    expect(await codigo(dar(OPERADOR, 'falso', 'Cambio'))).toBe('ya_tiene')
    expect(await codigo(dar(ADMIN, 'falso', 'Cambio'))).toBe('ya_tiene')
  })

  it('no al reporte propio', async () => {
    expect(await codigo(dar(ADMIN, 'real', '', 'r_admin'))).toBe('propio')
  })

  it('los reportes creados desde el portal no dan puntos', async () => {
    await sembrar({ origen: 'portal_admin' })
    expect(await codigo(dar(OPERADOR, 'real'))).toBe('autor_sin_puntos')
  })

  it('un operador de otro organismo no puede', async () => {
    expect(await codigo(dar('oper2', 'real'))).toBe('rechazado')
  })

  it('un ciudadano no puede', async () => {
    expect(await codigo(dar(VOTANTE, 'real'))).toBe('rechazado')
  })

  it('un reporte sin operador solo lo resuelve un administrador', async () => {
    await sembrar({ operadorId: null })
    expect(await codigo(dar(OPERADOR, 'real'))).toBe('rechazado')
    expect(await codigo(dar(ADMIN, 'real'))).toBe('ok')
  })

  it('el reporte no existe', async () => {
    expect(await codigo(dar(OPERADOR, 'real', '', 'no_existe'))).toBe('no_existe')
  })

  it('un reporte antiguo sin el mapa validacion también se puede resolver', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'reports', 'r_viejo'), reporteNuevo(CIUDADANO, () => new Date()))
    })
    expect(await codigo(dar(OPERADOR, 'real', '', 'r_viejo'))).toBe('ok')
  })
})
