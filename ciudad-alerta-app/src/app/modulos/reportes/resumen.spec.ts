import { Timestamp } from 'firebase/firestore';

import { Report } from '../../models/report.model';
import { usarEntornoDePrueba } from '../../../testing';
import { resumenDeMisReportes, textoConteos, textoUltimo } from './resumen';

usarEntornoDePrueba();

const AHORA = Date.UTC(2026, 9, 20, 22, 0);
const hace = (horas: number) => Timestamp.fromMillis(AHORA - horas * 3_600_000);

function reporte(id: string, estado: Report['estado'], creadoHace: number, cambiadoHace = creadoHace, extra: Partial<Report> = {}): Report {
  return { id, estado, descripcion: `Reporte ${id}`, createdAt: hace(creadoHace), updatedAt: hace(cambiadoHace), ...extra } as Report;
}

describe('resumen de mis reportes (inicio)', () => {
  it('cuenta en curso, resueltos y cerrados sin resolver', () => {
    const resumen = resumenDeMisReportes(
      [
        reporte('a', 'en_proceso', 50),
        reporte('b', 'reportado', 10),
        reporte('c', 'resuelto', 100),
        reporte('d', 'cerrado', 200, 150, { tiempoResolucionMs: 1 }),
        reporte('e', 'cerrado', 300),
      ],
      false,
      AHORA,
    );

    expect(resumen).toMatchObject({ total: 5, enCurso: 2, resueltos: 2, cerrados: 1 });
    expect(textoConteos(resumen)).toBe('2 en curso · 2 resueltos · 1 cerrado');
  });

  it('el último movimiento es el cambio más reciente, aunque el reporte sea antiguo', () => {
    const resumen = resumenDeMisReportes([reporte('nuevo', 'reportado', 5), reporte('viejo', 'en_proceso', 80, 2)], false, AHORA);

    expect(resumen.ultimo).toMatchObject({ id: 'viejo', cambio: true });
    expect(textoUltimo(resumen)).toBe('En proceso hace 2 h: «Reporte viejo»');
  });

  it('si nada cambió desde que se creó, muestra el último creado', () => {
    const resumen = resumenDeMisReportes([reporte('x', 'reportado', 26)], false, AHORA);
    expect(textoUltimo(resumen)).toBe('Último reporte, ayer: «Reporte x»');
  });

  it('acorta las descripciones largas', () => {
    const largo = { ...reporte('l', 'reportado', 1), descripcion: 'Un bache enorme frente al paradero de la avenida principal' } as Report;
    expect(textoUltimo(resumenDeMisReportes([largo], false, AHORA))).toBe(
      'Último reporte, hace 1 h: «Un bache enorme frente al…»',
    );
  });

  it('si hay más de los leídos, lo dice', () => {
    expect(textoConteos(resumenDeMisReportes([reporte('a', 'reportado', 1)], true, AHORA))).toBe('1 en curso (últimos 1)');
  });

  it('sin reportes, todo en cero', () => {
    expect(resumenDeMisReportes([], false, AHORA)).toEqual({
      total: 0,
      hayMas: false,
      enCurso: 0,
      resueltos: 0,
      cerrados: 0,
      ultimo: null,
    });
  });
});
