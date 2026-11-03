// Fase 7: los pasos de «Eliminar mi cuenta» que escriben en Firestore (src/components/Perfil/eliminarCuenta.ts)
// contra las reglas reales: anonimizan lo propio y nada más, se pueden repetir si se cortan a mitad y
// aguantan más de un lote de reportes.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { assertFails } from '@firebase/rules-unit-testing'
import type { RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { collection, doc, getDoc, getDocs, query, setDoc, updateDoc, where } from 'firebase/firestore'
import { CIUDADANO, VOTANTE, crearEntorno, hace, reporteNuevo, sembrarBase } from './entorno'
import { anonimizarDatosDeCuenta } from '../src/components/Perfil/eliminarCuenta'

let env: RulesTestEnvironment
const CANTIDAD_GRANDE = 450 // más que el lote de 400

beforeAll(async () => {
  env = await crearEntorno()
})
afterAll(async () => {
  await env.cleanup()
})

const bd = (uid: string) => env.authenticatedContext(uid, { email: `${uid}@x.cl`, email_verified: true }).firestore()

/** Deja los datos de la cuenta que se va a eliminar: reportes, un ticket y el de otra persona. */
async function sembrar(propios: number, yaAnonimos = 0) {
  await env.clearFirestore()
  await sembrarBase(env, async (db) => {
    for (let i = 0; i < propios; i++) {
      await setDoc(doc(db, 'reports', `p${i}`), reporteNuevo(CIUDADANO, () => new Date(), { autorNombre: 'Nombre ciud1', descripcion: `propio ${i}` }))
    }
    for (let i = 0; i < yaAnonimos; i++) {
      await setDoc(doc(db, 'reports', `a${i}`), reporteNuevo(CIUDADANO, () => new Date(), { autorNombre: 'Cuenta eliminada' }))
    }
    await setDoc(doc(db, 'reports', 'ajeno'), reporteNuevo(VOTANTE, () => new Date(), { autorNombre: 'Nombre ciud2' }))
    const ticket = (id: string, uid: string, nombre: string, correo: string) =>
      setDoc(doc(db, 'supportTickets', id), {
        uid, autorNombre: nombre, autorEmail: correo, tipo: 'queja', estado: 'abierto', asignadoA: null, asunto: 'Asunto',
        lastMessagePreview: 'Hola', lastMessageAt: hace(1000), createdAt: hace(1000), updatedAt: hace(1000),
      })
    await ticket('t_propio', CIUDADANO, 'Nombre ciud1', 'ciud1@x.cl')
    await ticket('t_ajeno', VOTANTE, 'Nombre ciud2', 'ciud2@x.cl')
  })
}

async function lee(uid: string, ruta: string, id: string) {
  return (await getDoc(doc(bd(uid), ruta, id))).data()
}

describe('anonimizarDatosDeCuenta', () => {
  it('deja anónimos los reportes, los tickets y el perfil propios, y no toca lo de otras personas', async () => {
    await sembrar(3)
    const r = await anonimizarDatosDeCuenta(bd(CIUDADANO) as never, CIUDADANO)
    expect(r.reportesAnonimos).toBe(3)
    for (let i = 0; i < 3; i++) expect((await lee(CIUDADANO, 'reports', `p${i}`))?.autorNombre).toBe('Cuenta eliminada')
    // El reporte se conserva con todo lo demás.
    expect((await lee(CIUDADANO, 'reports', 'p0'))?.descripcion).toBe('propio 0')
    expect((await lee(VOTANTE, 'reports', 'ajeno'))?.autorNombre).toBe('Nombre ciud2')
    const propio = await lee(CIUDADANO, 'supportTickets', 't_propio')
    expect(propio).toMatchObject({ autorNombre: 'Cuenta eliminada', autorEmail: '' })
    expect(await lee(VOTANTE, 'supportTickets', 't_ajeno')).toMatchObject({ autorNombre: 'Nombre ciud2', autorEmail: 'ciud2@x.cl' })
    // El perfil se conserva sin correo ni nombre (así nadie se salta el intervalo entre reportes).
    expect(await lee(CIUDADANO, 'users', CIUDADANO)).toMatchObject({ displayName: 'Cuenta eliminada', email: '', role: 'ciudadano' })
  })

  it('se puede repetir si se cortó a mitad: lo ya hecho no se vuelve a hacer', async () => {
    await sembrar(2, 3) // 3 reportes ya estaban anónimos de un intento anterior
    const primera = await anonimizarDatosDeCuenta(bd(CIUDADANO) as never, CIUDADANO)
    expect(primera.reportesAnonimos).toBe(2)
    const segunda = await anonimizarDatosDeCuenta(bd(CIUDADANO) as never, CIUDADANO)
    expect(segunda.reportesAnonimos).toBe(0)
    const todos = await getDocs(query(collection(bd(CIUDADANO), 'reports'), where('uid', '==', CIUDADANO)))
    expect(todos.docs.map((d) => d.data().autorNombre)).toEqual(Array(5).fill('Cuenta eliminada'))
  })

  it(`aguanta más de un lote de reportes (${CANTIDAD_GRANDE})`, async () => {
    await sembrar(CANTIDAD_GRANDE)
    const r = await anonimizarDatosDeCuenta(bd(CIUDADANO) as never, CIUDADANO)
    expect(r.reportesAnonimos).toBe(CANTIDAD_GRANDE)
    const todos = await getDocs(query(collection(bd(CIUDADANO), 'reports'), where('uid', '==', CIUDADANO)))
    expect(todos.size).toBe(CANTIDAD_GRANDE)
    expect(todos.docs.every((d) => d.data().autorNombre === 'Cuenta eliminada')).toBe(true)
  }, 60_000)
})

describe('lo que las reglas no dejan hacer (por eso el servicio solo anonimiza)', () => {
  it('una persona no puede anonimizar los reportes ni el perfil de otra', async () => {
    await sembrar(1)
    await assertFails(updateDoc(doc(bd(VOTANTE), 'reports', 'p0'), { autorNombre: 'Cuenta eliminada' }))
    await assertFails(updateDoc(doc(bd(VOTANTE), 'users', CIUDADANO), { displayName: 'Cuenta eliminada', email: '' }))
  })

  it('el perfil no se puede borrar desde el cliente', async () => {
    await sembrar(0)
    const { deleteDoc } = await import('firebase/firestore')
    await assertFails(deleteDoc(doc(bd(CIUDADANO), 'users', CIUDADANO)))
  })
})
