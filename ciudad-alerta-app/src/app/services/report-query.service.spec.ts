import { TestBed } from '@angular/core/testing';
import { Timestamp, serverTimestamp } from 'firebase/firestore';

import { AuthService } from './auth.service';
import { ReportQueryService } from './report-query.service';
import { usarEntornoDePrueba } from '../../testing';

usarEntornoDePrueba();

describe('ReportQueryService', () => {
  let servicio: ReportQueryService;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [{ provide: AuthService, useValue: { user: null } }] });
    servicio = TestBed.inject(ReportQueryService);
  });

  it('sin sesión, el historial propio está vacío (sin consultar)', async () => {
    expect(await servicio.getMyReports()).toEqual({ reportes: [], cursor: null });
  });

  it('formatea la fecha en el horario de Chile, con día, mes, año y hora', () => {
    expect(servicio.formatearFecha(Timestamp.fromDate(new Date(2026, 9, 5, 9, 7)))).toMatch(/05.10.2026.*09:07/);
  });

  it('un reporte recién enviado (fecha aún sin confirmar) dice «Hace unos instantes»', () => {
    expect(servicio.formatearFecha(serverTimestamp())).toBe('Hace unos instantes');
  });

  it('si la lectura falla (sin red), el error llega a la pantalla para que lo explique', async () => {
    await expect(servicio.getById('r1')).rejects.toMatchObject({ code: 'unavailable' });
  });
});
