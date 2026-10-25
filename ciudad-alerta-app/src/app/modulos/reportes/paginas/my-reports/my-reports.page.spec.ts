import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ToastController } from '@ionic/angular';
import { Timestamp } from 'firebase/firestore';
import { vi } from 'vitest';

import { Report } from '../../../../models/report.model';
import { PaginaReportes, ReportQueryService } from '../../../../services/report-query.service';
import { ConfirmationService } from '../../datos/confirmation.service';
import { MyReportsPage } from './my-reports.page';
import { usarEntornoDePrueba } from '../../../../../testing';

usarEntornoDePrueba();

const reporte = (id: string, cambios: Partial<Report> = {}): Report =>
  ({ id, uid: 'ana', descripcion: `Reporte ${id}`, categoria: 'luminaria', estado: 'reportado', createdAt: Timestamp.now(), ...cambios }) as Report;

describe('MyReportsPage · Mis reportes', () => {
  let fixture: ComponentFixture<MyReportsPage>;
  let pagina: MyReportsPage;
  let paginas: ReturnType<typeof vi.fn<(tamano: number, cursor: unknown) => Promise<PaginaReportes>>>;

  beforeEach(() => {
    paginas = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        { provide: ReportQueryService, useValue: { getMyReports: paginas, formatearFecha: () => 'hoy' } },
        { provide: ConfirmationService, useValue: { countMany: async () => new Map([['a', 2]]) } },
        { provide: ToastController, useValue: { create: async () => ({ present: async () => undefined }) } },
      ],
    });
    fixture = TestBed.createComponent(MyReportsPage);
    pagina = fixture.componentInstance;
  });

  const texto = () => {
    fixture.detectChanges();
    return (fixture.nativeElement.textContent as string).replace(/\s+/g, ' ');
  };

  it('lista los reportes y ofrece ver los anteriores', async () => {
    paginas.mockResolvedValueOnce({ reportes: [reporte('a'), reporte('b', { estado: 'resuelto' })], cursor: {} as never });

    await pagina.ionViewWillEnter();

    expect(texto()).toContain('Reporte a');
    expect(texto()).toContain('Reporte b');
    expect(texto()).toContain('Ver reportes anteriores');

    paginas.mockResolvedValueOnce({ reportes: [reporte('c')], cursor: null });
    await pagina.cargarMas();

    expect(pagina.reportes().map((r) => r.id)).toEqual(['a', 'b', 'c']);
    expect(texto()).not.toContain('Ver reportes anteriores');
  });

  it('sin reportes invita a crear el primero', async () => {
    paginas.mockResolvedValue({ reportes: [], cursor: null });
    await pagina.ionViewWillEnter();
    expect(texto()).toContain('Todavía no has reportado nada');
  });

  it('distingue un problema de permisos de uno de conexión, y deja reintentar', async () => {
    paginas.mockRejectedValueOnce(new Error('Missing or insufficient permissions'));
    await pagina.ionViewWillEnter();
    expect(texto()).toContain('No tienes permisos para ver estos reportes');

    paginas.mockRejectedValueOnce(new Error('Failed to get documents'));
    await pagina.reintentar();
    expect(texto()).toContain('Revisa tu conexión');

    paginas.mockResolvedValueOnce({ reportes: [reporte('a')], cursor: null });
    await pagina.reintentar();
    expect(texto()).toContain('Reporte a');
  });

  it('al volver a la pantalla, la lista se arma de nuevo sin repetir reportes', async () => {
    paginas.mockResolvedValue({ reportes: [reporte('a')], cursor: null });
    await pagina.ionViewWillEnter();
    await pagina.ionViewWillEnter();
    expect(pagina.reportes().map((r) => r.id)).toEqual(['a']);
  });
});
