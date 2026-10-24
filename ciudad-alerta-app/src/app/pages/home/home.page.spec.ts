import { Component, inject, input, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { afterEach, vi } from 'vitest';

import { UserProfile } from '../../models/user-profile.model';
import { ESPERA_MAXIMA_MS, EsperaDePantalla } from '../../nucleo/carga';
import { CONFIGURACION_MODULOS, RANURAS } from '../../nucleo/modulos';
import { entrada, moduloDePrueba } from '../../../testing/modulos-de-prueba';
import { AuthService } from '../../services/auth.service';
import { HomePage } from './home.page';
import { usarEntornoDePrueba } from '../../../testing';

usarEntornoDePrueba();

describe('HomePage', () => {
  let fixture: ComponentFixture<HomePage>;
  let auth: {
    user: { uid: string } | null;
    currentUser: ReturnType<typeof signal<{ uid: string; email: string; emailVerified: boolean } | null>>;
    asegurarPerfil: ReturnType<typeof vi.fn>;
    getUserProfile: ReturnType<typeof vi.fn>;
  };

  async function entrar(perfil: Partial<UserProfile> | null): Promise<string[]> {
    auth.getUserProfile.mockResolvedValue(perfil);
    fixture = TestBed.createComponent(HomePage);
    await fixture.componentInstance.ionViewWillEnter();
    fixture.detectChanges();
    return [...fixture.nativeElement.querySelectorAll('.grupo .accion-reportar, .grupo .acceso')].map((b: Element) =>
      b.textContent!.trim(),
    );
  }

  beforeEach(() => {
    auth = {
      user: { uid: 'u1' },
      currentUser: signal({ uid: 'u1', email: 'rodrigo@prueba.cl', emailVerified: true }),
      asegurarPerfil: vi.fn().mockResolvedValue(undefined),
      getUserProfile: vi.fn(),
    };
    TestBed.configureTestingModule({ providers: [{ provide: AuthService, useValue: auth }] });
  });

  it('saluda por el nombre y ya no muestra los datos técnicos de la cuenta', async () => {
    await entrar({ displayName: 'Rodrigo Hernández', role: 'ciudadano' });
    const texto: string = fixture.nativeElement.textContent;

    expect(texto).toContain('Hola, Rodrigo');
    expect(texto).not.toContain('Identificador');
    expect(texto).not.toContain('próximo sprint');
    expect(texto).toContain('Cerrar sesión');
  });

  it('un ciudadano ve los botones de los módulos en su orden, sin los de gestión', async () => {
    const botones = await entrar({ displayName: 'Rodrigo', role: 'ciudadano' });

    expect(botones[0]).toBe('Crear un reporte');
    expect(botones).toContain('Mi perfil');
    expect(botones).not.toContain('Todas las incidencias');
  });

  it('agrupa los botones: acción principal, «Explorar», «Tu cuenta» y, para staff, «Gestión»', async () => {
    await entrar({ displayName: 'Rodrigo', role: 'admin' });
    const titulos = [...fixture.nativeElement.querySelectorAll('.grupo__titulo')].map((t: Element) => t.textContent!.trim());

    expect(titulos).toEqual(['Explorar', 'Tu cuenta', 'Gestión']);
    expect(fixture.nativeElement.querySelector('.grupo .accion-reportar')?.textContent).toContain('Crear un reporte');
  });

  it('un ciudadano no ve el grupo «Gestión»', async () => {
    await entrar({ displayName: 'Rodrigo', role: 'ciudadano' });
    expect(fixture.nativeElement.textContent).not.toContain('Gestión');
  });

  it('un operador ve su bandeja con el texto de su rol', async () => {
    const botones = await entrar({ displayName: 'Operadora', role: 'operador' });
    expect(botones).toContain('Reportes asignados');
  });

  it('abre la pantalla elegida en Configuración una sola vez por arranque', async () => {
    localStorage.setItem('ciudad-alerta.preferencias', JSON.stringify({ abrirEn: '/report-new' }));
    const router = TestBed.inject(Router);
    const navegar = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);

    await entrar({ displayName: 'Rodrigo', role: 'ciudadano' });
    await fixture.componentInstance.ionViewWillEnter();

    expect(navegar).toHaveBeenCalledTimes(1);
    expect(navegar).toHaveBeenCalledWith('/report-new');
    localStorage.removeItem('ciudad-alerta.preferencias');
  });

  it('no abre una pantalla que la cuenta no tiene en su inicio', async () => {
    localStorage.setItem('ciudad-alerta.preferencias', JSON.stringify({ abrirEn: '/admin-reports' }));
    const navegar = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);

    await entrar({ displayName: 'Rodrigo', role: 'ciudadano' });

    expect(navegar).not.toHaveBeenCalled();
    localStorage.removeItem('ciudad-alerta.preferencias');
  });

  it('sin perfil (sin red) igual saluda con el correo', async () => {
    auth.getUserProfile.mockRejectedValue(new Error('sin red'));
    fixture = TestBed.createComponent(HomePage);
    await fixture.componentInstance.ionViewWillEnter();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Hola, rodrigo');
  });
});

/** Pieza del resumen que se registra y nunca termina (sin red). */
@Component({ selector: 'app-pieza-lenta', standalone: true, template: `<span class="lenta">lenta</span>` })
class PiezaLentaComponent {
  readonly perfil = input<unknown>(null);
  constructor() {
    inject(EsperaDePantalla, { optional: true })?.registrar('pieza lenta');
  }
}

describe('HomePage · carga en segundo plano', () => {
  let fixture: ComponentFixture<HomePage>;
  const shell = () => fixture.nativeElement.querySelector('.inicio-shell') as HTMLElement;
  const texto = () => fixture.nativeElement.textContent as string;

  function preparar(config: ReturnType<typeof entrada>[] = []): void {
    TestBed.configureTestingModule({
      providers: [
        { provide: CONFIGURACION_MODULOS, useValue: config },
        {
          provide: AuthService,
          useValue: {
            user: { uid: 'u1' },
            currentUser: signal({ uid: 'u1', email: 'rodrigo@prueba.cl', emailVerified: true }),
            asegurarPerfil: vi.fn().mockResolvedValue(undefined),
            getUserProfile: vi.fn().mockResolvedValue({ displayName: 'Rodrigo', role: 'ciudadano' }),
          },
        },
      ],
    });
    fixture = TestBed.createComponent(HomePage);
    fixture.detectChanges();
  }

  afterEach(() => {
    document.getElementById('arranque')?.remove();
    vi.useRealTimers();
  });

  it('se arma oculto y aparece entero, de arriba abajo, cuando tiene el perfil', async () => {
    preparar();
    expect(texto()).toContain('Preparando tu inicio');
    expect(shell().classList).toContain('inicio-shell--oculto');

    await fixture.componentInstance.ionViewWillEnter();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(texto()).not.toContain('Preparando tu inicio');
    expect(shell().classList).not.toContain('inicio-shell--oculto');
    expect(shell().classList).toContain('ca-escalonado');
  });

  it('al mostrarse, quita la pantalla de arranque', async () => {
    const arranque = document.createElement('div');
    arranque.id = 'arranque';
    document.body.appendChild(arranque);
    preparar();

    await fixture.componentInstance.ionViewWillEnter();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(arranque.classList).toContain('arranque--fuera');
  });

  it('si una tarjeta no responde, el inicio se muestra igual al agotarse el tiempo', async () => {
    vi.useFakeTimers();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    preparar([
      entrada(
        moduloDePrueba('lento', {
          ranuras: [{ ranura: RANURAS.inicioResumen, cargar: () => Promise.resolve(PiezaLentaComponent) }],
        }),
      ),
    ]);

    await fixture.componentInstance.ionViewWillEnter();
    await vi.advanceTimersByTimeAsync(0);
    fixture.detectChanges();
    await vi.advanceTimersByTimeAsync(0);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.lenta')).not.toBeNull();
    expect(shell().classList).toContain('inicio-shell--oculto');

    await vi.advanceTimersByTimeAsync(ESPERA_MAXIMA_MS);
    fixture.detectChanges();
    expect(shell().classList).toContain('ca-escalonado');
  });
});
