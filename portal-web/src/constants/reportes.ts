// Constantes del dominio "reportes", compartidas entre el mapa y el
// historial. Los valores (categoría/estado) coinciden con los enums que
// validan las Firestore Rules — ver firestore.rules, categoriaValida() y
// transicionValida().

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

export const ETIQUETA_POR_CATEGORIA: Record<string, string> = {
  microbasural: 'Microbasural',
  luminaria: 'Luminaria',
  fuga_agua: 'Fuga de agua',
  arbol_peligroso: 'Árbol peligroso',
  calle_deteriorada: 'Calle deteriorada',
  accesibilidad: 'Accesibilidad',
  otro: 'Otro',
}
