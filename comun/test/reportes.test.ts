import { describe, expect, it } from 'vitest';

import {
  CATEGORIAS,
  COLORES_ESTADO,
  DESCRIPCION_MAX,
  DESCRIPCION_MIN,
  ESTADOS_EN_ORDEN,
  ETIQUETAS_ESTADO,
  TRANSICIONES,
  esCategoria,
  esEstado,
  estaFinalizado,
  etiquetaCategoria,
  etiquetaEstado,
  problemaDescripcion,
  transicionValida,
} from '../src';

describe('estados', () => {
  it('cada estado tiene etiqueta, color y transiciones', () => {
    for (const estado of ESTADOS_EN_ORDEN) {
      expect(ETIQUETAS_ESTADO[estado]).toBeTruthy();
      expect(COLORES_ESTADO[estado]).toMatch(/^#[0-9a-f]{6}$/);
      expect(TRANSICIONES[estado]).toBeDefined();
    }
  });

  it('sigue el flujo de transicionValida() de las reglas', () => {
    expect(transicionValida('reportado', 'en_revision')).toBe(true);
    expect(transicionValida('reportado', 'resuelto')).toBe(false);
    expect(transicionValida('en_proceso', 'resuelto')).toBe(true);
    expect(transicionValida('resuelto', 'cerrado')).toBe(true);
    expect(TRANSICIONES.cerrado).toEqual([]);
  });

  it('ningún estado vuelve hacia atrás en el flujo', () => {
    for (const desde of ESTADOS_EN_ORDEN) {
      for (const hacia of TRANSICIONES[desde]) {
        expect(ESTADOS_EN_ORDEN.indexOf(hacia)).toBeGreaterThan(ESTADOS_EN_ORDEN.indexOf(desde));
      }
    }
  });

  it('todo estado puede terminar cerrado', () => {
    const llegaACerrado = (estado: (typeof ESTADOS_EN_ORDEN)[number]): boolean =>
      estado === 'cerrado' || TRANSICIONES[estado].some(llegaACerrado);
    expect(ESTADOS_EN_ORDEN.every(llegaACerrado)).toBe(true);
  });

  it('reconoce estados y finalizados', () => {
    expect(esEstado('derivado')).toBe(true);
    expect(esEstado('borrado')).toBe(false);
    expect(estaFinalizado('resuelto')).toBe(true);
    expect(estaFinalizado('en_proceso')).toBe(false);
    expect(etiquetaEstado('en_revision')).toBe('En revisión');
    expect(etiquetaEstado('desconocido')).toBe('desconocido');
  });

  it('resuelto se ve sobre un mapa claro (no es blanco)', () => {
    expect(COLORES_ESTADO.resuelto.toLowerCase()).not.toMatch(/^#f[0-9a-f]f[0-9a-f]f[0-9a-f]$/);
  });
});

describe('categorías', () => {
  it('son las 7 del piloto, sin repetir', () => {
    expect(CATEGORIAS).toHaveLength(7);
    expect(new Set(CATEGORIAS.map((c) => c.id)).size).toBe(7);
  });

  it('etiqueta legible y respaldo para ids desconocidos', () => {
    expect(etiquetaCategoria('luminaria')).toBe('Luminaria dañada');
    expect(etiquetaCategoria('categoria_del_portal')).toBe('categoria_del_portal');
    expect(etiquetaCategoria(null)).toBe('Sin categoría');
    expect(esCategoria('fuga_agua')).toBe(true);
    expect(esCategoria('spam')).toBe(false);
  });
});

describe('descripción', () => {
  it('mismos límites que las reglas', () => {
    expect(DESCRIPCION_MIN).toBe(10);
    expect(DESCRIPCION_MAX).toBe(500);
  });

  it('detecta vacía, corta y larga', () => {
    expect(problemaDescripcion('   ')).toBe('vacia');
    expect(problemaDescripcion('bache')).toBe('corta');
    expect(problemaDescripcion('x'.repeat(501))).toBe('larga');
    expect(problemaDescripcion('  Bache profundo frente al paradero  ')).toBeNull();
    expect(problemaDescripcion('x'.repeat(10))).toBeNull();
  });
});
