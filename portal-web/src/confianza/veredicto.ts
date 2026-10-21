// Veredicto de un operador o administrador sobre un reporte (sistema_confianza.md,
// secciones 5.5 y 5.6): «real» (+10 PC al autor) o «falso» (−15 PC).
//
// Todo ocurre en una transacción: el veredicto en el reporte, los puntos y el
// nivel del autor (`users/{autor}/confianza/actual`, fuente de verdad) y su
// espejo en `users/{autor}` para la app actual. Las reglas comprueban cada cifra.
import { doc, runTransaction, serverTimestamp } from 'firebase/firestore'
import type { Firestore } from 'firebase/firestore'
import { FirebaseError } from 'firebase/app'
import { aplicarVeredicto } from './reglas'
import { leerConfianza, leerValidacion } from './tipos'

export const COMENTARIO_MAXIMO = 512

export type CodigoErrorVeredicto =
  | 'no_existe'
  | 'propio'
  | 'autor_sin_puntos'
  | 'ya_tiene'
  | 'sin_comentario'
  | 'rechazado'
  | 'desconocido'

export class ErrorVeredicto extends Error {
  readonly codigo: CodigoErrorVeredicto

  constructor(codigo: CodigoErrorVeredicto) {
    super(codigo)
    this.name = 'ErrorVeredicto'
    this.codigo = codigo
  }
}

export interface PedidoVeredicto {
  reportId: string
  veredicto: 'real' | 'falso'
  /** Obligatorio para «falso»; opcional para «real». */
  comentario: string
  /** uid de quien da el veredicto. */
  gestorUid: string
}

export interface ResultadoVeredicto {
  puntosAntes: number
  puntos: number
  nivelAntes: number
  nivel: number
  /** Lo que realmente se sumó o restó al autor (0 si ya estaba en el tope o en 0). */
  aplicados: number
}

export function mensajeDeErrorVeredicto(error: unknown): string {
  if (!(error instanceof ErrorVeredicto)) return 'No pudimos guardar el veredicto. Inténtalo nuevamente.'
  switch (error.codigo) {
    case 'no_existe':
      return 'Este reporte ya no existe.'
    case 'propio':
      return 'No puedes dar un veredicto a tu propio reporte.'
    case 'autor_sin_puntos':
      return 'Los reportes creados desde el portal por la administración no suman ni restan puntos.'
    case 'ya_tiene':
      return 'Este reporte ya tiene un veredicto y no se puede cambiar.'
    case 'sin_comentario':
      return 'Para marcar un reporte como falso debes escribir un comentario.'
    case 'rechazado':
      return 'No tienes permiso para dar un veredicto a este reporte. Solo puede hacerlo el operador asignado o un administrador.'
    default:
      return 'No pudimos guardar el veredicto. Inténtalo nuevamente.'
  }
}

export async function darVeredicto(db: Firestore, pedido: PedidoVeredicto): Promise<ResultadoVeredicto> {
  const comentario = pedido.comentario.trim()
  if (pedido.veredicto === 'falso' && comentario.length === 0) throw new ErrorVeredicto('sin_comentario')
  if (comentario.length > COMENTARIO_MAXIMO) throw new ErrorVeredicto('desconocido')

  const refReporte = doc(db, 'reports', pedido.reportId)

  try {
    return await runTransaction(db, async (tx) => {
      const reporte = await tx.get(refReporte)
      if (!reporte.exists()) throw new ErrorVeredicto('no_existe')
      const datos = reporte.data()
      const autor = typeof datos.uid === 'string' ? datos.uid : ''
      if (autor === pedido.gestorUid) throw new ErrorVeredicto('propio')
      // Los reportes que crea un administrador desde el portal no dan puntos.
      if (datos.origen === 'portal_admin') throw new ErrorVeredicto('autor_sin_puntos')
      if (leerValidacion(datos.validacion).veredicto !== null) throw new ErrorVeredicto('ya_tiene')

      const refConfianza = doc(db, 'users', autor, 'confianza', 'actual')
      const confianza = leerConfianza((await tx.get(refConfianza)).data())
      const esReal = pedido.veredicto === 'real'
      const r = aplicarVeredicto(confianza.puntosConfianza, pedido.veredicto)
      const validados = confianza.validatedReports + (esReal ? 1 : 0)

      tx.update(refReporte, {
        'validacion.veredicto': pedido.veredicto,
        'validacion.veredictoPor': pedido.gestorUid,
        'validacion.veredictoAt': serverTimestamp(),
        'validacion.veredictoPuntos': r.aplicados,
        ...(comentario ? { 'validacion.veredictoComentario': comentario } : {}),
        updatedAt: serverTimestamp(),
      })
      tx.set(refConfianza, {
        puntosConfianza: r.puntos,
        trustLevel: r.nivel,
        validatedReports: validados,
        reportesFalsos: confianza.reportesFalsos + (esReal ? 0 : 1),
        confirmacionesSuspendidas: confianza.confirmacionesSuspendidas,
        ultimoReporteId: pedido.reportId,
        updatedAt: serverTimestamp(),
      })
      // Espejo para la app actual, que todavía lee el nivel de users/{uid}.
      tx.update(doc(db, 'users', autor), {
        trustLevel: r.nivel,
        validatedReports: validados,
        updatedAt: serverTimestamp(),
      })

      return {
        puntosAntes: confianza.puntosConfianza,
        puntos: r.puntos,
        nivelAntes: confianza.trustLevel,
        nivel: r.nivel,
        aplicados: r.aplicados,
      }
    })
  } catch (error) {
    if (error instanceof ErrorVeredicto) throw error
    if (error instanceof FirebaseError && error.code === 'permission-denied') {
      throw new ErrorVeredicto('rechazado')
    }
    console.error('Veredicto: error inesperado.', error)
    throw new ErrorVeredicto('desconocido')
  }
}
