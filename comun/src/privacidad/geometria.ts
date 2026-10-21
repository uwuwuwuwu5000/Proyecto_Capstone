import { MARGEN_ROSTRO, ZONA_CABEZA } from './parametros';

/** Rectángulo en píxeles de la imagen. */
export interface Caja {
  x: number;
  y: number;
  ancho: number;
  alto: number;
}

export interface Lienzo {
  width: number;
  height: number;
}

/** Recorta una caja para que no se salga de la imagen. */
export function recortar(caja: Caja, lienzo: Lienzo): Caja {
  const x = Math.max(0, caja.x);
  const y = Math.max(0, caja.y);
  return {
    x,
    y,
    ancho: Math.min(lienzo.width - x, caja.ancho - (x - caja.x)),
    alto: Math.min(lienzo.height - y, caja.alto - (y - caja.y)),
  };
}

/**
 * El detector entrega una caja ajustada a los rasgos. Se amplía para cubrir
 * frente, cabello, orejas y mentón, que también permiten reconocer a alguien.
 */
export function ampliarRostro(rostro: Caja, lienzo: Lienzo): Caja {
  const margenX = rostro.ancho * MARGEN_ROSTRO.lados;
  const margenArriba = rostro.alto * MARGEN_ROSTRO.arriba;
  const margenAbajo = rostro.alto * MARGEN_ROSTRO.abajo;
  return recortar(
    {
      x: rostro.x - margenX,
      y: rostro.y - margenArriba,
      ancho: rostro.ancho + margenX * 2,
      alto: rostro.alto + margenArriba + margenAbajo,
    },
    lienzo,
  );
}

/**
 * Zona de la cabeza a partir de la caja de una persona completa. La cabeza
 * ocupa aproximadamente el séptimo superior del cuerpo; se toma algo más del
 * cuarto superior y todo el ancho, para no fallar con personas agachadas, de
 * perfil o cortadas por el borde de la foto.
 */
export function zonaCabeza(persona: Caja, lienzo: Lienzo): Caja {
  return recortar(
    {
      x: persona.x,
      y: persona.y + persona.alto * ZONA_CABEZA.desdeArriba,
      ancho: persona.ancho,
      alto: persona.alto * ZONA_CABEZA.alto,
    },
    lienzo,
  );
}

export function seSolapan(a: Caja, b: Caja): boolean {
  return a.x < b.x + b.ancho && a.x + a.ancho > b.x && a.y < b.y + b.alto && a.y + a.alto > b.y;
}

/**
 * Qué difuminar: cada rostro ampliado (elipse) y la cabeza de cada persona
 * cuya zona no contenga ya un rostro detectado.
 */
export function zonasADifuminar(
  rostros: readonly Caja[],
  personas: readonly Caja[],
  lienzo: Lienzo,
): { rostros: Caja[]; cabezas: Caja[] } {
  const cabezas = personas
    .map((persona) => zonaCabeza(persona, lienzo))
    .filter((cabeza) => !rostros.some((rostro) => seSolapan(rostro, cabeza)));
  return { rostros: rostros.map((rostro) => ampliarRostro(rostro, lienzo)), cabezas };
}

/** Tamaño reducido para el pixelado: unos 6 bloques a lo ancho, entre 2 y 8. */
export function tamanoReducido(zona: Caja): { ancho: number; alto: number } {
  const ancho = Math.max(2, Math.min(8, Math.round(zona.ancho / 6)));
  return { ancho, alto: Math.max(2, Math.round(ancho * (zona.alto / zona.ancho))) };
}
