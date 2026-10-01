// Constantes de los estados de un reporte. Deben coincidir con
// transicionValida() en firestore.rules. Las categorías no están aquí: salen
// del catálogo /categorias (ver context/CategoriasContext.tsx).

/** Colores de estado (paleta "Ciudad Alerta", igual que la app móvil). */
export const COLOR_POR_ESTADO: Record<string, string> = {
  reportado: '#1ca9c9',
  en_revision: '#7fd3e4',
  derivado: '#a5b4c3',
  en_proceso: '#4a90a4',
  resuelto: '#f8fafc',
  cerrado: '#5c677d',
}

export const ESTADOS_EN_ORDEN = [
  'reportado',
  'en_revision',
  'derivado',
  'en_proceso',
  'resuelto',
  'cerrado',
]

export const ETIQUETA_POR_ESTADO: Record<string, string> = {
  reportado: 'Reportado',
  en_revision: 'En revisión',
  derivado: 'Derivado',
  en_proceso: 'En proceso',
  resuelto: 'Resuelto',
  cerrado: 'Cerrado',
}

/** Debe reflejar transicionValida() en firestore.rules. */
export const TRANSICIONES: Record<string, string[]> = {
  reportado: ['en_revision', 'derivado', 'cerrado'],
  en_revision: ['derivado', 'cerrado'],
  derivado: ['en_proceso', 'cerrado'],
  en_proceso: ['resuelto', 'cerrado'],
  resuelto: ['cerrado'],
  cerrado: [],
}
