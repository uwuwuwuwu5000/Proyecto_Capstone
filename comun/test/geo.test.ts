import { describe, expect, it } from 'vitest';

import { areaDeCaja, cajaDePuntos, cajaDesdeGeoJson, dentroDeCaja, distanciaMetros, formatearDistancia, unirCajas } from '../src';

describe('distancias', () => {
  it('Maipú a Cerrillos, unos 4 km', () => {
    const d = distanciaMetros({ lat: -33.5101, lng: -70.7572 }, { lat: -33.4975, lng: -70.7158 });
    expect(d).toBeGreaterThan(3800);
    expect(d).toBeLessThan(4200);
  });

  it('el mismo punto está a 0 m y la distancia es simétrica', () => {
    const a = { lat: -33.45, lng: -70.66 };
    const b = { lat: -36.82, lng: -73.05 };
    expect(distanciaMetros(a, a)).toBe(0);
    expect(distanciaMetros(a, b)).toBeCloseTo(distanciaMetros(b, a), 6);
  });

  it('formato en metros o kilómetros', () => {
    expect(formatearDistancia(347)).toBe('347 m');
    expect(formatearDistancia(347, { aproximada: true })).toBe('350 m aprox.');
    expect(formatearDistancia(3, { aproximada: true })).toBe('10 m aprox.');
    expect(formatearDistancia(1234)).toBe('1,2 km');
    expect(formatearDistancia(1250, { aproximada: true })).toBe('1,3 km aprox.');
  });
});

describe('cajas', () => {
  it('caja de puntos, unión y pertenencia', () => {
    const caja = cajaDePuntos([
      { lat: -33.51, lng: -70.76 },
      { lat: -33.46, lng: -70.68 },
    ])!;
    expect(caja).toEqual({ minLat: -33.51, minLng: -70.76, maxLat: -33.46, maxLng: -70.68 });
    expect(dentroDeCaja({ lat: -33.5, lng: -70.7 }, caja)).toBe(true);
    expect(dentroDeCaja({ lat: -33.0, lng: -70.7 }, caja)).toBe(false);
    expect(cajaDePuntos([])).toBeNull();
    expect(unirCajas(null, caja)).toBe(caja);
    expect(unirCajas(caja, { minLat: -34, minLng: -71, maxLat: -33.6, maxLng: -70.9 })).toEqual({
      minLat: -34, minLng: -71, maxLat: -33.46, maxLng: -70.68,
    });
    expect(areaDeCaja(caja)).toBeCloseTo(0.05 * 0.08, 10);
  });

  it('lee el formato [minLng, minLat, maxLng, maxLat] de GeoJSON', () => {
    expect(cajaDesdeGeoJson([-71.7, -34.3, -69.8, -32.9])).toEqual({ minLng: -71.7, minLat: -34.3, maxLng: -69.8, maxLat: -32.9 });
  });
});
