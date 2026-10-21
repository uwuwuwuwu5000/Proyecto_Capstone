import { TestBed } from '@angular/core/testing';
import { Timestamp } from 'firebase/firestore';

import { Report } from '../../../models/report.model';
import { UserProfile } from '../../../models/user-profile.model';
import { ReportQueryService } from '../../../services/report-query.service';
import { usarEntornoDePrueba } from '../../../../testing';
import { ResumenReportesComponent } from './resumen-reportes.component';

usarEntornoDePrueba();

describe('ResumenReportesComponent (ranura inicio.resumen)', () => {
  let getMyReports: ReturnType<typeof vi.fn>;

  async function mostrar(rol: UserProfile['role'] | null): Promise<HTMLElement> {
    const fixture = TestBed.createComponent(ResumenReportesComponent);
    fixture.componentRef.setInput('perfil', rol ? ({ role: rol } as UserProfile) : null);
    fixture.detectChanges();
    await new Promise((listo) => setTimeout(listo));
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  beforeEach(() => {
    getMyReports = vi.fn();
    TestBed.configureTestingModule({ providers: [{ provide: ReportQueryService, useValue: { getMyReports } }] });
  });

  it('muestra los conteos y lleva a Mis reportes', async () => {
    const ahora = Timestamp.now();
    getMyReports.mockResolvedValue({
      reportes: [
        { id: 'a', estado: 'en_proceso', descripcion: 'Bache', createdAt: ahora, updatedAt: ahora },
        { id: 'b', estado: 'resuelto', descripcion: 'Luminaria', createdAt: ahora, updatedAt: ahora },
      ] as Report[],
      cursor: null,
    });

    const html = await mostrar('ciudadano');

    expect(getMyReports).toHaveBeenCalledWith(50);
    expect(html.textContent).toContain('Tus reportes');
    expect(html.textContent).toContain('1 en curso · 1 resuelto');
    expect(html.querySelector('a')?.getAttribute('href')).toBe('/my-reports');
  });

  it('sin reportes invita a crear el primero', async () => {
    getMyReports.mockResolvedValue({ reportes: [], cursor: null });
    const html = await mostrar('ciudadano');

    expect(html.textContent).toContain('Aún no has reportado nada');
    expect(html.querySelector('a')?.getAttribute('href')).toBe('/report-new');
  });

  it('un operador no la ve (no reporta) y no se consulta nada', async () => {
    const html = await mostrar('operador');
    expect(html.textContent?.trim()).toBe('');
    expect(getMyReports).not.toHaveBeenCalled();
  });

  it('sin red no muestra nada, sin romper el inicio', async () => {
    getMyReports.mockRejectedValue(new Error('sin red'));
    expect((await mostrar('ciudadano')).textContent?.trim()).toBe('');
  });
});
