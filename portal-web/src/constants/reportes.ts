// Estados de un reporte. La definición vive en `comun/` (paquete compartido con
// la app móvil), así que el portal y la app muestran los mismos nombres, colores
// y transiciones. Deben coincidir con transicionValida() en firestore.rules.
// Las categorías no están aquí: salen del catálogo /categorias (ver
// context/CategoriasContext.tsx).
//
// Este archivo conserva los nombres que ya usaba el portal; solo los alimenta
// desde `comun`.
import { COLORES_ESTADO, ESTADOS_EN_ORDEN as ESTADOS, ETIQUETAS_ESTADO, TRANSICIONES as TRANSICIONES_COMUN } from '@ciudad-alerta/comun'

/**
 * Colores de estado (paleta «Ciudad Alerta»). «Resuelto» es verde, igual que en
 * la app móvil: el blanco casi no se veía sobre el mapa.
 */
export const COLOR_POR_ESTADO: Record<string, string> = { ...COLORES_ESTADO }

export const ESTADOS_EN_ORDEN: string[] = [...ESTADOS]

export const ETIQUETA_POR_ESTADO: Record<string, string> = { ...ETIQUETAS_ESTADO }

/** Debe reflejar transicionValida() en firestore.rules. */
export const TRANSICIONES: Record<string, string[]> = Object.fromEntries(
  Object.entries(TRANSICIONES_COMUN).map(([desde, hacia]) => [desde, [...hacia]]),
)
