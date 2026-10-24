import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { ToastController } from '@ionic/angular';
import { Timestamp } from 'firebase/firestore';

import { UserProfile } from '../../../../models/user-profile.model';
import { AuthService } from '../../../../services/auth.service';
import { PerfilService } from '../../datos/perfil.service';
import { EliminarCuentaError, EliminarCuentaService } from '../../datos/eliminar-cuenta.service';
import { MiPerfilPage } from './mi-perfil.page';
import { usarEntornoDePrueba } from '../../../../../testing';

const USUARIO = { uid: 'u-123', email: 'vecina@prueba.cl', emailVerified: true, displayName: null };

function perfil(datos: Partial<UserProfile>): UserProfile {
  return {
    uid: 'u-123',
    email: 'vecina@prueba.cl',
    displayName: 'Vecina de Maipú',
    role: 'ciudadano',
    trustLevel: 0,
    validatedReports: 0,
    emailVerified: true,
    createdAt: Timestamp.fromDate(new Date('2026-03-15T15:00:00Z')),
    updatedAt: Timestamp.now(),
    ...datos,
  };
}

usarEntornoDePrueba();

describe('MiPerfilPage', () => {
  let fixture: ComponentFixture<MiPerfilPage>;
  let auth: {
    user: typeof USUARIO | null;
    currentUser: ReturnType<typeof signal>;
    getUserProfile: ReturnType<typeof vi.fn>;
  };
  let perfilService: { organismoDeOperador: ReturnType<typeof vi.fn> };
  let eliminar: { eliminar: ReturnType<typeof vi.fn> };
  let toasts: string[];

  async function entrar(): Promise<string> {
    fixture = TestBed.createComponent(MiPerfilPage);
    await fixture.componentInstance.ionViewWillEnter();
    fixture.detectChanges();
    return fixture.nativeElement.textContent as string;
  }

  beforeEach(() => {
    auth = { user: USUARIO, currentUser: signal(USUARIO), getUserProfile: vi.fn() };
    perfilService = { organismoDeOperador: vi.fn().mockResolvedValue('Municipalidad de Maipú') };
    eliminar = { eliminar: vi.fn().mockResolvedValue({ reportesAnonimos: 2 }) };
    toasts = [];
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: auth },
        { provide: PerfilService, useValue: perfilService },
        { provide: EliminarCuentaService, useValue: eliminar },
        {
          provide: ToastController,
          useValue: {
            create: async ({ message }: { message: string }) => {
              toasts.push(message);
              return { present: async () => undefined };
            },
          },
        },
      ],
    });
  });

  it('muestra nombre, tipo de cuenta y fecha de ingreso', async () => {
    auth.getUserProfile.mockResolvedValue(perfil({}));
    const texto = await entrar();

    expect(texto).toContain('Vecina de Maipú');
    expect(texto).toContain('Vecino o vecina');
    expect(texto).toContain('15 de marzo de 2026');
    expect(texto).toContain('u-123');
    expect(perfilService.organismoDeOperador).not.toHaveBeenCalled();
  });

  it('a un operador le muestra su organismo', async () => {
    auth.getUserProfile.mockResolvedValue(perfil({ role: 'operador', operadorId: 'op-maipu' }));
    const texto = await entrar();

    expect(perfilService.organismoDeOperador).toHaveBeenCalledWith('op-maipu');
    expect(texto).toContain('Operador municipal');
    expect(texto).toContain('Municipalidad de Maipú');
  });

  it('con el correo sin verificar ofrece verificarlo', async () => {
    auth.user = { ...USUARIO, emailVerified: false };
    auth.getUserProfile.mockResolvedValue(perfil({ emailVerified: false }));
    const texto = await entrar();

    expect(texto).toContain('Verifica tu correo');
    expect(texto).toContain('Pendiente');

    fixture.componentInstance.alVerificar();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).not.toContain('Verifica tu correo');
  });

  it('si no se puede leer el perfil lo dice, sin dejar la pantalla vacía', async () => {
    auth.getUserProfile.mockRejectedValue(new Error('sin red'));
    const texto = await entrar();

    expect(texto).toContain('No pudimos leer tu perfil');
    expect(texto).toContain('vecina@prueba.cl');
    expect(texto).toContain('Cerrar sesión');
  });

  it('explica qué pasa al eliminar la cuenta', async () => {
    auth.getUserProfile.mockResolvedValue(perfil({}));
    const texto = await entrar();
    expect(texto).toContain('Eliminar mi cuenta');
    expect(texto).toContain('«Cuenta eliminada»');
  });

  it('al eliminarla, avisa y vuelve al login', async () => {
    auth.getUserProfile.mockResolvedValue(perfil({}));
    await entrar();
    const navegar = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);

    await fixture.componentInstance.eliminar('secreta');

    expect(eliminar.eliminar).toHaveBeenCalledWith('secreta');
    expect(toasts).toContain('Tu cuenta fue eliminada.');
    expect(navegar).toHaveBeenCalledWith('/login', { replaceUrl: true });
  });

  it('con la contraseña incorrecta lo dice y no sale', async () => {
    auth.getUserProfile.mockResolvedValue(perfil({}));
    await entrar();
    eliminar.eliminar.mockRejectedValue(new EliminarCuentaError('La contraseña no es correcta.', 'contrasena'));
    const navegar = vi.spyOn(TestBed.inject(Router), 'navigateByUrl');

    await fixture.componentInstance.eliminar('mala');

    expect(toasts).toContain('La contraseña no es correcta.');
    expect(navegar).not.toHaveBeenCalled();
  });
});
