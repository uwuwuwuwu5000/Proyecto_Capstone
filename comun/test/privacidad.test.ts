import { describe, expect, it } from 'vitest';

import { CONFIANZA_PERSONA, ampliarRostro, recortar, seSolapan, tamanoReducido, versionDeModelos, zonaCabeza, zonasADifuminar } from '../src';

const lienzo = { width: 1000, height: 800 };

describe('privacidad: geometría', () => {
  it('amplía el rostro hacia frente, cabello y mentón', () => {
    expect(ampliarRostro({ x: 100, y: 100, ancho: 100, alto: 100 }, lienzo)).toEqual({ x: 70, y: 55, ancho: 160, alto: 170 });
  });

  it('nunca se sale de la imagen', () => {
    const caja = ampliarRostro({ x: 0, y: 0, ancho: 100, alto: 100 }, lienzo);
    expect(caja.x).toBe(0);
    expect(caja.y).toBe(0);
    expect(recortar({ x: 950, y: 750, ancho: 200, alto: 200 }, lienzo)).toEqual({ x: 950, y: 750, ancho: 50, alto: 50 });
  });

  it('la cabeza es la parte superior de la persona', () => {
    const cabeza = zonaCabeza({ x: 200, y: 100, ancho: 80, alto: 400 }, lienzo);
    expect(cabeza.x).toBe(200);
    expect(cabeza.y).toBeCloseTo(88, 9);
    expect(cabeza.ancho).toBe(80);
    expect(cabeza.alto).toBeCloseTo(112, 9);
  });

  it('no difumina dos veces la cabeza de quien ya tiene el rostro detectado', () => {
    const rostro = { x: 210, y: 110, ancho: 40, alto: 50 };
    const conRostro = { x: 200, y: 100, ancho: 80, alto: 400 };
    const lejana = { x: 700, y: 300, ancho: 30, alto: 120 };
    const zonas = zonasADifuminar([rostro], [conRostro, lejana], lienzo);
    expect(zonas.rostros).toHaveLength(1);
    expect(zonas.cabezas).toHaveLength(1);
    expect(seSolapan(zonas.cabezas[0], rostro)).toBe(false);
  });

  it('pixelado de entre 2 y 8 bloques a lo ancho', () => {
    expect(tamanoReducido({ x: 0, y: 0, ancho: 6, alto: 6 })).toEqual({ ancho: 2, alto: 2 });
    expect(tamanoReducido({ x: 0, y: 0, ancho: 600, alto: 300 })).toEqual({ ancho: 8, alto: 4 });
  });
});

describe('privacidad: parámetros', () => {
  it('umbral bajo a propósito y versión según los modelos', () => {
    expect(CONFIANZA_PERSONA).toBeLessThan(0.5);
    expect(versionDeModelos(true)).toBe('mediapipe-face-full+coco-ssd-lite-v2');
    expect(versionDeModelos(false)).toBe('coco-ssd-lite-v2');
  });
});
