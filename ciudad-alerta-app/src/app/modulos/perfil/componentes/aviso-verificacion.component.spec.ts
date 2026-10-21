import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { UserProfile } from '../../../models/user-profile.model';
import { AuthService } from '../../../services/auth.service';
import { AvisoVerificacionComponent } from './aviso-verificacion.component';
import { usarEntornoDePrueba } from '../../../../testing';

usarEntornoDePrueba();

describe('AvisoVerificacionComponent (ranura inicio.resumen)', () => {
  const usuario = signal<{ emailVerified: boolean } | null>(null);

  function texto(perfil: Partial<UserProfile> | null = null): string {
    const fixture = TestBed.createComponent(AvisoVerificacionComponent);
    fixture.componentRef.setInput('perfil', perfil);
    fixture.detectChanges();
    return (fixture.nativeElement.textContent as string).trim();
  }

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [{ provide: AuthService, useValue: { currentUser: usuario } }] });
  });

  it('recuerda verificar el correo y lleva a Mi perfil', () => {
    usuario.set({ emailVerified: false });
    const fixture = TestBed.createComponent(AvisoVerificacionComponent);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Verifica tu correo');
    expect(fixture.nativeElement.querySelector('a').getAttribute('href')).toBe('/perfil');
  });

  it('no aparece con el correo verificado, ni sin sesión', () => {
    usuario.set({ emailVerified: true });
    expect(texto()).toBe('');
    usuario.set(null);
    expect(texto()).toBe('');
  });

  it('si el perfil ya dice verificado (comprobado en Mi perfil), tampoco', () => {
    usuario.set({ emailVerified: false });
    expect(texto({ emailVerified: true })).toBe('');
  });
});
