/**
 * "Ñuñoa" → "nunoa", "Til Til" → "til til": para comparar nombres de comunas
 * entre fuentes que escriben distinto (tildes, mayúsculas, signos).
 */
export function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
