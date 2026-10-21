// Paridad entre el código del portal (src/confianza/reglas.ts) y las reglas de
// Firestore: lo que el portal calcula debe ser exactamente lo que las reglas
// aceptan, y un valor distinto debe ser rechazado.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { doc, serverTimestamp, setDoc, writeBatch } from 'firebase/firestore'
import {
  CIUDADANO, OPERADOR, REGLAS_CONFIANZA, VOTANTE, crearEntorno, hace, reporteNuevo, sembrarBase,
} from './entorno'
import {
  aplicarVeredicto, limiteDiario, nivelDePuntos, numeroDeDia, pesoDeNivel, pesoDelVoto,
  porcentajeVerificacion, puntosParaSiguienteNivel, sumarVoto,
} from '../src/confianza/reglas'
import { leerConfianza, leerValidacion } from '../src/confianza/tipos'

// ---------------------------------------------------------------------------
// Funciones puras (no usan el emulador)
// ---------------------------------------------------------------------------

describe('niveles', () => {
  it('cada umbral da su nivel y un punto menos da el anterior', () => {
    const umbrales = [40, 80, 130, 190, 260, 340, 430, 530, 640, 760]
    umbrales.forEach((u, i) => {
      expect(nivelDePuntos(u)).toBe(i + 1)
      expect(nivelDePuntos(u - 1)).toBe(i)
    })
    expect(nivelDePuntos(0)).toBe(0)
    expect(nivelDePuntos(760)).toBe(10)
  })
  it('puntos para el siguiente nivel', () => {
    expect(puntosParaSiguienteNivel(0)).toBe(40)
    expect(puntosParaSiguienteNivel(35)).toBe(5)
    expect(puntosParaSiguienteNivel(760)).toBeNull()
  })
})

describe('peso y límites', () => {
  it('pesos de la sección 4.2', () => {
    const esperado = [10, 12.5, 15, 17.5, 20, 22.5, 25, 27.5, 30, 32.5, 34]
    esperado.forEach((p, n) => expect(pesoDeNivel(n)).toBe(p))
  })
  it('límites diarios de la sección 4.5', () => {
    const esperado = [5, 8, 12, 12, 20, 20, 20, 30, 30, 30, 30]
    esperado.forEach((l, n) => expect(limiteDiario(n)).toBe(l))
  })
  it('el voto pesa 0 sin correo verificado o con menos de 24 horas', () => {
    const ahora = Date.now()
    expect(pesoDelVoto(4, true, ahora - 2 * 86_400_000, ahora)).toBe(20)
    expect(pesoDelVoto(4, false, ahora - 2 * 86_400_000, ahora)).toBe(0)
    expect(pesoDelVoto(4, true, ahora - 3_600_000, ahora)).toBe(0)
    expect(pesoDelVoto(4, true, null, ahora)).toBe(0)
  })
  it('el día cambia a las 00:00 de UTC-3', () => {
    const medianoche = Date.UTC(2026, 9, 20, 3, 0, 0) // 00:00 en UTC-3
    expect(numeroDeDia(medianoche) - numeroDeDia(medianoche - 1)).toBe(1)
  })
})

describe('validación y veredicto', () => {
  it('suma de votos: 100 puntos y 3 personas', () => {
    expect(sumarVoto({ puntos: 95, votos: 3, validado: false }, 10)).toEqual({
      puntos: 105, votos: 4, validado: true, recienValidado: true,
    })
    expect(sumarVoto({ puntos: 90, votos: 1, validado: false }, 10).validado).toBe(false)
    expect(sumarVoto({ puntos: 100, votos: 2, validado: false }, 0)).toMatchObject({ votos: 2, validado: false })
    expect(sumarVoto({ puntos: 120, votos: 4, validado: true }, 10).recienValidado).toBe(false)
  })
  it('veredicto real y falso, con piso y tope', () => {
    expect(aplicarVeredicto(0, 'real')).toEqual({ puntos: 10, nivel: 0, aplicados: 10 })
    expect(aplicarVeredicto(35, 'real')).toEqual({ puntos: 45, nivel: 1, aplicados: 10 })
    expect(aplicarVeredicto(755, 'real')).toEqual({ puntos: 760, nivel: 10, aplicados: 5 })
    expect(aplicarVeredicto(760, 'real').aplicados).toBe(0)
    expect(aplicarVeredicto(20, 'falso')).toEqual({ puntos: 5, nivel: 0, aplicados: -15 })
    expect(aplicarVeredicto(5, 'falso')).toEqual({ puntos: 0, nivel: 0, aplicados: -5 })
    expect(aplicarVeredicto(45, 'falso').nivel).toBe(0) // baja de nivel
  })
  it('porcentaje de verificación', () => {
    expect(porcentajeVerificacion(0)).toBe(0)
    expect(porcentajeVerificacion(62)).toBe(62)
    expect(porcentajeVerificacion(250)).toBe(100)
  })
})

describe('lectura de datos con ceros donde falte', () => {
  it('reporte antiguo sin validacion', () => {
    expect(leerValidacion(undefined)).toMatchObject({ puntos: 0, votos: 0, validado: false, veredicto: null })
  })
  it('usuario sin documento de confianza', () => {
    expect(leerConfianza(undefined)).toEqual({
      puntosConfianza: 0, trustLevel: 0, validatedReports: 0, reportesFalsos: 0, confirmacionesSuspendidas: false,
    })
  })
})

// ---------------------------------------------------------------------------
// Contra las reglas (emulador)
// ---------------------------------------------------------------------------

let env: RulesTestEnvironment
beforeAll(async () => {
  env = await crearEntorno(REGLAS_CONFIANZA)
})
afterAll(async () => {
  await env.cleanup()
})

const como = (uid: string) => env.authenticatedContext(uid, { email: `${uid}@x.cl`, email_verified: true }).firestore()
const VALIDACION_CERO = { puntos: 0, votos: 0, validado: false, validadoAt: null, veredicto: null }

describe('las reglas aceptan lo que calcula el portal', () => {
  for (let nivel = 0; nivel <= 10; nivel++) {
    const puntos = [0, 40, 80, 130, 190, 260, 340, 430, 530, 640, 760][nivel]

    it(`nivel ${nivel}: el peso ${pesoDeNivel(nivel)} se acepta y otro se rechaza`, async () => {
      const intento = async (peso: number) => {
        await env.clearFirestore()
        await sembrarBase(env, async (db) => {
          await setDoc(doc(db, 'reports', 'r1'), { ...reporteNuevo(CIUDADANO, () => new Date()), validacion: VALIDACION_CERO })
          await setDoc(doc(db, 'users', VOTANTE, 'confianza', 'actual'), { puntosConfianza: puntos, trustLevel: nivel })
        })
        const db = como(VOTANTE)
        const lote = writeBatch(db)
        lote.set(doc(db, 'reports', 'r1', 'confirmations', VOTANTE), {
          uid: VOTANTE, reportId: 'r1', createdAt: serverTimestamp(), nivel, peso,
        })
        lote.update(doc(db, 'reports', 'r1'), { 'validacion.puntos': peso, 'validacion.votos': 1, 'validacion.validado': false })
        lote.set(doc(db, 'users', VOTANTE, 'limites', String(numeroDeDia())), { confirmaciones: 1, ultimaAt: serverTimestamp() })
        return lote.commit()
      }
      await assertSucceeds(intento(pesoDeNivel(nivel)))
      await assertFails(intento(pesoDeNivel(nivel) + 0.5))
    })

    it(`nivel ${nivel}: el límite diario es ${limiteDiario(nivel)}`, async () => {
      const intento = async (previas: number) => {
        await env.clearFirestore()
        await sembrarBase(env, async (db) => {
          await setDoc(doc(db, 'reports', 'r1'), { ...reporteNuevo(CIUDADANO, () => new Date()), validacion: VALIDACION_CERO })
          await setDoc(doc(db, 'users', VOTANTE, 'confianza', 'actual'), { puntosConfianza: puntos, trustLevel: nivel })
          await setDoc(doc(db, 'users', VOTANTE, 'limites', String(numeroDeDia())), { confirmaciones: previas, ultimaAt: hace(120_000) })
        })
        const db = como(VOTANTE)
        const peso = pesoDeNivel(nivel)
        const lote = writeBatch(db)
        lote.set(doc(db, 'reports', 'r1', 'confirmations', VOTANTE), {
          uid: VOTANTE, reportId: 'r1', createdAt: serverTimestamp(), nivel, peso,
        })
        lote.update(doc(db, 'reports', 'r1'), { 'validacion.puntos': peso, 'validacion.votos': 1, 'validacion.validado': false })
        lote.update(doc(db, 'users', VOTANTE, 'limites', String(numeroDeDia())), { confirmaciones: previas + 1, ultimaAt: serverTimestamp() })
        return lote.commit()
      }
      await assertSucceeds(intento(limiteDiario(nivel) - 1))
      await assertFails(intento(limiteDiario(nivel)))
    })
  }

  // Veredicto: el resultado de aplicarVeredicto() para puntos en cada tramo.
  const casos: Array<[number, 'real' | 'falso']> = [
    [0, 'real'], [35, 'real'], [75, 'real'], [125, 'real'], [185, 'real'], [255, 'real'], [335, 'real'],
    [425, 'real'], [525, 'real'], [635, 'real'], [755, 'real'], [760, 'real'],
    [0, 'falso'], [5, 'falso'], [20, 'falso'], [50, 'falso'], [135, 'falso'], [760, 'falso'],
  ]
  for (const [previos, veredicto] of casos) {
    const r = aplicarVeredicto(previos, veredicto)
    it(`veredicto ${veredicto} con ${previos} PC → ${r.puntos} PC, nivel ${r.nivel}`, async () => {
      const intento = async (puntosNuevos: number, nivelNuevo: number) => {
        await env.clearFirestore()
        await sembrarBase(env, async (db) => {
          await setDoc(doc(db, 'reports', 'r1'), { ...reporteNuevo(CIUDADANO, () => new Date()), validacion: VALIDACION_CERO })
          await setDoc(doc(db, 'users', CIUDADANO, 'confianza', 'actual'), {
            puntosConfianza: previos, trustLevel: nivelDePuntos(previos), validatedReports: 3, reportesFalsos: 1,
          })
        })
        const db = como(OPERADOR)
        const esReal = veredicto === 'real'
        const lote = writeBatch(db)
        lote.update(doc(db, 'reports', 'r1'), {
          'validacion.veredicto': veredicto,
          'validacion.veredictoPor': OPERADOR,
          'validacion.veredictoAt': serverTimestamp(),
          'validacion.veredictoPuntos': puntosNuevos - previos,
          ...(esReal ? {} : { 'validacion.veredictoComentario': 'No corresponde' }),
          updatedAt: serverTimestamp(),
        })
        lote.set(doc(db, 'users', CIUDADANO, 'confianza', 'actual'), {
          puntosConfianza: puntosNuevos,
          trustLevel: nivelNuevo,
          validatedReports: 3 + (esReal ? 1 : 0),
          reportesFalsos: 1 + (esReal ? 0 : 1),
          confirmacionesSuspendidas: false,
          ultimoReporteId: 'r1',
          updatedAt: serverTimestamp(),
        })
        lote.update(doc(db, 'users', CIUDADANO), {
          trustLevel: nivelNuevo, validatedReports: 3 + (esReal ? 1 : 0), updatedAt: serverTimestamp(),
        })
        return lote.commit()
      }
      await assertSucceeds(intento(r.puntos, r.nivel))
      // Un nivel distinto del que corresponde a esos puntos debe rechazarse.
      await assertFails(intento(r.puntos, r.nivel === 10 ? 9 : r.nivel + 1))
    })
  }
})
