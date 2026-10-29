// Datos de prueba para las pruebas de pantalla. SOLO se escriben en los emuladores
// locales de Auth (9099) y Firestore (8080): nunca en el proyecto real.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { initializeApp, getApps } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore, Timestamp } from 'firebase-admin/firestore'
import { geohashForLocation } from 'geofire-common'

export const PROYECTO = 'demo-ciudad-alerta'
export const CLAVE = 'Prueba123!'
const HORA = 3_600_000
const DIA = 24 * HORA

process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080'
process.env.FIREBASE_AUTH_EMULATOR_HOST ??= '127.0.0.1:9099'

const app = getApps()[0] ?? initializeApp({ projectId: PROYECTO })
const db = getFirestore(app)
const auth = getAuth(app)
const hace = (ms: number) => Timestamp.fromMillis(Date.now() - ms)

/** Acceso directo a los emuladores (con permisos de administrador) para comprobar resultados. */
export { db as bd, auth as autenticacion }

/** Cuentas de prueba (todas con la misma clave). */
export const CUENTAS = {
  admin: { uid: 'admin1', correo: 'admin@prueba.cl', nombre: 'Admin Prueba', role: 'admin' },
  operadorA: { uid: 'oper1', correo: 'operador-a@prueba.cl', nombre: 'Operador Maipú', role: 'operador', operadorId: 'opr_a' },
  operadorB: { uid: 'oper2', correo: 'operador-b@prueba.cl', nombre: 'Operador Cerrillos', role: 'operador', operadorId: 'opr_b' },
  vecino1: { uid: 'vec1', correo: 'vecino1@prueba.cl', nombre: 'Vecina Uno', role: 'ciudadano' },
  vecino2: { uid: 'vec2', correo: 'vecino2@prueba.cl', nombre: 'Vecino Dos', role: 'ciudadano' },
  vecino3: { uid: 'vec3', correo: 'vecino3@prueba.cl', nombre: 'Vecina Tres', role: 'ciudadano' },
  vecino4: { uid: 'vec4', correo: 'vecino4@prueba.cl', nombre: 'Vecino Cuatro', role: 'ciudadano' },
  sinVerificar: { uid: 'vec5', correo: 'sinverificar@prueba.cl', nombre: 'Sin Verificar', role: 'ciudadano', verificado: false },
  recien: { uid: 'vec6', correo: 'recien@prueba.cl', nombre: 'Cuenta Reciente', role: 'ciudadano', antiguedadMs: 2 * HORA },
  suspendido: { uid: 'vec7', correo: 'suspendido@prueba.cl', nombre: 'Vecino Suspendido', role: 'ciudadano' },
  nivelMaximo: { uid: 'vec8', correo: 'maximo@prueba.cl', nombre: 'Nivel Maximo', role: 'ciudadano' },
  // Cuenta de organismo (rol de la app móvil, solo lectura): el portal solo le muestra un mensaje.
  organismo: { uid: 'org1', correo: 'organismo@prueba.cl', nombre: 'Organismo Maipú', role: 'organismo', organismoId: 'muni_13119' },
} as const

interface Comuna {
  codigo: string
  nombre: string
  region: string
  organismoId: string
}
const comunas: Comuna[] = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../public/data/comunas-chile.json', import.meta.url)), 'utf8'),
).comunas
const comuna = (cut: string) => comunas.find((c) => c.codigo === cut)!
export const MAIPU = comuna('13119')
export const CERRILLOS = comuna('13102')
export const SANTIAGO = comuna('13101')
export const LA_SERENA = comuna('04101')

async function limpiar(conCuentas: boolean) {
  await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROYECTO}/databases/(default)/documents`, { method: 'DELETE' })
  if (conCuentas) {
    await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/emulator/v1/projects/${PROYECTO}/accounts`, { method: 'DELETE' })
  }
}

async function lote(operaciones: Array<(b: FirebaseFirestore.WriteBatch) => void>) {
  for (let i = 0; i < operaciones.length; i += 400) {
    const b = db.batch()
    operaciones.slice(i, i + 400).forEach((op) => op(b))
    await b.commit()
  }
}

function organismoDe(c: Comuna) {
  return { id: c.organismoId, nombre: `Municipalidad de ${c.nombre}`, tipo: 'municipio', comuna: c.nombre }
}

export interface DatosReporte {
  id: string
  descripcion: string
  comuna: Comuna
  categoria?: string
  estado?: string
  uid?: string
  lat?: number
  lng?: number
  minutosAtras?: number
  operadorId?: string | null
  validacion?: Record<string, unknown>
  sinRegion?: boolean
  origen?: string
  extra?: Record<string, unknown>
}

const VAL0 = { puntos: 0, votos: 0, validado: false, validadoAt: null, veredicto: null }
export const REAL = (por = 'oper1') => ({ ...VAL0, puntos: 105, votos: 4, validado: true, validadoAt: hace(5 * DIA), veredicto: 'real', veredictoPor: por, veredictoAt: hace(4 * DIA), veredictoPuntos: 10 })
export const FALSO = { ...VAL0, veredicto: 'falso', veredictoPor: 'oper1', veredictoAt: hace(4 * DIA), veredictoComentario: 'No se encontró nada en el lugar', veredictoPuntos: -15 }
export const VALIDADO = { ...VAL0, puntos: 105, votos: 4, validado: true, validadoAt: hace(2 * DIA) }

export function reporte(d: DatosReporte) {
  const lat = d.lat ?? -33.51
  const lng = d.lng ?? -70.76
  const operadorId = d.operadorId === undefined ? (d.comuna === MAIPU ? 'opr_a' : d.comuna === CERRILLOS ? 'opr_b' : null) : d.operadorId
  const datos: Record<string, unknown> = {
    uid: d.uid ?? 'vec1',
    autorNombre: 'Vecina Uno',
    descripcion: d.descripcion,
    categoria: d.categoria ?? 'luminaria',
    ubicacion: { lat, lng },
    comuna: d.comuna.nombre,
    region: d.comuna.region,
    comunaFuente: 'limites_oficiales',
    foto: null,
    estado: d.estado ?? 'reportado',
    confirmaciones: 0,
    validacion: d.validacion ?? VAL0,
    organismo: organismoDe(d.comuna),
    operadorId,
    geohash: geohashForLocation([lat, lng]),
    embedding: null,
    createdAt: hace((d.minutosAtras ?? 60) * 60_000),
    updatedAt: hace((d.minutosAtras ?? 60) * 60_000),
    ...(d.origen ? { origen: d.origen } : {}),
    ...d.extra,
  }
  if (d.sinRegion) delete datos.region
  return datos
}

/** Dónde está cada reporte con nombre (se llena al sembrar). */
export const POSICION: Record<string, { lat: number; lng: number }> = {}

/** Reportes con nombre propio: las pruebas los buscan por su descripción. */
export const R = {
  nuevo: 'E2E reporte nuevo sin veredicto en Maipú',
  validado: 'E2E reporte validado por la comunidad',
  real: 'E2E reporte con veredicto real',
  falso: 'E2E reporte con veredicto falso',
  revision: 'E2E reporte en revisión',
  derivado: 'E2E reporte derivado',
  proceso: 'E2E reporte en proceso',
  resuelto: 'E2E reporte resuelto',
  cerrado: 'E2E reporte cerrado',
  portal: 'E2E reporte creado desde el portal',
  antiguo: 'E2E reporte antiguo sin región',
  cerrillos: 'E2E reporte de Cerrillos operador B',
  ajeno: 'E2E reporte ajeno para confirmar',
  ajeno2: 'E2E reporte ajeno 2 para confirmar',
  ajeno3: 'E2E reporte ajeno 3 para confirmar',
  ajeno4: 'E2E reporte ajeno 4 para confirmar',
  ajeno5: 'E2E reporte ajeno 5 para confirmar',
  mismoPunto: (n: number) => `E2E reporte ${n} en el mismo punto`,
}

/**
 * Carga los datos de prueba. Por defecto solo reinicia Firestore y deja las cuentas de acceso:
 * así las sesiones guardadas por global-setup siguen siendo válidas. `conCuentas` también
 * recrea las cuentas de Authentication (lo usa global-setup, antes de guardar las sesiones).
 */
export async function sembrar(conCuentas = false): Promise<void> {
  await limpiar(conCuentas)

  // ---- Cuentas de acceso y perfiles ----
  for (const c of Object.values(CUENTAS)) {
    const verificado = !('verificado' in c && c.verificado === false)
    if (conCuentas) await auth.createUser({ uid: c.uid, email: c.correo, password: CLAVE, displayName: c.nombre, emailVerified: verificado })
    const antig = 'antiguedadMs' in c ? c.antiguedadMs : 30 * DIA
    await db.doc(`users/${c.uid}`).set({
      uid: c.uid, displayName: c.nombre, email: c.correo, emailVerified: verificado, role: c.role,
      ...('operadorId' in c ? { operadorId: c.operadorId } : {}),
      ...('organismoId' in c ? { organismoId: c.organismoId } : {}),
      trustLevel: 0, validatedReports: 0, createdAt: hace(antig), updatedAt: hace(antig),
    })
  }
  const confianza = (uid: string, puntos: number, nivel: number, extra: object = {}) =>
    db.doc(`users/${uid}/confianza/actual`).set({ puntosConfianza: puntos, trustLevel: nivel, validatedReports: 2, reportesFalsos: 0, confirmacionesSuspendidas: false, ...extra })
  await confianza('vec2', 220, 4)
  await confianza('vec7', 40, 1, { confirmacionesSuspendidas: true })
  await confianza('vec8', 760, 10)

  // ---- Catálogos ----
  const categorias: [string, string, number, boolean][] = [
    ['microbasural', 'Microbasural', 1, true], ['luminaria', 'Luminaria', 2, true], ['fuga_agua', 'Fuga de agua', 3, true],
    ['arbol_peligroso', 'Árbol peligroso', 4, true], ['calle_deteriorada', 'Calle deteriorada', 5, true],
    ['accesibilidad', 'Accesibilidad', 6, true], ['otro', 'Otro', 7, true], ['categoria_inactiva', 'Categoría inactiva', 8, false],
  ]
  await lote(categorias.map(([id, nombre, orden, activa]) => (b) => b.set(db.doc(`categorias/${id}`), { id, nombre, descripcion: `Descripción de ${nombre}`, orden, activa, createdAt: hace(60 * DIA), updatedAt: hace(60 * DIA) })))

  // Un organismo por cada comuna del catálogo (346): da para probar la paginación.
  const sinActivar = new Set([SANTIAGO.codigo])
  await lote(comunas.map((c) => (b) => b.set(db.doc(`organismos/${c.organismoId}`), {
    id: c.organismoId, nombre: `Municipalidad de ${c.nombre}`, tipo: 'municipio', comuna: c.nombre, region: c.region, comunasAtendidas: [c.nombre], activo: !sinActivar.has(c.codigo),
  })))
  const vacio = { telefonoContacto: '', correoContacto: '', direccionContacto: '' }
  await db.doc('operadores/opr_a').set({ id: 'opr_a', nombre: 'Operador Maipú', organismoId: MAIPU.organismoId, activo: true, ...vacio, cuentas: [{ uid: 'oper1', correo: CUENTAS.operadorA.correo, nombre: 'Operador Maipú' }] })
  await db.doc('operadores/opr_b').set({ id: 'opr_b', nombre: 'Operador Cerrillos', organismoId: CERRILLOS.organismoId, activo: true, ...vacio, cuentas: [{ uid: 'oper2', correo: CUENTAS.operadorB.correo, nombre: 'Operador Cerrillos' }] })
  await db.doc('operadores/opr_c').set({ id: 'opr_c', nombre: 'Operador sin cuenta', organismoId: SANTIAGO.organismoId, activo: true, ...vacio, cuentas: [] })

  // ---- Reportes con nombre propio ----
  const nombrados: DatosReporte[] = [
    { id: 'r_nuevo', descripcion: R.nuevo, comuna: MAIPU, minutosAtras: 10 },
    { id: 'r_validado', descripcion: R.validado, comuna: MAIPU, validacion: VALIDADO, minutosAtras: 20, extra: { confirmaciones: 4 } },
    { id: 'r_real', descripcion: R.real, comuna: MAIPU, validacion: REAL(), minutosAtras: 30, categoria: 'microbasural' },
    { id: 'r_falso', descripcion: R.falso, comuna: MAIPU, validacion: FALSO, minutosAtras: 40, categoria: 'fuga_agua' },
    { id: 'r_revision', descripcion: R.revision, comuna: MAIPU, validacion: REAL(), estado: 'en_revision', minutosAtras: 50 },
    { id: 'r_derivado', descripcion: R.derivado, comuna: MAIPU, validacion: REAL(), estado: 'derivado', minutosAtras: 60 },
    { id: 'r_proceso', descripcion: R.proceso, comuna: MAIPU, validacion: REAL(), estado: 'en_proceso', minutosAtras: 70 },
    { id: 'r_resuelto', descripcion: R.resuelto, comuna: MAIPU, validacion: REAL(), estado: 'resuelto', minutosAtras: 5000, extra: { resueltoAt: hace(2 * DIA), tiempoResolucionMs: 3 * DIA } },
    { id: 'r_cerrado', descripcion: R.cerrado, comuna: MAIPU, validacion: REAL(), estado: 'cerrado', minutosAtras: 6000, extra: { cerradoSinResolverAt: hace(DIA) } },
    { id: 'r_portal', descripcion: R.portal, comuna: MAIPU, origen: 'portal_admin', uid: 'admin1', minutosAtras: 80 },
    { id: 'r_antiguo', descripcion: R.antiguo, comuna: MAIPU, sinRegion: true, minutosAtras: 90, lat: -33.52, lng: -70.78 },
    { id: 'r_cerrillos', descripcion: R.cerrillos, comuna: CERRILLOS, validacion: REAL('oper2'), minutosAtras: 100, lat: -33.5, lng: -70.71 },
    { id: 'r_ajeno', descripcion: R.ajeno, comuna: MAIPU, uid: 'vec2', minutosAtras: 15, lat: -33.505, lng: -70.755 },
    { id: 'r_ajeno2', descripcion: R.ajeno2, comuna: MAIPU, uid: 'vec2', minutosAtras: 16 },
    { id: 'r_ajeno3', descripcion: R.ajeno3, comuna: MAIPU, uid: 'vec2', minutosAtras: 17 },
    { id: 'r_ajeno4', descripcion: R.ajeno4, comuna: MAIPU, uid: 'vec2', minutosAtras: 18 },
    { id: 'r_ajeno5', descripcion: R.ajeno5, comuna: MAIPU, uid: 'vec2', minutosAtras: 19 },
    ...[1, 2, 3].map((n) => ({ id: `r_punto${n}`, descripcion: R.mismoPunto(n), comuna: MAIPU, lat: -33.5, lng: -70.74, validacion: REAL(), minutosAtras: 100 + n }) as DatosReporte),
  ]
  // Relleno en Maipú para la paginación y los filtros (60 reportes).
  const categoriasRelleno = ['microbasural', 'luminaria', 'fuga_agua', 'arbol_peligroso', 'calle_deteriorada', 'accesibilidad']
  const estadosRelleno = ['reportado', 'en_revision', 'derivado', 'en_proceso', 'resuelto', 'cerrado']
  const relleno: DatosReporte[] = Array.from({ length: 60 }, (_, i) => ({
    id: `r_relleno${i + 1}`, descripcion: `E2E relleno número ${i + 1}`, comuna: MAIPU,
    categoria: categoriasRelleno[i % 6], estado: estadosRelleno[i % 6], validacion: REAL(),
    minutosAtras: 200 + i * 5, lat: -33.5 - (i % 10) * 0.004, lng: -70.7 - Math.floor(i / 10) * 0.004,
    ...(i % 6 === 4 ? { extra: { resueltoAt: hace(DIA), tiempoResolucionMs: DIA } } : {}),
    ...(i % 6 === 5 ? { extra: { cerradoSinResolverAt: hace(DIA) } } : {}),
  }))
  // 520 reportes en La Serena: el mapa lee como máximo 500 por región.
  const serena: DatosReporte[] = Array.from({ length: 520 }, (_, i) => ({
    id: `r_serena${i + 1}`, descripcion: `E2E La Serena ${i + 1}`, comuna: LA_SERENA, validacion: REAL(), operadorId: null,
    minutosAtras: 300 + i, lat: -29.9 + (i % 26) * 0.003, lng: -71.25 + Math.floor(i / 26) * 0.003,
  }))
  // Cada reporte con nombre tiene su propio punto (separados ~170 m), salvo los tres «en el mismo punto».
  nombrados.forEach((d, i) => {
    d.lat ??= -33.51 - i * 0.0015
    d.lng ??= -70.76
    POSICION[d.id] = { lat: d.lat, lng: d.lng }
  })
  await lote([...nombrados, ...relleno, ...serena].map((d) => (b) => b.set(db.doc(`reports/${d.id}`), reporte(d))))

  // Tres confirmaciones reales en r_validado (VC5) y el tope diario ya alcanzado por vec3 (CT6).
  await lote(['vec2', 'vec3', 'vec4'].map((uid) => (b) => b.set(db.doc(`reports/r_validado/confirmations/${uid}`), {
    uid, reportId: 'r_validado', nivel: 0, peso: 10, createdAt: hace(DIA),
  })))
  const dia = Math.floor((Date.now() - 10_800_000) / 86_400_000)
  await db.doc(`users/vec3/limites/${dia}`).set({ confirmaciones: 5, ultimaAt: hace(HORA) })

  // Historial de estados.
  const historial = (id: string, pasos: Array<[string, string, string, string, string]>) =>
    lote(pasos.map(([desde, hacia, autor, rol, comentario], i) => (b) => b.set(db.doc(`reports/${id}/statusHistory/h${i + 1}`), {
      desde, hacia, comentario, autorNombre: autor, autorRol: rol, createdAt: hace((pasos.length - i) * DIA),
    })))
  await historial('r_resuelto', [
    ['reportado', 'en_revision', 'Municipalidad de Maipú', 'operador', 'Revisamos el caso'],
    ['en_revision', 'derivado', 'Municipalidad de Maipú', 'operador', ''],
    ['derivado', 'en_proceso', 'Admin Prueba', 'admin', 'Cuadrilla asignada'],
    ['en_proceso', 'resuelto', 'Municipalidad de Maipú', 'operador', 'Arreglado'],
  ])
  await historial('r_derivado', [['reportado', 'en_revision', 'Municipalidad de Maipú', 'operador', ''], ['en_revision', 'derivado', 'Municipalidad de Maipú', 'operador', 'Derivado a obras']])

  // ---- Soporte ----
  const ticket = async (id: string, t: Record<string, unknown>, mensajes: Array<[string, string, string]>) => {
    await db.doc(`supportTickets/${id}`).set({ ...t, createdAt: hace(3 * HORA) })
    await lote(mensajes.map(([rol, autor, texto], i) => (b) => b.set(db.doc(`supportTickets/${id}/messages/m${i + 1}`), {
      ticketId: id, autorUid: rol === 'staff' ? 'admin1' : String(t.uid), autorNombre: autor, autorRol: rol, texto, createdAt: hace((mensajes.length - i) * HORA),
    })))
  }
  await ticket('t1', { uid: 'vec1', autorNombre: 'Vecina Uno', autorEmail: CUENTAS.vecino1.correo, tipo: 'queja', asunto: 'E2E queja por luminaria', estado: 'abierto', asignadoA: null, lastMessageAt: hace(HORA), lastMessagePreview: 'La luminaria sigue apagada' }, [['ciudadano', 'Vecina Uno', 'La luminaria sigue apagada']])
  await ticket('t2', { uid: 'vec2', autorNombre: 'Vecino Dos', autorEmail: CUENTAS.vecino2.correo, tipo: 'sugerencia', asunto: 'E2E sugerencia de ciclovía', estado: 'en_atencion', asignadoA: 'admin1', lastMessageAt: hace(30 * 60_000), lastMessagePreview: 'Lo estamos evaluando' }, [['ciudadano', 'Vecino Dos', 'Propongo una ciclovía'], ['staff', 'Soporte Ciudad Alerta', 'Lo estamos evaluando']])
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  sembrar().then(() => console.log('Semilla lista')).catch((e) => { console.error(e); process.exit(1) })
}
