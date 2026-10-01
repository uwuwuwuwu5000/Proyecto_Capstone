import { collection, getDocs, orderBy, query } from 'firebase/firestore'
import { db } from '../../firebase/config'

/** Una entrada de `reports/{id}/statusHistory`. */
export interface CambioEstado {
  id: string
  desde: string
  hacia: string
  comentario: string
  fecha: Date | null
  /** Nombre de la cuenta que hizo el cambio; null en cambios anteriores a guardarlo. */
  autorNombre: string | null
  /** Rol de esa cuenta ('operador' o 'admin'); null en cambios anteriores. */
  autorRol: string | null
}

/**
 * Nombre visible de quien hizo el cambio. Los cambios hechos por un admin se
 * muestran como "Administración", sin exponer el nombre de la persona.
 */
export function autorDelCambio(cambio: CambioEstado): string {
  if (cambio.autorRol === 'admin') return 'Administración Ciudad Alerta'
  return cambio.autorNombre ?? 'Autor no registrado'
}

/** Historial de estados de un reporte, del cambio más antiguo al más reciente. */
export async function cargarHistorial(reportId: string): Promise<CambioEstado[]> {
  const snap = await getDocs(
    query(collection(db, 'reports', reportId, 'statusHistory'), orderBy('createdAt', 'asc')),
  )
  return snap.docs.map((d) => {
    const data = d.data()
    return {
      id: d.id,
      desde: typeof data.desde === 'string' ? data.desde : '',
      hacia: typeof data.hacia === 'string' ? data.hacia : '',
      comentario: typeof data.comentario === 'string' ? data.comentario : '',
      fecha: typeof data.createdAt?.toDate === 'function' ? data.createdAt.toDate() : null,
      autorNombre:
        typeof data.autorNombre === 'string' && data.autorNombre.trim() ? data.autorNombre : null,
      autorRol: typeof data.autorRol === 'string' ? data.autorRol : null,
    }
  })
}
