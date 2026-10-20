/**
 * Protección de privacidad de las fotos: los mismos números en la app y en el
 * portal, para que ambos difuminen igual. Antes estaban copiados a mano en
 * privacidad.service.ts (app) y privacidad.ts (portal).
 */

/**
 * Umbral bajo a propósito para detectar personas: difuminar algo que no era
 * una persona cuesta poco; publicar un rostro sin difuminar es lo que se debe evitar.
 */
export const CONFIANZA_PERSONA = 0.35;

/** Personas como máximo que se buscan en una foto. */
export const MAXIMO_PERSONAS = 30;

/** Calidad JPEG de la foto ya protegida. */
export const CALIDAD_SALIDA = 0.6;

/**
 * Ampliación de la caja de un rostro, como fracción de su ancho y alto, para
 * cubrir frente, cabello, orejas y mentón.
 */
export const MARGEN_ROSTRO = { lados: 0.3, arriba: 0.45, abajo: 0.25 } as const;

/**
 * Zona de la cabeza dentro de la caja de una persona completa: el cuarto
 * superior (un poco más), todo el ancho, empezando apenas sobre la caja.
 */
export const ZONA_CABEZA = { desdeArriba: -0.03, alto: 0.28 } as const;

/** Lo que se guarda en el reporte. Lo exige la regla `fotoProtegida()`. */
export interface InfoPrivacidad {
  aplicada: boolean;
  /** Rostros detectados y difuminados. */
  rostros: number;
  /** Personas lejanas cuya cabeza se difuminó sin detectar el rostro. */
  personas: number;
  /** Modelos usados, para auditar o reprocesar si cambian. */
  version: string;
}

/** Identificador de los modelos que corrieron. */
export function versionDeModelos(conDetectorDeRostros: boolean): string {
  return conDetectorDeRostros ? 'mediapipe-face-full+coco-ssd-lite-v2' : 'coco-ssd-lite-v2';
}
