/**
 * Por qué una cuenta no puede confirmar un reporte.
 *
 * Es la misma decisión que repiten las reglas de Firestore y la transacción de confirmar en cada
 * aplicación: una sola copia para que el portal y la app no se desfasen (el portal no sabía que las
 * reglas rechazan confirmar un reporte cerrado). Cada aplicación reúne los datos y muestra el motivo.
 */

export type MotivoBloqueo =
  | 'confirmado'
  | 'propio'
  | 'operador'
  | 'organismo'
  | 'cerrado'
  | 'revisado'
  | 'suspendido'
  | 'limite'
  | 'pausa';

/** Resuelto o cerrado (también retirado por quien lo reportó): ya no se confirma. */
export function estaCerrado(estado: unknown): boolean {
  return estado === 'resuelto' || estado === 'cerrado';
}

/**
 * Por qué no puede confirmar, en orden de importancia, o null si puede.
 * `confirmado` (ya confirmó este reporte) lo decide cada aplicación con sus datos: aquí no se devuelve.
 */
export function motivoDeBloqueo(datos: {
  propio: boolean;
  operador: boolean;
  /** Cuenta de organismo: recibe los reportes ya validados, no los confirma. */
  organismo?: boolean;
  estadoReporte: unknown;
  conVeredicto: boolean;
  suspendido: boolean;
  restantesHoy: number;
  pausaRestanteMs: number;
}): MotivoBloqueo | null {
  if (datos.propio) return 'propio';
  if (datos.operador) return 'operador';
  if (datos.organismo) return 'organismo';
  // Un reporte cerrado o retirado ya no necesita confirmaciones.
  if (estaCerrado(datos.estadoReporte)) return 'cerrado';
  if (datos.conVeredicto) return 'revisado';
  if (datos.suspendido) return 'suspendido';
  if (datos.restantesHoy <= 0) return 'limite';
  if (datos.pausaRestanteMs > 0) return 'pausa';
  return null;
}
