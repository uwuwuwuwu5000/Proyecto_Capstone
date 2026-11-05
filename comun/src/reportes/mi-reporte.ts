/**
 * Lo que el autor puede hacer con su propio reporte mientras nadie lo ha
 * revisado (estado «reportado»): corregir la descripción o retirarlo
 * (historia J3).
 *
 * Extraído de la app móvil (mi-reporte.service.ts) para que las dos
 * aplicaciones apliquen la misma condición que `edicionDelAutorValida()` y
 * `retiroDelAutorValido()` de firestore.rules. Cada una pone su acceso a
 * datos: aquí solo van las condiciones y los textos.
 */

/** Largo máximo del motivo al retirar un reporte (las reglas aceptan hasta 512). */
export const MOTIVO_RETIRO_MAXIMO = 300;

/** Firma pública del retiro en el historial: no se muestra el nombre de la persona. */
export const FIRMA_DEL_AUTOR = 'Quien lo reportó';

/** Lo mínimo de `validacion` que hace falta para saber si hubo confirmaciones. */
export interface ValidacionConVotos {
  votos?: number | null;
  puntos?: number | null;
}

/** Si el reporte ya recibió confirmaciones con peso (puntos o votos en `validacion`). */
export function tieneVotosConPeso(validacion: ValidacionConVotos | null | undefined): boolean {
  return (validacion?.votos ?? 0) > 0 || (validacion?.puntos ?? 0) > 0;
}

/** Lo mínimo de un reporte para decidir qué puede hacer su autor. */
export interface ReporteDelAutor {
  uid?: string | null;
  estado: string;
  validacion?: ValidacionConVotos | null;
}

/** El autor, mientras el reporte siga en «reportado»: puede retirarlo. */
export function puedeModificarReporte(reporte: ReporteDelAutor, uidActual: string | null | undefined): boolean {
  return !!uidActual && reporte.uid === uidActual && reporte.estado === 'reportado';
}

/**
 * Corregir la descripción, además, solo mientras nadie lo haya confirmado con
 * peso: los vecinos votaron por ese texto. Retirarlo sigue permitido.
 */
export function puedeCorregirReporte(reporte: ReporteDelAutor, uidActual: string | null | undefined): boolean {
  return puedeModificarReporte(reporte, uidActual) && !tieneVotosConPeso(reporte.validacion);
}

/** Comentario de la entrada del historial al retirar; el motivo es opcional. */
export function comentarioDeRetiro(motivo = ''): string {
  const detalle = motivo.trim().slice(0, MOTIVO_RETIRO_MAXIMO);
  return detalle ? `Retirado por quien lo reportó: ${detalle}` : 'Retirado por quien lo reportó.';
}
