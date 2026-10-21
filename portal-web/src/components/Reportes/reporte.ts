import { collection, doc, serverTimestamp, writeBatch } from 'firebase/firestore'
import { FirebaseError } from 'firebase/app'
import type { QueryDocumentSnapshot } from 'firebase/firestore'
import { db } from '../../firebase/config'
import { leerValidacion } from '../../confianza/tipos'
import { ErrorSinVeredicto, motivoSinVeredicto } from '../../confianza/exigirVeredicto'
import type { Validacion } from '../../confianza/tipos'

export type FotoInfo = { tipo: 'cloud-storage'; url: string } | { tipo: 'firestore'; path: string }

export interface Reporte {
  id: string
  /** uid del autor. */
  uid: string
  categoria: string
  descripcion: string
  estado: string
  comuna: string
  region: string
  autorNombre: string | null
  fecha: Date | null
  foto: FotoInfo | null
  operadorId: string | null
  organismoId: string | null
  /** Nombre del organismo responsable, tal como lo guardó la app al crear el reporte. */
  organismoNombre: string | null
  lat: number | null
  lng: number | null
  /** 'portal_admin' si lo creó un administrador desde el portal; null si vino de la app. */
  origen: string | null
  /**
   * Cuándo pasó por «Resuelto». Solo existe en reportes que pasaron por ese
   * estado después de que se agregó el campo; los anteriores no lo tienen.
   */
  resueltoAt?: Date | null
  /** Milisegundos entre la creación y la resolución (se guarda junto con `resueltoAt`). */
  tiempoResolucionMs?: number | null
  /** Cuándo se cerró sin haber pasado por «Resuelto» (solo reportes posteriores al campo). */
  cerradoSinResolverAt?: Date | null
  /** Verificación comunitaria y veredicto. Un reporte antiguo no lo tiene: se lee con ceros. */
  validacion: Validacion
}

export interface OperadorResumen {
  id: string
  nombre: string
  organismoId: string
  activo: boolean
}

export function mapearReporte(docSnap: QueryDocumentSnapshot): Reporte {
  const data = docSnap.data()
  const fotoRaw = data.foto as { kind?: unknown; path?: unknown; url?: unknown } | null | undefined
  let foto: FotoInfo | null = null
  if (fotoRaw?.kind === 'cloud-storage' && typeof fotoRaw.url === 'string') {
    foto = { tipo: 'cloud-storage', url: fotoRaw.url }
  } else if (fotoRaw?.kind === 'firestore' && typeof fotoRaw.path === 'string') {
    foto = { tipo: 'firestore', path: fotoRaw.path }
  }
  const organismo = data.organismo as { id?: unknown; nombre?: unknown } | undefined
  const ubicacion = data.ubicacion as { lat?: unknown; lng?: unknown } | undefined
  return {
    id: docSnap.id,
    uid: typeof data.uid === 'string' ? data.uid : '',
    categoria: typeof data.categoria === 'string' ? data.categoria : 'otro',
    descripcion: typeof data.descripcion === 'string' ? data.descripcion : '',
    estado: typeof data.estado === 'string' ? data.estado : 'reportado',
    comuna: typeof data.comuna === 'string' ? data.comuna : '',
    region: typeof data.region === 'string' ? data.region : '',
    // Copia del displayName del autor al momento de crear el reporte (las
    // reglas exigen que coincida con su perfil). /users no se puede leer
    // desde los paneles, así que esta es la única fuente del nombre.
    autorNombre:
      typeof data.autorNombre === 'string' && data.autorNombre.trim() ? data.autorNombre : null,
    fecha: typeof data.createdAt?.toDate === 'function' ? data.createdAt.toDate() : null,
    foto,
    operadorId: typeof data.operadorId === 'string' ? data.operadorId : null,
    organismoId: typeof organismo?.id === 'string' ? organismo.id : null,
    organismoNombre: typeof organismo?.nombre === 'string' ? organismo.nombre : null,
    lat: typeof ubicacion?.lat === 'number' ? ubicacion.lat : null,
    lng: typeof ubicacion?.lng === 'number' ? ubicacion.lng : null,
    origen: typeof data.origen === 'string' ? data.origen : null,
    resueltoAt: typeof data.resueltoAt?.toDate === 'function' ? data.resueltoAt.toDate() : null,
    tiempoResolucionMs: typeof data.tiempoResolucionMs === 'number' ? data.tiempoResolucionMs : null,
    cerradoSinResolverAt:
      typeof data.cerradoSinResolverAt?.toDate === 'function' ? data.cerradoSinResolverAt.toDate() : null,
    validacion: leerValidacion(data.validacion),
  }
}

export function formatearFecha(fecha: Date | null, conHora = false): string {
  if (!fecha) {
    return '—'
  }
  return fecha.toLocaleString('es-CL', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    ...(conHora ? { hour: '2-digit', minute: '2-digit' } : {}),
  })
}

export interface AutorCambio {
  uid: string
  /** displayName del perfil; las reglas exigen que coincida. */
  nombre: string | null
  /** role del perfil; las reglas exigen que coincida. */
  rol: string | null
}

/**
 * Campos de resolución que acompañan al cambio de estado (las reglas los aceptan
 * pero no los exigen; ver cambioDeEstadoValido en firestore.rules):
 *  - al pasar a «resuelto»: `resueltoAt` y `tiempoResolucionMs`;
 *  - al cerrar sin haber pasado por «resuelto»: `cerradoSinResolverAt`.
 */
function camposDeResolucion(reporte: Reporte, hacia: string): Record<string, unknown> {
  if (hacia === 'resuelto' && reporte.fecha) {
    return {
      resueltoAt: serverTimestamp(),
      // Nunca negativo: el reloj de quien creó el reporte pudo ir adelantado.
      tiempoResolucionMs: Math.max(0, Math.round(Date.now() - reporte.fecha.getTime())),
    }
  }
  if (hacia === 'cerrado' && reporte.estado !== 'resuelto') {
    return { cerradoSinResolverAt: serverTimestamp() }
  }
  return {}
}

async function escribirCambioDeEstado(
  reporte: Reporte,
  hacia: string,
  comentario: string,
  autor: AutorCambio,
  extra: Record<string, unknown>,
): Promise<void> {
  const reporteRef = doc(db, 'reports', reporte.id)
  const lote = writeBatch(db)
  lote.update(reporteRef, { estado: hacia, updatedAt: serverTimestamp(), ...extra })
  lote.set(doc(collection(reporteRef, 'statusHistory')), {
    autorUid: autor.uid,
    ...(autor.nombre ? { autorNombre: autor.nombre } : {}),
    ...(autor.rol ? { autorRol: autor.rol } : {}),
    reportId: reporte.id,
    desde: reporte.estado,
    hacia,
    comentario: comentario.trim(),
    createdAt: serverTimestamp(),
  })
  await lote.commit()
}

/**
 * Cambia el estado y deja la entrada en statusHistory en el mismo lote, igual
 * que la app móvil. Las reglas validan la transición y que quien escribe
 * pueda gestionar este reporte. El nombre y rol del autor quedan guardados
 * para que el historial público muestre quién hizo cada cambio.
 *
 * Etapa blanda de los campos de resolución: si las reglas rechazan el cambio
 * con esos campos (p. ej. un reloj del dispositivo muy desviado, o reglas aún
 * sin actualizar), se reintenta sin ellos: el cambio de estado nunca debe
 * quedar bloqueado por un dato de análisis.
 */
export async function cambiarEstadoReporte(
  reporte: Reporte,
  hacia: string,
  comentario: string,
  autor: AutorCambio,
): Promise<void> {
  // Sin veredicto, el estado no cambia (salvo los reportes que no admiten veredicto).
  if (motivoSinVeredicto(reporte, autor.uid)) throw new ErrorSinVeredicto()
  const extra = camposDeResolucion(reporte, hacia)
  try {
    await escribirCambioDeEstado(reporte, hacia, comentario, autor, extra)
  } catch (err) {
    const rechazado = err instanceof FirebaseError && err.code === 'permission-denied'
    if (!rechazado || Object.keys(extra).length === 0) throw err
    console.warn('Las reglas rechazaron los campos de resolución; se reintenta sin ellos.')
    await escribirCambioDeEstado(reporte, hacia, comentario, autor, {})
  }
}
