import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot, UrlTree } from '@angular/router';
import { Observable, firstValueFrom, of } from 'rxjs';

import { AuthService } from '../services/auth.service';
import { authGuard, guestGuard, staffGuard } from './auth-guard';
import { usarEntornoDePrueba } from '../../testing';

type Guard = typeof authGuard;

usarEntornoDePrueba();

describe('guards de guards/auth-guard.ts', () => {
  let auth: { authState$: Observable<{ uid: string } | null>; getUserProfile: ReturnType<typeof vi.fn> };

  function sesion(usuario: { uid: string } | null, rol: string | null = null): void {
    auth = {
      authState$: of(usuario),
      getUserProfile: vi.fn().mockResolvedValue(rol ? { role: rol } : null),
    };
    TestBed.configureTestingModule({ providers: [{ provide: AuthService, useValue: auth }] });
  }

  /** Ejecuta el guard y devuelve true o la ruta a la que redirige. */
  async function ejecutar(guard: Guard): Promise<true | string> {
    const resultado = TestBed.runInInjectionContext(() =>
      guard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot),
    ) as Observable<boolean | UrlTree>;
    const valor = await firstValueFrom(resultado);
    return valor instanceof UrlTree ? TestBed.inject(Router).serializeUrl(valor) : (valor as true);
  }

  describe('authGuard (CA-50)', () => {
    it('deja pasar con sesión', async () => {
      sesion({ uid: 'u1' });
      expect(await ejecutar(authGuard)).toBe(true);
    });

    it('sin sesión lleva al acceso', async () => {
      sesion(null);
      expect(await ejecutar(authGuard)).toBe('/login');
    });
  });

  describe('guestGuard', () => {
    it('con sesión no deja volver al acceso', async () => {
      sesion({ uid: 'u1' });
      expect(await ejecutar(guestGuard)).toBe('/home');
    });

    it('sin sesión muestra el acceso', async () => {
      sesion(null);
      expect(await ejecutar(guestGuard)).toBe(true);
    });
  });

  describe('staffGuard', () => {
    it('operador y admin pasan', async () => {
      sesion({ uid: 'u1' }, 'operador');
      expect(await ejecutar(staffGuard)).toBe(true);
      TestBed.resetTestingModule();
      sesion({ uid: 'u1' }, 'admin');
      expect(await ejecutar(staffGuard)).toBe(true);
    });

    it('un ciudadano vuelve al inicio', async () => {
      sesion({ uid: 'u1' }, 'ciudadano');
      expect(await ejecutar(staffGuard)).toBe('/home');
    });

    it('sin perfil (no se pudo leer) tampoco pasa', async () => {
      sesion({ uid: 'u1' }, null);
      expect(await ejecutar(staffGuard)).toBe('/home');
    });

    it('sin sesión lleva al acceso sin leer el perfil', async () => {
      sesion(null);
      expect(await ejecutar(staffGuard)).toBe('/login');
      expect(auth.getUserProfile).not.toHaveBeenCalled();
    });
  });
});
