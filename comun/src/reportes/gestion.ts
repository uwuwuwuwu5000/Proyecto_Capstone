/**
 * Gestión de un reporte: quién puede cambiar su estado y qué datos de
 * resolución acompañan al cambio (historia F12).
 *
 * Las dos aplicaciones escriben el mismo cambio de estado contra las mismas
 * reglas; si una calcula distinto, las reglas la rechazan.
 */
import type { EstadoReporte } from './estados';

/** Lo mínimo del perfil de quien gestiona. */
export interface PerfilGestor {
  /** 'admin', 'operador' o 'ciudadano'. */
  rol?: string | null;
  /** Operador que representa la cuenta (solo rol operador). */
  operadorId?: string | null;
}

export interface PermisoGestion {
  /** Tiene un rol de gestión, sea o no responsable de este reporte. */
  esGestor: boolean;
  /** Puede cambiar el estado de este reporte. */
  puede: boolean;
  /** Por qué un gestor no puede cambiar este reporte; null si puede o si no es gestor. */
  motivo: string | null;
}

/**
 * Replica la regla `puedeGestionarReporte()` de firestore.rules: un admin
 * gestiona cualquier reporte; un operador, solo los que tienen su
 * `operadorId`. Mostrar los botones a quien no puede termina en un
 * «sin permisos» al confirmar.
 */
export function permisoDeGestion(
  perfil: PerfilGestor | null,
  reporte: { operadorId?: string | null },
): PermisoGestion {
  const rol = perfil?.rol;

  if (rol === 'admin') {
    return { esGestor: true, puede: true, motivo: null };
  }

  if (rol === 'operador') {
    const esSuyo = !!perfil?.operadorId && reporte.operadorId === perfil.operadorId;
    if (esSuyo) return { esGestor: true, puede: true, motivo: null };
    return {
      esGestor: true,
      puede: false,
      motivo: reporte.operadorId
        ? 'Este reporte está asignado a otro operador. Solo él o un administrador pueden cambiar su estado.'
        : 'Este reporte no tiene operador asignado. Un administrador puede asignarlo o cambiar su estado.',
    };
  }

  return { esGestor: false, puede: false, motivo: null };
}

/**
 * Tolerancia de las reglas para `tiempoResolucionMs` frente a la hora del
 * servidor (`cambioDeEstadoValido()` en firestore.rules): 15 minutos.
 */
export const TOLERANCIA_TIEMPO_RESOLUCION_MS = 15 * 60_000;

/**
 * Datos de resolución que van junto al cambio de estado. Cada aplicación los
 * traduce a campos de Firestore con su SDK:
 *
 * - `resuelto`: `resueltoAt` (hora del servidor) y `tiempoResolucionMs`.
 * - `cerrado_sin_resolver`: `cerradoSinResolverAt` (hora del servidor).
 */
export type ResolucionDelCambio =
  | { tipo: 'resuelto'; tiempoResolucionMs: number }
  | { tipo: 'cerrado_sin_resolver' }
  | null;

/**
 * @param desde     Estado actual del reporte.
 * @param hacia     Estado nuevo.
 * @param creadoMs  `createdAt` del reporte en milisegundos; null si no se conoce
 *                  (sin él no se puede calcular el tiempo y no se envía nada).
 * @param ahoraMs   Hora del dispositivo; las reglas toleran 15 minutos de desvío.
 */
export function resolucionDelCambio(
  desde: EstadoReporte,
  hacia: EstadoReporte,
  creadoMs: number | null,
  ahoraMs: number = Date.now(),
): ResolucionDelCambio {
  if (hacia === 'resuelto' && creadoMs !== null) {
    // Nunca negativo: el reloj de quien creó el reporte pudo ir adelantado.
    return { tipo: 'resuelto', tiempoResolucionMs: Math.max(0, Math.round(ahoraMs - creadoMs)) };
  }
  if (hacia === 'cerrado' && desde !== 'resuelto') {
    return { tipo: 'cerrado_sin_resolver' };
  }
  return null;
}
