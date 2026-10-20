/** Largo de la descripción. Lo validan el formulario y `descripcionValida()` de las reglas. */
export const DESCRIPCION_MIN = 10;
export const DESCRIPCION_MAX = 500;

export type ProblemaDescripcion = 'vacia' | 'corta' | 'larga' | null;

/**
 * La app guarda la descripción sin los espacios de los extremos, así que se
 * mide igual que en las reglas (largo del texto guardado).
 */
export function problemaDescripcion(texto: string | null | undefined): ProblemaDescripcion {
  const limpio = (texto ?? '').trim();
  if (limpio.length === 0) return 'vacia';
  if (limpio.length < DESCRIPCION_MIN) return 'corta';
  if (limpio.length > DESCRIPCION_MAX) return 'larga';
  return null;
}
