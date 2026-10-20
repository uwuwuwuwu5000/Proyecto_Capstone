import { describe, expect, it } from 'vitest';

import {
  agruparPorComuna,
  codigoRegionDeComuna,
  cutDeOrganismo,
  nombreCortoRegion,
  normalizar,
  normalizarCut,
  rangosDeTramos,
  tramoDeIntensidad,
} from '../src';

describe('nombres y códigos', () => {
  it('normaliza nombres de comunas entre fuentes', () => {
    expect(normalizar('Ñuñoa')).toBe('nunoa');
    expect(normalizar('  Estación   Central ')).toBe('estacion central');
    expect(normalizar("O'Higgins")).toBe('o higgins');
  });

  it('códigos CUT, región y municipalidad', () => {
    expect(normalizarCut(5101)).toBe('05101');
    expect(codigoRegionDeComuna('13119')).toBe('13');
    expect(codigoRegionDeComuna(5101)).toBe('05');
    expect(cutDeOrganismo('muni_13101')).toBe('13101');
    expect(cutDeOrganismo('elec_dist')).toBeNull();
    expect(cutDeOrganismo(null)).toBeNull();
  });

  it('nombre corto de región', () => {
    expect(nombreCortoRegion('Región Metropolitana de Santiago')).toBe('Metropolitana de Santiago');
    expect(nombreCortoRegion("Región del Libertador Bernardo O'Higgins")).toBe("Libertador Bernardo O'Higgins");
    expect(nombreCortoRegion('Región de La Araucanía')).toBe('La Araucanía');
  });
});

describe('mapa de calor por comuna', () => {
  const catalogo = [
    { codigo: '13119', nombre: 'Maipú' },
    { codigo: '13102', nombre: 'Cerrillos' },
  ];

  it('agrupa por municipalidad y, si no hay, por nombre', () => {
    const { porComuna, sinComuna } = agruparPorComuna(
      [
        { estado: 'reportado', categoria: 'luminaria', organismoId: 'muni_13119', comuna: 'Maipú' },
        { estado: 'resuelto', categoria: 'luminaria', organismoId: null, comuna: 'MAIPU' },
        { estado: 'cerrado', categoria: 'microbasural', comuna: 'Cerrillos' },
        { estado: 'reportado', categoria: 'otro', comuna: 'Comuna inventada' },
      ],
      catalogo,
    );
    expect(porComuna.get('13119')).toMatchObject({ total: 2, sinResolver: 1, resueltos: 1, cerrados: 0, porCategoria: { luminaria: 2 } });
    expect(porComuna.get('13102')).toMatchObject({ total: 1, cerrados: 1, sinResolver: 0 });
    expect(sinComuna).toBe(1);
  });

  it('tramos de intensidad y leyenda', () => {
    expect(tramoDeIntensidad(0, 10)).toBe(0);
    expect(tramoDeIntensidad(1, 10)).toBe(1);
    expect(tramoDeIntensidad(10, 10)).toBe(5);
    expect(rangosDeTramos(10)).toEqual([[1, 2], [3, 4], [5, 6], [7, 8], [9, 10]]);
    expect(rangosDeTramos(2)).toEqual([[1, 1], [2, 2], [3, 3], [4, 4], [5, 5]]);
  });
});
