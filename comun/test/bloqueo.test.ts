import { describe, expect, it } from 'vitest';

import { estaCerrado, motivoDeBloqueo } from '../src';

// Casos portados de la prueba de la app (confianza.service.spec.ts): la decisión debe dar lo mismo en las dos.
const PUEDE = {
  propio: false,
  operador: false,
  estadoReporte: 'reportado',
  conVeredicto: false,
  suspendido: false,
  restantesHoy: 3,
  pausaRestanteMs: 0,
};

describe('motivoDeBloqueo (por qué no se puede confirmar)', () => {
  it('sin impedimentos, puede confirmar', () => {
    expect(motivoDeBloqueo(PUEDE)).toBeNull();
  });

  it.each([
    ['su propio reporte', { propio: true }, 'propio'],
    ['una cuenta operador', { operador: true }, 'operador'],
    ['una cuenta de organismo (recibe los reportes ya validados)', { organismo: true }, 'organismo'],
    ['un reporte resuelto', { estadoReporte: 'resuelto' }, 'cerrado'],
    ['un reporte cerrado o retirado por su autor', { estadoReporte: 'cerrado' }, 'cerrado'],
    ['un reporte con veredicto', { conVeredicto: true }, 'revisado'],
    ['con las confirmaciones suspendidas', { suspendido: true }, 'suspendido'],
    ['sin confirmaciones restantes hoy', { restantesHoy: 0 }, 'limite'],
    ['durante la pausa entre confirmaciones', { pausaRestanteMs: 5000 }, 'pausa'],
  ] as const)('no confirma %s', (_caso, cambio, motivo) => {
    expect(motivoDeBloqueo({ ...PUEDE, ...cambio })).toBe(motivo);
  });

  it('en revisión, derivado o en proceso todavía se puede confirmar', () => {
    for (const estado of ['en_revision', 'derivado', 'en_proceso']) {
      expect(motivoDeBloqueo({ ...PUEDE, estadoReporte: estado })).toBeNull();
    }
  });

  it('el orden importa: lo propio se dice antes que lo cerrado, y lo cerrado antes que el límite', () => {
    expect(motivoDeBloqueo({ ...PUEDE, propio: true, estadoReporte: 'cerrado' })).toBe('propio');
    expect(motivoDeBloqueo({ ...PUEDE, estadoReporte: 'cerrado', restantesHoy: 0 })).toBe('cerrado');
    expect(motivoDeBloqueo({ ...PUEDE, conVeredicto: true, suspendido: true })).toBe('revisado');
  });
});

describe('estaCerrado', () => {
  it('solo para resuelto y cerrado (también el retirado por su autor)', () => {
    const estados = ['reportado', 'en_revision', 'derivado', 'en_proceso', 'resuelto', 'cerrado', undefined];
    expect(estados.map(estaCerrado)).toEqual([false, false, false, false, true, true, false]);
  });
});
