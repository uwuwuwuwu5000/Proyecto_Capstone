/**
 * Categorías del piloto. Deben coincidir con `categoriaValida()` de
 * firestore.rules. El portal además lee un catálogo editable desde la
 * colección `categorias`; estas son las que la app ofrece al reportar.
 */
export type CategoriaReporte =
  | 'microbasural'
  | 'luminaria'
  | 'fuga_agua'
  | 'arbol_peligroso'
  | 'calle_deteriorada'
  | 'accesibilidad'
  | 'otro';

export interface DefinicionCategoria {
  readonly id: CategoriaReporte;
  readonly etiqueta: string;
}

export const CATEGORIAS: readonly DefinicionCategoria[] = [
  { id: 'microbasural', etiqueta: 'Microbasural' },
  { id: 'luminaria', etiqueta: 'Luminaria dañada' },
  { id: 'fuga_agua', etiqueta: 'Fuga de agua' },
  { id: 'arbol_peligroso', etiqueta: 'Árbol peligroso' },
  { id: 'calle_deteriorada', etiqueta: 'Calle deteriorada' },
  { id: 'accesibilidad', etiqueta: 'Problema de accesibilidad' },
  { id: 'otro', etiqueta: 'Otro' },
];

const ETIQUETAS: ReadonlyMap<string, string> = new Map(CATEGORIAS.map((c) => [c.id, c.etiqueta]));

export function esCategoria(valor: unknown): valor is CategoriaReporte {
  return typeof valor === 'string' && ETIQUETAS.has(valor);
}

/**
 * Nombre legible ("luminaria" → "Luminaria dañada"). Un id que no está en la
 * lista (un reporte antiguo o una categoría del catálogo del portal) se
 * devuelve tal cual para no mostrar un hueco.
 */
export function etiquetaCategoria(id: string | null | undefined): string {
  if (!id) return 'Sin categoría';
  return ETIQUETAS.get(id) ?? id;
}
