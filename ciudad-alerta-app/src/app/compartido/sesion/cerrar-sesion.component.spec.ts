import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { LoadingController, ToastController } from '@ionic/angular';

import { AuthFailure, AuthService } from '../../services/auth.service';
import { CerrarSesionComponent } from './cerrar-sesion.component';
import { usarEntornoDePrueba } from '../../../testing';

usarEntornoDePrueba();

describe('CerrarSesionComponent', () => {
  let auth: { logout: ReturnType<typeof vi.fn> };
  let navegar: ReturnType<typeof vi.fn>;
  let toasts: string[];

  beforeEach(() => {
    auth = { logout: vi.fn().mockResolvedValue(undefined) };
    toasts = [];
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: auth },
        {
          provide: LoadingController,
          useValue: { create: async () => ({ present: async () => undefined, dismiss: async () => true }) },
        },
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
    navegar = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true) as never;
  });

  it('cierra la sesión y vuelve al acceso sin dejar el inicio en el historial', async () => {
    await TestBed.createComponent(CerrarSesionComponent).componentInstance.cerrar();

    expect(auth.logout).toHaveBeenCalled();
    expect(navegar).toHaveBeenCalledWith('/login', { replaceUrl: true });
  });

  it('si falla, avisa y no navega', async () => {
    auth.logout.mockRejectedValue(new AuthFailure('Sin conexión.', 'red'));

    await TestBed.createComponent(CerrarSesionComponent).componentInstance.cerrar();

    expect(navegar).not.toHaveBeenCalled();
    expect(toasts).toEqual(['Sin conexión.']);
  });
});
