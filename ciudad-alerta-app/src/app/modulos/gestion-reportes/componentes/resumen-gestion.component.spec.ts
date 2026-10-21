import { TestBed } from '@angular/core/testing';

import { UserProfile } from '../../../models/user-profile.model';
import { usarEntornoDePrueba } from '../../../../testing';
import { ResumenGestionService } from '../datos/resumen-gestion.service';
import { ResumenGestionComponent } from './resumen-gestion.component';

usarEntornoDePrueba();

describe('ResumenGestionComponent (ranura inicio.resumen)', () => {
  let servicio: { deAdministrador: ReturnType<typeof vi.fn>; deOperador: ReturnType<typeof vi.fn> };

  async function mostrar(perfil: Partial<UserProfile> | null): Promise<HTMLElement> {
    const fixture = TestBed.createComponent(ResumenGestionComponent);
    fixture.componentRef.setInput('perfil', perfil);
    fixture.detectChanges();
    await new Promise((listo) => setTimeout(listo));
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  beforeEach(() => {
    servicio = {
      deAdministrador: vi.fn().mockResolvedValue({ abiertos: 12, sinRevisar: 4, nuevosHoy: 3 }),
      deOperador: vi.fn().mockResolvedValue({ abiertos: 1, sinRevisar: 0, nuevosHoy: 1 }),
    };
    TestBed.configureTestingModule({ providers: [{ provide: ResumenGestionService, useValue: servicio }] });
  });

  it('un admin ve los conteos de todo el sistema y va a la bandeja', async () => {
    const html = await mostrar({ role: 'admin' });

    expect(html.textContent).toContain('Por atender');
    expect(html.textContent).toContain('12 abiertos · 4 sin revisar');
    expect(html.textContent).toContain('3 nuevos hoy');
    expect(html.querySelector('a')?.getAttribute('href')).toBe('/admin-reports');
  });

  it('un operador ve los de su organismo', async () => {
    const html = await mostrar({ role: 'operador', operadorId: 'op_maipu' });

    expect(servicio.deOperador).toHaveBeenCalledWith('op_maipu');
    expect(html.textContent).toContain('Por atender en tu organismo');
    expect(html.textContent).toContain('1 abierto');
    expect(html.textContent).toContain('1 nuevo hoy');
  });

  it('sin abiertos dice que está todo al día', async () => {
    servicio.deAdministrador.mockResolvedValue({ abiertos: 0, sinRevisar: 0, nuevosHoy: 0 });
    expect((await mostrar({ role: 'admin' })).textContent).toContain('Todo al día');
  });

  it('un ciudadano no la ve y no se consulta nada', async () => {
    expect((await mostrar({ role: 'ciudadano' })).textContent?.trim()).toBe('');
    expect(servicio.deAdministrador).not.toHaveBeenCalled();
    expect(servicio.deOperador).not.toHaveBeenCalled();
  });
});
