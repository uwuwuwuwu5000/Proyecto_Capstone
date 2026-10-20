/**
 * Parámetros del mapa de incidencias. Cambiarlos aquí basta: ninguna otra
 * parte de la app los repite.
 */
export const PARAMETROS_MAPA = {
  /**
   * Reportes de una región como máximo, los más recientes. Con más, el mapa
   * lo dice en pantalla. 500 alcanza para el piloto y mantiene la carga en
   * una sola consulta de Firestore.
   */
  maximoPorRegion: 500,

  /**
   * Suma los reportes antiguos que no tienen el campo `region`, buscándolos
   * por comuna (2 consultas más en la Metropolitana). Cuando todos los
   * reportes tengan región (scripts/ubicaciones-reportes.mjs --aplicar),
   * ponlo en false: ahorra esas lecturas.
   */
  incluirSinRegion: true,
} as const;
