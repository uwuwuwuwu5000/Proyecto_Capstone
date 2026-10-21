import { Timestamp } from 'firebase/firestore';

import { Report, StatusChange } from '../../models/report.model';
import { resolucionDe, textoPrimeraAtencion, textoResolucion } from './resolucion';
import { usarEntornoDePrueba } from '../../../testing';

const creado = Timestamp.fromDate(new Date('2026-10-01T12:00:00Z'));
const horas = (h: number) => Timestamp.fromMillis(creado.toMillis() + h * 3_600_000);

function reporte(datos: Partial<Report>): Report {
  return { id: 'r1', estado: 'reportado', createdAt: creado, ...datos } as Report;
}

function cambio(hacia: StatusChange['hacia'], h: number): StatusChange {
  return { hacia, createdAt: horas(h) } as StatusChange;
}

usarEntornoDePrueba();

describe('resolución de un reporte (F12)', () => {
  it('usa el tiempo guardado al resolver', () => {
    const r = reporte({ estado: 'resuelto', tiempoResolucionMs: 2 * 3_600_000 + 15 * 60_000 });
    expect(textoResolucion(resolucionDe(r))).toBe('Resuelto en 2 h 15 min');
  });

  it('en reportes antiguos lo deduce del seguimiento', () => {
    const r = reporte({ estado: 'cerrado' });
    const historial = [cambio('en_revision', 1), cambio('resuelto', 50), cambio('cerrado', 60)];
    expect(textoResolucion(resolucionDe(r, historial))).toBe('Resuelto en 2,1 días');
  });

  it('distingue el cierre sin resolver', () => {
    const r = reporte({ estado: 'cerrado', cerradoSinResolverAt: horas(5) });
    expect(textoResolucion(resolucionDe(r))).toBe('Cerrado sin resolver');
  });

  it('un reporte abierto no muestra resolución', () => {
    expect(textoResolucion(resolucionDe(reporte({ estado: 'en_proceso' }), [cambio('en_proceso', 3)]))).toBeNull();
  });

  it('primera respuesta: el primer cambio de estado, sin importar el orden del historial', () => {
    const historial = [cambio('en_proceso', 30), cambio('en_revision', 3)];
    expect(textoPrimeraAtencion(reporte({}), historial)).toBe('3 h');
  });

  it('sin historial (o sin poder leerlo) no hay primera respuesta', () => {
    expect(textoPrimeraAtencion(reporte({}), [])).toBeNull();
    expect(textoPrimeraAtencion(reporte({}), null)).toBeNull();
  });
});
