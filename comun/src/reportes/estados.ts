/**
 * Ciclo de vida de un reporte. Debe coincidir con `transicionValida()` de
 * firestore.rules: las reglas son las que mandan.
 */
export type EstadoReporte =
  | 'reportado'
  | 'en_revision'
  | 'derivado'
  | 'en_proceso'
  | 'resuelto'
  | 'cerrado';

/** En el orden del flujo, para listas y filtros. */
export const ESTADOS_EN_ORDEN: readonly EstadoReporte[] = [
  'reportado',
  'en_revision',
  'derivado',
  'en_proceso',
  'resuelto',
  'cerrado',
];

export const ETIQUETAS_ESTADO: Readonly<Record<EstadoReporte, string>> = {
  reportado: 'Reportado',
  en_revision: 'En revisión',
  derivado: 'Derivado',
  en_proceso: 'En proceso',
  resuelto: 'Resuelto',
  cerrado: 'Cerrado',
};

/**
 * Color de cada estado en mapas y listas.
 *
 * `resuelto` es verde y no blanco: el blanco de la paleta casi no se veía
 * sobre los mapas claros de OpenStreetMap (v2-B8 de la app). El portal
 * todavía usa el blanco; al adoptar este paquete pasa a verde.
 */
export const COLORES_ESTADO: Readonly<Record<EstadoReporte, string>> = {
  reportado: '#1ca9c9',
  en_revision: '#7fd3e4',
  derivado: '#a5b4c3',
  en_proceso: '#4a90a4',
  resuelto: '#3fbf8f',
  cerrado: '#5c677d',
};

/** Transiciones permitidas. Las mismas que `transicionValida()` de las reglas. */
export const TRANSICIONES: Readonly<Record<EstadoReporte, readonly EstadoReporte[]>> = {
  reportado: ['en_revision', 'derivado', 'cerrado'],
  en_revision: ['derivado', 'cerrado'],
  derivado: ['en_proceso', 'cerrado'],
  en_proceso: ['resuelto', 'cerrado'],
  resuelto: ['cerrado'],
  cerrado: [],
};

/** Estados en que el reporte ya no requiere trabajo. */
export const ESTADOS_FINALIZADOS: readonly EstadoReporte[] = ['resuelto', 'cerrado'];

export function esEstado(valor: unknown): valor is EstadoReporte {
  return typeof valor === 'string' && (ESTADOS_EN_ORDEN as readonly string[]).includes(valor);
}

export function transicionValida(desde: EstadoReporte, hacia: EstadoReporte): boolean {
  return TRANSICIONES[desde].includes(hacia);
}

export function transicionesDisponibles(desde: EstadoReporte): readonly EstadoReporte[] {
  return TRANSICIONES[desde];
}

export function estaFinalizado(estado: EstadoReporte): boolean {
  return ESTADOS_FINALIZADOS.includes(estado);
}

/** Etiqueta de un estado; un valor desconocido se muestra tal cual. */
export function etiquetaEstado(estado: string): string {
  return esEstado(estado) ? ETIQUETAS_ESTADO[estado] : estado;
}
