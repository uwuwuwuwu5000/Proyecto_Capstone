import { collection, doc, serverTimestamp, writeBatch } from 'firebase/firestore'
import type { QueryDocumentSnapshot } from 'firebase/firestore'
import { db } from '../../firebase/config'

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
  lat: number | null
  lng: number | null
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
  const organismo = data.organismo as { id?: unknown } | undefined
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
    lat: typeof ubicacion?.lat === 'number' ? ubicacion.lat : null,
    lng: typeof ubicacion?.lng === 'number' ? ubicacion.lng : null,
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

/**
 * Cambia el estado y deja la entrada en statusHistory en el mismo lote, igual
 * que la app móvil. Las reglas validan la transición y que quien escribe
 * pueda gestionar este reporte.
 */
export async function cambiarEstadoReporte(
  reporte: Reporte,
  hacia: string,
  comentario: string,
  autorUid: string,
): Promise<void> {
  const reporteRef = doc(db, 'reports', reporte.id)
  const lote = writeBatch(db)
  lote.update(reporteRef, { estado: hacia, updatedAt: serverTimestamp() })
  lote.set(doc(collection(reporteRef, 'statusHistory')), {
    autorUid,
    reportId: reporte.id,
    desde: reporte.estado,
    hacia,
    comentario: comentario.trim(),
    createdAt: serverTimestamp(),
  })
  await lote.commit()
}
