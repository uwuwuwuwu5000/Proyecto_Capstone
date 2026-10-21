// Utilidades comunes de las pruebas de reglas.
//
// Las reglas que se prueban son las del archivo desplegable (firestore.rules).
// Con RULES_FILE se puede forzar otro archivo.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { doc, setDoc, Timestamp } from 'firebase/firestore'

export const REGLAS_VIGENTES = 'firestore.rules'
export const REGLAS_CONFIANZA = REGLAS_VIGENTES

export async function crearEntorno(archivo: string = REGLAS_VIGENTES): Promise<RulesTestEnvironment> {
  const ruta = resolve(process.env.RULES_FILE ?? archivo)
  const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080').split(':')
  return initializeTestEnvironment({
    projectId: 'demo-ciudad-alerta',
    firestore: { rules: readFileSync(ruta, 'utf8'), host, port: Number(port) },
  })
}

/** Cuentas de prueba. */
export const CIUDADANO = 'ciud1'
export const VOTANTE = 'ciud2'
export const OPERADOR = 'oper1'
export const ADMIN = 'admin1'

export const HORA = 3_600_000
export const DIA = 24 * HORA
export const hace = (ms: number) => Timestamp.fromMillis(Date.now() - ms)

type BaseDeDatos = ReturnType<ReturnType<RulesTestEnvironment['authenticatedContext']>['firestore']>

/** Datos de base: perfiles, un organismo con su operador. Se escriben sin reglas. */
export async function sembrarBase(
  entorno: RulesTestEnvironment,
  extra?: (db: BaseDeDatos) => Promise<void>,
) {
  await entorno.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore()
    const perfil = (uid: string, role: string, extras: object = {}) =>
      setDoc(doc(db, 'users', uid), {
        uid,
        email: `${uid}@x.cl`,
        displayName: `Nombre ${uid}`,
        role,
        trustLevel: 0,
        validatedReports: 0,
        emailVerified: true,
        createdAt: hace(10 * DIA),
        updatedAt: hace(10 * DIA),
        ...extras,
      })
    await perfil(CIUDADANO, 'ciudadano')
    await perfil(VOTANTE, 'ciudadano')
    await perfil(OPERADOR, 'operador', { operadorId: 'opr1' })
    await perfil(ADMIN, 'admin')
    await setDoc(doc(db, 'organismos', 'org1'), { nombre: 'Muni Prueba', activo: true })
    await setDoc(doc(db, 'operadores', 'opr1'), { organismoId: 'org1', activo: true, nombre: 'Op 1' })
    if (extra) await extra(db)
  })
}

/** Reporte mínimo válido para crear (lo que escribe la app). */
export function reporteNuevo(uid: string, marcaTiempo: () => unknown, extra: object = {}) {
  return {
    uid,
    descripcion: 'Basura acumulada hace una semana',
    categoria: 'otro',
    ubicacion: { lat: -33.45, lng: -70.65 },
    geohash: '66jc3',
    foto: null,
    estado: 'reportado',
    confirmaciones: 0,
    organismo: { id: 'org1', nombre: 'Muni Prueba' },
    operadorId: 'opr1',
    createdAt: marcaTiempo(),
    updatedAt: marcaTiempo(),
    ...extra,
  }
}
