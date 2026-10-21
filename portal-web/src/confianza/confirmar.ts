// Confirmación comunitaria con peso (sistema_confianza.md, sección 5.3).
//
// Todo ocurre en una transacción: la confirmación con su nivel y su peso, la
// suma en el mapa `validacion` del reporte y el contador de confirmaciones del
// día. Las reglas de Firestore comprueban cada cifra, así que aquí se calcula
// exactamente lo mismo que ellas (src/confianza/reglas.ts).
import { doc, runTransaction, serverTimestamp } from 'firebase/firestore'
import type { Firestore } from 'firebase/firestore'
import { FirebaseError } from 'firebase/app'
import { PAUSA_ENTRE_CONFIRMACIONES_MS, limiteDiario, numeroDeDia, pesoDelVoto, sumarVoto } from './reglas'
import { leerConfianza, leerValidacion } from './tipos'

export type CodigoErrorConfirmacion =
  | 'no_existe'
  | 'propio'
  | 'ya_confirmo'
  | 'suspendido'
  | 'limite'
  | 'pausa'
  | 'rechazada'
  | 'desconocido'

export class ErrorConfirmacion extends Error {
  readonly codigo: CodigoErrorConfirmacion
  /** Para 'pausa': segundos que faltan. */
  readonly segundos?: number

  constructor(codigo: CodigoErrorConfirmacion, segundos?: number) {
    super(codigo)
    this.name = 'ErrorConfirmacion'
    this.codigo = codigo
    this.segundos = segundos
  }
}

export interface PedidoConfirmacion {
  reportId: string
  uid: string
  /** `email_verified` del token (lo que ven las reglas), no del perfil. */
  correoVerificado: boolean
  /** Cuándo se creó el perfil (ms); null si no se sabe: el voto pesa 0. */
  creadaEnMs: number | null
}

export interface ResultadoConfirmacion {
  nivel: number
  peso: number
  puntos: number
  votos: number
  validado: boolean
  recienValidado: boolean
  /** Por qué el voto pesó 0, si pesó 0. */
  motivoPesoCero: 'correo' | 'antiguedad' | null
}

/** Mensaje en español para cada error, listo para mostrar. */
export function mensajeDeError(error: unknown): string {
  if (!(error instanceof ErrorConfirmacion)) return 'No pudimos registrar tu confirmación.'
  switch (error.codigo) {
    case 'propio':
      return 'No puedes confirmar tu propio reporte.'
    case 'ya_confirmo':
      return 'Ya confirmaste este reporte.'
    case 'suspendido':
      return 'Tus confirmaciones están suspendidas por la administración.'
    case 'limite':
      return 'Llegaste al límite de confirmaciones de hoy. Vuelve mañana.'
    case 'pausa':
      return `Espera ${error.segundos ?? 20} segundos antes de confirmar otro reporte.`
    case 'no_existe':
      return 'Este reporte ya no existe.'
    case 'rechazada':
      return 'No pudimos registrar tu confirmación. Espera unos segundos e inténtalo de nuevo.'
    default:
      return 'No pudimos registrar tu confirmación.'
  }
}

/** Texto amarillo cuando la confirmación se registró pero su voto pesa 0. */
export function avisoPesoCero(motivo: 'correo' | 'antiguedad'): string {
  return motivo === 'correo'
    ? 'Tu confirmación ha sido registrada. Debes verificar tu correo para que tu validación tenga peso.'
    : 'Tu confirmación ha sido registrada. Tu cuenta debe tener más de 24 horas para que tu validación tenga peso.'
}

async function intentar(db: Firestore, pedido: PedidoConfirmacion): Promise<ResultadoConfirmacion> {
  const ahora = Date.now()
  const dia = String(numeroDeDia(ahora))
  const refReporte = doc(db, 'reports', pedido.reportId)
  const refConfirmacion = doc(db, 'reports', pedido.reportId, 'confirmations', pedido.uid)
  const refConfianza = doc(db, 'users', pedido.uid, 'confianza', 'actual')
  const refLimite = doc(db, 'users', pedido.uid, 'limites', dia)

  return runTransaction(db, async (tx) => {
    const [reporte, yaConfirmo, confianzaSnap, limite] = await Promise.all([
      tx.get(refReporte),
      tx.get(refConfirmacion),
      tx.get(refConfianza),
      tx.get(refLimite),
    ])

    if (!reporte.exists()) throw new ErrorConfirmacion('no_existe')
    if (reporte.data().uid === pedido.uid) throw new ErrorConfirmacion('propio')
    if (yaConfirmo.exists()) throw new ErrorConfirmacion('ya_confirmo')

    const confianza = leerConfianza(confianzaSnap.data())
    if (confianza.confirmacionesSuspendidas) throw new ErrorConfirmacion('suspendido')

    const nivel = confianza.trustLevel
    const hechasHoy = limite.exists() && typeof limite.data().confirmaciones === 'number' ? limite.data().confirmaciones : 0
    if (hechasHoy >= limiteDiario(nivel)) throw new ErrorConfirmacion('limite')

    const ultima = limite.data()?.ultimaAt
    const ultimaMs = typeof ultima?.toMillis === 'function' ? ultima.toMillis() : null
    if (ultimaMs !== null && ahora - ultimaMs < PAUSA_ENTRE_CONFIRMACIONES_MS) {
      throw new ErrorConfirmacion('pausa', Math.ceil((PAUSA_ENTRE_CONFIRMACIONES_MS - (ahora - ultimaMs)) / 1000))
    }

    const peso = pesoDelVoto(nivel, pedido.correoVerificado, pedido.creadaEnMs, ahora)
    const antes = leerValidacion(reporte.data().validacion)
    const suma = sumarVoto(antes, peso)

    tx.set(refConfirmacion, {
      uid: pedido.uid,
      reportId: pedido.reportId,
      createdAt: serverTimestamp(),
      nivel,
      peso,
    })
    // Un voto de peso 0 no cambia la verificación: no hace falta escribir el reporte.
    if (peso > 0) {
      tx.update(refReporte, {
        'validacion.puntos': suma.puntos,
        'validacion.votos': suma.votos,
        'validacion.validado': suma.validado,
        ...(suma.recienValidado ? { 'validacion.validadoAt': serverTimestamp() } : {}),
      })
    }
    if (limite.exists()) {
      tx.update(refLimite, { confirmaciones: hechasHoy + 1, ultimaAt: serverTimestamp() })
    } else {
      tx.set(refLimite, { confirmaciones: 1, ultimaAt: serverTimestamp() })
    }

    return {
      nivel,
      peso,
      puntos: suma.puntos,
      votos: suma.votos,
      validado: suma.validado,
      recienValidado: suma.recienValidado,
      motivoPesoCero: peso > 0 ? null : pedido.correoVerificado ? ('antiguedad' as const) : ('correo' as const),
    }
  })
}

/**
 * Confirma un reporte. Si las reglas lo rechazan (por ejemplo, porque el reloj
 * del teléfono difiere unos segundos del servidor cerca del cambio de día),
 * se repite una sola vez recalculando todo; si vuelve a fallar, se informa.
 */
export async function confirmarReporte(db: Firestore, pedido: PedidoConfirmacion): Promise<ResultadoConfirmacion> {
  const esRechazo = (e: unknown) => e instanceof FirebaseError && e.code === 'permission-denied'
  try {
    return await intentar(db, pedido)
  } catch (primero) {
    if (primero instanceof ErrorConfirmacion) throw primero
    if (!esRechazo(primero)) {
      console.error('Confirmar: error inesperado.', primero)
      throw new ErrorConfirmacion('desconocido')
    }
  }
  try {
    return await intentar(db, pedido)
  } catch (segundo) {
    if (segundo instanceof ErrorConfirmacion) throw segundo
    console.error('Confirmar: las reglas rechazaron la confirmación.', segundo)
    throw new ErrorConfirmacion(esRechazo(segundo) ? 'rechazada' : 'desconocido')
  }
}
