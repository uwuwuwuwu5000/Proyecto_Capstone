import { Timestamp } from 'firebase/firestore';

import { Report } from '../../../models/report.model';
import { usarEntornoDePrueba } from '../../../../testing';
import { inicioDeHoy, resumenDeAsignados } from './resumen-gestion.service';

usarEntornoDePrueba();

describe('resumen de gestión (Por atender)', () => {
  const hoy = inicioDeHoy(new Date(2026, 9, 20, 15, 30));
  const creado = (horasDesdeMedianoche: number) => Timestamp.fromMillis(hoy.getTime() + horasDesdeMedianoche * 3_600_000);

  it('cuenta abiertos, sin revisar y nuevos de hoy sobre los asignados', () => {
    const reportes = [
      { estado: 'reportado', createdAt: creado(2) },
      { estado: 'reportado', createdAt: creado(-30) },
      { estado: 'en_proceso', createdAt: creado(-50) },
      { estado: 'resuelto', createdAt: creado(1) },
      { estado: 'cerrado', createdAt: creado(-100) },
    ] as Report[];

    expect(resumenDeAsignados(reportes, hoy.getTime())).toEqual({ abiertos: 3, sinRevisar: 2, nuevosHoy: 2 });
  });

  it('hoy empieza a la medianoche del teléfono', () => {
    const inicio = inicioDeHoy(new Date(2026, 9, 20, 0, 5));
    expect([inicio.getHours(), inicio.getMinutes(), inicio.getDate()]).toEqual([0, 0, 20]);
  });
});
