/**
 * Códigos territoriales oficiales (CUT): la comuna tiene 5 dígitos y los 2
 * primeros son su región. Las municipalidades tienen id `muni_<CUT>`.
 */

/** "5101" → "05101": algunas fuentes guardan el CUT como número y pierden el cero. */
export function normalizarCut(codigo: string | number): string {
  return String(codigo).padStart(5, '0');
}

/** "13119" → "13" (Metropolitana). */
export function codigoRegionDeComuna(cut: string | number): string {
  return normalizarCut(cut).slice(0, 2);
}

/** "muni_13101" → "13101"; null si el id no es de una municipalidad. */
export function cutDeOrganismo(organismoId: string | null | undefined): string | null {
  return /^muni_(\d{5})$/.exec(organismoId ?? '')?.[1] ?? null;
}

/** "Región del Libertador Bernardo O'Higgins" → "Libertador Bernardo O'Higgins". */
export function nombreCortoRegion(nombre: string): string {
  return nombre.replace(/^Región\s+(del\s+|de\s+)?/i, '').trim() || nombre;
}
