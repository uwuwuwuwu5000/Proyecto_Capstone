import { estaCerrado, motivoDeBloqueo } from './confianza.service';

const PUEDE = {
  propio: false,
  operador: false,
  estadoReporte: 'reportado',
  conVeredicto: false,
  suspendido: false,
  restantesHoy: 3,
  pausaRestanteMs: 0,
};

describe('ConfianzaService · por qué no se puede confirmar', () => {
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
  });

  it('estaCerrado solo para resuelto y cerrado', () => {
    expect(['reportado', 'en_revision', 'derivado', 'en_proceso', 'resuelto', 'cerrado', undefined].map(estaCerrado)).toEqual([
      false,
      false,
      false,
      false,
      true,
      true,
      false,
    ]);
  });
});
