import { describe, expect, it } from 'vitest';

import {
  FIRMA_DEL_AUTOR,
  MOTIVO_RETIRO_MAXIMO,
  comentarioDeRetiro,
  puedeCorregirReporte,
  puedeModificarReporte,
  tieneVotosConPeso,
} from '../src';

describe('tieneVotosConPeso', () => {
  it('sin validación o con ceros no hay votos con peso', () => {
    expect(tieneVotosConPeso(null)).toBe(false);
    expect(tieneVotosConPeso(undefined)).toBe(false);
    expect(tieneVotosConPeso({})).toBe(false);
    expect(tieneVotosConPeso({ votos: 0, puntos: 0 })).toBe(false);
  });

  it('un voto o un punto bastan', () => {
    expect(tieneVotosConPeso({ votos: 1, puntos: 0 })).toBe(true);
    expect(tieneVotosConPeso({ votos: 0, puntos: 0.5 })).toBe(true);
  });
});

describe('puedeModificarReporte (retirar)', () => {
  const mio = { uid: 'a', estado: 'reportado' };

  it('solo el autor, y solo en «Reportado»', () => {
    expect(puedeModificarReporte(mio, 'a')).toBe(true);
    expect(puedeModificarReporte(mio, 'b')).toBe(false);
    expect(puedeModificarReporte(mio, null)).toBe(false);
    expect(puedeModificarReporte({ ...mio, estado: 'en_revision' }, 'a')).toBe(false);
    expect(puedeModificarReporte({ ...mio, estado: 'cerrado' }, 'a')).toBe(false);
  });

  it('con confirmaciones con peso aún se puede retirar', () => {
    expect(puedeModificarReporte({ ...mio, validacion: { votos: 3, puntos: 2 } }, 'a')).toBe(true);
  });
});

describe('puedeCorregirReporte (edicionDelAutorValida de las reglas)', () => {
  const mio = { uid: 'a', estado: 'reportado' };

  it('el autor corrige mientras nadie lo haya confirmado con peso', () => {
    expect(puedeCorregirReporte(mio, 'a')).toBe(true);
    expect(puedeCorregirReporte({ ...mio, validacion: { votos: 0, puntos: 0 } }, 'a')).toBe(true);
  });

  it('con confirmaciones con peso ya no', () => {
    expect(puedeCorregirReporte({ ...mio, validacion: { votos: 1, puntos: 0 } }, 'a')).toBe(false);
    expect(puedeCorregirReporte({ ...mio, validacion: { votos: 0, puntos: 2 } }, 'a')).toBe(false);
  });

  it('tampoco otra persona ni un reporte que ya se revisa', () => {
    expect(puedeCorregirReporte(mio, 'b')).toBe(false);
    expect(puedeCorregirReporte({ ...mio, estado: 'en_revision' }, 'a')).toBe(false);
  });
});

describe('retiro', () => {
  it('la firma pública no es el nombre de la persona', () => {
    expect(FIRMA_DEL_AUTOR).toBe('Quien lo reportó');
  });

  it('el comentario lleva el motivo si se escribió', () => {
    expect(comentarioDeRetiro('')).toBe('Retirado por quien lo reportó.');
    expect(comentarioDeRetiro('   ')).toBe('Retirado por quien lo reportó.');
    expect(comentarioDeRetiro(' Era un duplicado ')).toBe('Retirado por quien lo reportó: Era un duplicado');
  });

  it('el motivo se corta en el máximo', () => {
    const largo = 'x'.repeat(MOTIVO_RETIRO_MAXIMO + 50);
    expect(comentarioDeRetiro(largo)).toBe(`Retirado por quien lo reportó: ${'x'.repeat(MOTIVO_RETIRO_MAXIMO)}`);
  });
});
