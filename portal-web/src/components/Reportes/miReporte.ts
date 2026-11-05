// Corregir o retirar el reporte propio (historia J3). Misma secuencia que la app móvil (mi-reporte.service.ts)
// y mismas condiciones, que salen de `comun/`. Las dos cosas releen el reporte dentro de una transacción: si el
// organismo lo empezó a revisar mientras la pantalla seguía abierta, ya no se puede.
import { FirebaseError } from 'firebase/app'
import { collection, doc, runTransaction, serverTimestamp } from 'firebase/firestore'
import type { Firestore, Transaction } from 'firebase/firestore'
import {
  DESCRIPCION_MAX,
  DESCRIPCION_MIN,
  FIRMA_DEL_AUTOR,
  comentarioDeRetiro,
  problemaDescripcion,
  tieneVotosConPeso,
} from '@ciudad-alerta/comun'

export type CodigoMiReporte = 'sin_sesion' | 'no_es_tuyo' | 'ya_revisado' | 'ya_confirmado' | 'descripcion' | 'red' | 'desconocido'

export class MiReporteError extends Error {
  readonly code: CodigoMiReporte

  constructor(message: string, code: CodigoMiReporte) {
    super(message)
    this.name = 'MiReporteError'
    this.code = code
  }
}

export const MENSAJE_YA_REVISADO = 'El organismo ya empezó a revisar este reporte: ya no se puede corregir ni retirar.'

/** Lo mínimo del reporte para saber de quién es y cómo llamarlo. */
export interface ReporteAjustable {
  id: string
  uid: string
}

function exigirAutor(reporte: ReporteAjustable, uid: string | null | undefined): string {
  if (!uid) throw new MiReporteError('Tu sesión venció. Vuelve a iniciar sesión.', 'sin_sesion')
  if (reporte.uid !== uid) throw new MiReporteError('Solo quien lo reportó puede hacerlo.', 'no_es_tuyo')
  return uid
}

function traducir(error: unknown): MiReporteError {
  if (error instanceof MiReporteError) return error
  const codigo = error instanceof FirebaseError ? error.code : ''
  if (['unavailable', 'deadline-exceeded', 'failed-precondition'].includes(codigo)) {
    return new MiReporteError('Sin conexión: no se guardó nada. Reintenta con señal.', 'red')
  }
  console.error('Mi reporte:', error)
  return new MiReporteError('No pudimos completar la acción. Inténtalo nuevamente.', 'desconocido')
}

/** Relee el reporte en la transacción y exige que siga en «Reportado» antes de escribir. */
async function enTransaccion(
  firestore: Firestore,
  reporte: ReporteAjustable,
  uid: string,
  escribir: (transaccion: Transaction, datos: Record<string, unknown>) => void,
): Promise<void> {
  const referencia = doc(firestore, 'reports', reporte.id)
  try {
    await runTransaction(firestore, async (transaccion) => {
      const actual = await transaccion.get(referencia)
      if (!actual.exists() || actual.data().estado !== 'reportado' || actual.data().uid !== uid) {
        throw new MiReporteError(MENSAJE_YA_REVISADO, 'ya_revisado')
      }
      escribir(transaccion, actual.data())
    })
  } catch (error) {
    throw traducir(error)
  }
}

/** Cambia la descripción. Solo mientras nadie lo haya confirmado con peso: los vecinos votaron por ese texto. */
export async function corregirReporte(
  firestore: Firestore,
  reporte: ReporteAjustable,
  uid: string | null | undefined,
  texto: string,
): Promise<{ descripcion: string }> {
  exigirAutor(reporte, uid)
  const descripcion = texto.trim()
  if (problemaDescripcion(descripcion) !== null) {
    throw new MiReporteError(`Usa entre ${DESCRIPCION_MIN} y ${DESCRIPCION_MAX} caracteres.`, 'descripcion')
  }

  await enTransaccion(firestore, reporte, uid as string, (transaccion, datos) => {
    if (tieneVotosConPeso(datos.validacion as { votos?: number; puntos?: number } | undefined)) {
      throw new MiReporteError(
        'Ya hay vecinos que confirmaron este reporte: ya no se puede corregir la descripción. Si quedó mal, puedes retirarlo.',
        'ya_confirmado',
      )
    }
    transaccion.update(doc(firestore, 'reports', reporte.id), {
      descripcion,
      updatedAt: serverTimestamp(),
      editadoAt: serverTimestamp(),
    })
  })
  return { descripcion }
}

/**
 * Lo deja «Cerrado», con su entrada en el historial firmada «Quien lo reportó» (no se muestra el nombre) y
 * `retiradoPorAutor`, para no contarlo contra el organismo en los tiempos. El motivo es opcional.
 */
export async function retirarReporte(
  firestore: Firestore,
  reporte: ReporteAjustable,
  uid: string | null | undefined,
  motivo = '',
): Promise<void> {
  const autorUid = exigirAutor(reporte, uid)

  await enTransaccion(firestore, reporte, autorUid, (transaccion) => {
    transaccion.set(doc(collection(firestore, 'reports', reporte.id, 'statusHistory')), {
      reportId: reporte.id,
      desde: 'reportado',
      hacia: 'cerrado',
      autorUid,
      autorNombre: FIRMA_DEL_AUTOR,
      comentario: comentarioDeRetiro(motivo),
      createdAt: serverTimestamp(),
    })
    transaccion.update(doc(firestore, 'reports', reporte.id), {
      estado: 'cerrado',
      updatedAt: serverTimestamp(),
      cerradoSinResolverAt: serverTimestamp(),
      retiradoPorAutor: true,
    })
  })
}
