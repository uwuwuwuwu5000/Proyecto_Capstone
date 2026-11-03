// Eliminar la cuenta (historia J2). Misma secuencia que la app móvil (eliminar-cuenta.service.ts): los reportes
// no se borran, quedan como «Cuenta eliminada». Si algo falla a mitad se puede volver a intentar: lo que ya se
// hizo no se repite.
import { FirebaseError } from 'firebase/app'
import { EmailAuthProvider, deleteUser, reauthenticateWithCredential } from 'firebase/auth'
import { collection, doc, getDocs, query, serverTimestamp, updateDoc, where, writeBatch } from 'firebase/firestore'
import type { DocumentReference, Firestore } from 'firebase/firestore'
import { AUTOR_CUENTA_ELIMINADA } from '@ciudad-alerta/comun'
import { auth, db } from '../../firebase/config'

export type CodigoEliminarCuenta = 'sin_sesion' | 'contrasena' | 'demasiados' | 'red' | 'desconocido'

export class EliminarCuentaError extends Error {
  readonly code: CodigoEliminarCuenta

  constructor(message: string, code: CodigoEliminarCuenta) {
    super(message)
    this.name = 'EliminarCuentaError'
    this.code = code
  }
}

/** Escrituras por lote: Firestore admite 500. */
const POR_LOTE = 400

async function propios(firestore: Firestore, coleccion: 'reports' | 'supportTickets', uid: string) {
  const snap = await getDocs(query(collection(firestore, coleccion), where('uid', '==', uid)))
  return snap.docs.map((d) => ({ ref: d.ref, datos: d.data() }))
}

async function actualizarEnLotes(firestore: Firestore, refs: DocumentReference[], cambios: Record<string, string>) {
  for (let i = 0; i < refs.length; i += POR_LOTE) {
    const lote = writeBatch(firestore)
    for (const ref of refs.slice(i, i + POR_LOTE)) lote.update(ref, cambios)
    await lote.commit()
  }
}

/**
 * Deja sin datos personales todo lo que la cuenta tiene en Firestore: el autor de sus reportes y de sus
 * tickets de soporte pasa a «Cuenta eliminada» y el perfil queda sin correo ni nombre. El documento del perfil
 * se conserva (sin datos personales) para que nadie se salte el intervalo entre reportes borrándolo y creándolo
 * de nuevo. Se puede repetir sin efecto: salta lo que ya estaba anónimo.
 */
export async function anonimizarDatosDeCuenta(firestore: Firestore, uid: string): Promise<{ reportesAnonimos: number }> {
  const reportes = (await propios(firestore, 'reports', uid)).filter((d) => d.datos.autorNombre !== AUTOR_CUENTA_ELIMINADA)
  await actualizarEnLotes(firestore, reportes.map((d) => d.ref), { autorNombre: AUTOR_CUENTA_ELIMINADA })

  const tickets = (await propios(firestore, 'supportTickets', uid)).filter(
    (d) => d.datos.autorNombre !== AUTOR_CUENTA_ELIMINADA || d.datos.autorEmail !== '',
  )
  await actualizarEnLotes(firestore, tickets.map((d) => d.ref), { autorNombre: AUTOR_CUENTA_ELIMINADA, autorEmail: '' })

  await updateDoc(doc(firestore, 'users', uid), {
    displayName: AUTOR_CUENTA_ELIMINADA,
    email: '',
    updatedAt: serverTimestamp(),
  })
  return { reportesAnonimos: reportes.length }
}

function traducir(error: unknown): EliminarCuentaError {
  if (error instanceof EliminarCuentaError) return error
  const codigo = error instanceof FirebaseError ? error.code : ''
  if (['auth/wrong-password', 'auth/invalid-credential', 'auth/invalid-login-credentials'].includes(codigo)) {
    return new EliminarCuentaError('La contraseña no es correcta.', 'contrasena')
  }
  if (codigo === 'auth/too-many-requests') {
    return new EliminarCuentaError('Demasiados intentos. Espera unos minutos y vuelve a intentar.', 'demasiados')
  }
  if (['auth/network-request-failed', 'unavailable', 'deadline-exceeded'].includes(codigo)) {
    return new EliminarCuentaError('Sin conexión: tu cuenta no se eliminó. Reintenta con señal.', 'red')
  }
  console.error('Eliminar cuenta:', error)
  return new EliminarCuentaError('No pudimos terminar de eliminar tu cuenta. Vuelve a intentar.', 'desconocido')
}

/**
 * En orden: 1) pide la contraseña otra vez (Firebase la exige para borrar la cuenta), 2) anonimiza los datos,
 * 3) borra la cuenta de Authentication: ya no se puede entrar. Al terminar la sesión queda cerrada.
 */
export async function eliminarCuenta(contrasena: string): Promise<{ reportesAnonimos: number }> {
  const usuario = auth.currentUser
  if (!usuario?.email) {
    throw new EliminarCuentaError('Tu sesión venció. Vuelve a iniciar sesión e inténtalo de nuevo.', 'sin_sesion')
  }

  try {
    await reauthenticateWithCredential(usuario, EmailAuthProvider.credential(usuario.email, contrasena))
  } catch (error) {
    throw traducir(error)
  }

  try {
    const resultado = await anonimizarDatosDeCuenta(db, usuario.uid)
    await deleteUser(usuario)
    return resultado
  } catch (error) {
    throw traducir(error)
  }
}
