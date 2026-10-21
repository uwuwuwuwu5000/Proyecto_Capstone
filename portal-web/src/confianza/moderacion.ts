// Moderación de confirmaciones (historia A8): un administrador suspende o
// rehabilita las confirmaciones de un usuario. Por ahora solo se guarda el
// valor verdadero o falso en `users/{uid}/confianza/actual` (sin motivo, autor
// ni fecha; decisión del equipo). Las reglas solo lo permiten a un
// administrador y no dejan tocar los puntos.
import { collection, doc, getDoc, getDocs, limit, orderBy, query, serverTimestamp, setDoc } from 'firebase/firestore'
import type { Firestore } from 'firebase/firestore'
import { FirebaseError } from 'firebase/app'
import { leerConfianza } from './tipos'

export async function leerSuspension(db: Firestore, uid: string): Promise<boolean> {
  const snap = await getDoc(doc(db, 'users', uid, 'confianza', 'actual'))
  return leerConfianza(snap.data()).confirmacionesSuspendidas
}

/** Suspende (true) o rehabilita (false) las confirmaciones de un usuario. */
export async function cambiarSuspension(db: Firestore, uid: string, suspender: boolean): Promise<void> {
  try {
    // merge: si el usuario aún no tiene documento de confianza, se crea solo con este campo.
    await setDoc(
      doc(db, 'users', uid, 'confianza', 'actual'),
      { confirmacionesSuspendidas: suspender, updatedAt: serverTimestamp() },
      { merge: true },
    )
  } catch (error) {
    if (error instanceof FirebaseError && error.code === 'permission-denied') {
      throw new Error('Solo un administrador puede suspender o rehabilitar confirmaciones.')
    }
    console.error('Moderación: no se pudo cambiar la suspensión.', error)
    throw new Error('No pudimos guardar el cambio. Inténtalo nuevamente.')
  }
}

export interface ConfirmacionDeUsuario {
  uid: string
  /** Nivel y peso con que votó (null en confirmaciones del formato antiguo). */
  nivel: number | null
  peso: number | null
  fecha: Date | null
  suspendido: boolean
}

/** Máximo de confirmaciones que se listan: moderar es una tarea puntual, no un listado. */
export const MAXIMO_CONFIRMACIONES = 50

/** Quiénes confirmaron un reporte y si su cuenta tiene las confirmaciones suspendidas. */
export async function cargarConfirmantes(db: Firestore, reportId: string): Promise<ConfirmacionDeUsuario[]> {
  const snap = await getDocs(
    query(collection(db, 'reports', reportId, 'confirmations'), orderBy('createdAt', 'desc'), limit(MAXIMO_CONFIRMACIONES)),
  )
  return Promise.all(
    snap.docs.map(async (d) => {
      const datos = d.data()
      return {
        uid: d.id,
        nivel: typeof datos.nivel === 'number' ? datos.nivel : null,
        peso: typeof datos.peso === 'number' ? datos.peso : null,
        fecha: typeof datos.createdAt?.toDate === 'function' ? datos.createdAt.toDate() : null,
        suspendido: await leerSuspension(db, d.id).catch(() => false),
      }
    }),
  )
}
