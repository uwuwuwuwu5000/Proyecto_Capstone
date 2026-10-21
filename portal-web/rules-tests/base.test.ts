// Comportamiento que las reglas vigentes ya permiten o niegan, y que la app
// móvil y el portal usan hoy. Las reglas nuevas del sistema de confianza
// deben seguir pasándolo: se corre con RULES_FILE apuntando al candidato.
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'
import { assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { doc, getDoc, serverTimestamp, setDoc, updateDoc, writeBatch } from 'firebase/firestore'
import {
  ADMIN, CIUDADANO, OPERADOR, REGLAS_VIGENTES, VOTANTE, crearEntorno, reporteNuevo, sembrarBase,
} from './entorno'

describe.each([REGLAS_VIGENTES])('compatibilidad con %s', (archivo) => {
  let env: RulesTestEnvironment
  beforeAll(async () => {
    env = await crearEntorno(archivo)
  })
  afterAll(async () => {
    await env.cleanup()
  })
  beforeEach(async () => {
    await env.clearFirestore()
    await sembrarBase(env, async (db) => {
      await setDoc(doc(db, 'reports', 'r1'), reporteNuevo(CIUDADANO, () => new Date()))
    })
  })

  const como = (uid: string) =>
    env.authenticatedContext(uid, { email: `${uid}@x.cl`, email_verified: true }).firestore()

  describe('reportes', () => {
    it('un ciudadano crea su reporte', async () => {
      const db = como(CIUDADANO)
      await assertSucceeds(setDoc(doc(db, 'reports', 'nuevo'), reporteNuevo(CIUDADANO, serverTimestamp)))
    })
    it('no se crea un reporte a nombre de otro', async () => {
      const db = como(CIUDADANO)
      await assertFails(setDoc(doc(db, 'reports', 'n2'), reporteNuevo(VOTANTE, serverTimestamp)))
    })
    it('un ciudadano no cambia el estado', async () => {
      const db = como(CIUDADANO)
      await assertFails(updateDoc(doc(db, 'reports', 'r1'), { estado: 'cerrado', updatedAt: serverTimestamp() }))
    })
    it('el operador asignado cambia el estado', async () => {
      const db = como(OPERADOR)
      await assertSucceeds(updateDoc(doc(db, 'reports', 'r1'), { estado: 'en_revision', updatedAt: serverTimestamp() }))
    })
    it('el administrador cambia el estado', async () => {
      const db = como(ADMIN)
      await assertSucceeds(updateDoc(doc(db, 'reports', 'r1'), { estado: 'en_revision', updatedAt: serverTimestamp() }))
    })
    it('una transición inválida se rechaza', async () => {
      const db = como(ADMIN)
      await assertFails(updateDoc(doc(db, 'reports', 'r1'), { estado: 'resuelto', updatedAt: serverTimestamp() }))
    })
  })

  describe('confirmaciones (formato actual de la app)', () => {
    const datos = (uid: string) => ({ uid, reportId: 'r1', createdAt: serverTimestamp() })
    it('otro vecino confirma', async () => {
      const db = como(VOTANTE)
      await assertSucceeds(setDoc(doc(db, 'reports', 'r1', 'confirmations', VOTANTE), datos(VOTANTE)))
    })
    it('nadie confirma su propio reporte', async () => {
      const db = como(CIUDADANO)
      await assertFails(setDoc(doc(db, 'reports', 'r1', 'confirmations', CIUDADANO), datos(CIUDADANO)))
    })
    it('no se confirma dos veces', async () => {
      const db = como(VOTANTE)
      await assertSucceeds(setDoc(doc(db, 'reports', 'r1', 'confirmations', VOTANTE), datos(VOTANTE)))
      await assertFails(setDoc(doc(db, 'reports', 'r1', 'confirmations', VOTANTE), datos(VOTANTE)))
    })
    it('un operador no confirma', async () => {
      const db = como(OPERADOR)
      await assertFails(setDoc(doc(db, 'reports', 'r1', 'confirmations', OPERADOR), datos(OPERADOR)))
    })
  })

  describe('perfiles', () => {
    it('cada quien lee su perfil y no el de otro', async () => {
      await assertSucceeds(getDoc(doc(como(CIUDADANO), 'users', CIUDADANO)))
      await assertFails(getDoc(doc(como(CIUDADANO), 'users', VOTANTE)))
    })
    it('un usuario no se sube el nivel', async () => {
      await assertFails(updateDoc(doc(como(CIUDADANO), 'users', CIUDADANO), { trustLevel: 5, updatedAt: serverTimestamp() }))
    })
    it('un usuario no se hace administrador', async () => {
      await assertFails(updateDoc(doc(como(CIUDADANO), 'users', CIUDADANO), { role: 'admin', updatedAt: serverTimestamp() }))
    })
    it('guarda qué avisos ya vio', async () => {
      const db = como(CIUDADANO)
      await assertSucceeds(
        setDoc(doc(db, 'users', CIUDADANO, 'avisos', 'estado'), { vistos: ['a'], updatedAt: serverTimestamp() }),
      )
    })
  })

  describe('historial de estados', () => {
    it('el operador asignado cambia estado y registra el historial en un lote', async () => {
      const db = como(OPERADOR)
      const lote = writeBatch(db)
      lote.update(doc(db, 'reports', 'r1'), { estado: 'en_revision', updatedAt: serverTimestamp() })
      lote.set(doc(db, 'reports', 'r1', 'statusHistory', 'h1'), {
        autorUid: OPERADOR,
        reportId: 'r1',
        desde: 'reportado',
        hacia: 'en_revision',
        comentario: 'Revisando',
        createdAt: serverTimestamp(),
        autorRol: 'operador',
        autorNombre: 'Muni Prueba',
      })
      await assertSucceeds(lote.commit())
    })
  })

})
