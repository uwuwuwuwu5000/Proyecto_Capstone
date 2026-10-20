/**
 * Parámetros del mapa de incidencias. Cambiarlos aquí basta: ninguna otra
 * parte de la app los repite.
 */
export const PARAMETROS_MAPA = {
  /** Primera búsqueda alrededor del usuario. Cubre el zoom 14 de un teléfono. */
  radioInicialMetros: 3000,
  /** «Buscar en esta zona» nunca consulta menos que esto. */
  radioMinimoMetros: 500,
  /**
   * Ni más que esto: con el mapa muy alejado, la consulta por geohash traería
   * miles de reportes. 10 km cubren una comuna grande de Santiago.
   */
  radioMaximoMetros: 10_000,
  /** El botón aparece si el centro se movió más de esta fracción del radio buscado… */
  umbralDesplazamiento: 0.35,
  /** …o si la zona visible es esta cantidad de veces más grande que la buscada. */
  umbralAlejamiento: 1.25,
} as const;
