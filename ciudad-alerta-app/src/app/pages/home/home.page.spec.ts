import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { UserProfile } from '../../models/user-profile.model';
import { AuthService } from '../../services/auth.service';
import { HomePage } from './home.page';

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
    return [...fixture.nativeElement.querySelectorAll('.accesos ion-button')].map((b: Element) =>
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

  it('un operador ve su bandeja con el texto de su rol', async () => {
    const botones = await entrar({ displayName: 'Operadora', role: 'operador' });
    expect(botones).toContain('Reportes asignados');
  });

  it('sin perfil (sin red) igual saluda con el correo', async () => {
    auth.getUserProfile.mockRejectedValue(new Error('sin red'));
    fixture = TestBed.createComponent(HomePage);
    await fixture.componentInstance.ionViewWillEnter();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Hola, rodrigo');
  });
});
