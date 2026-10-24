import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { vi } from 'vitest';

import { AuthService } from '../../services/auth.service';
import { TerminosService } from '../../services/terminos.service';
import { TerminosPage } from './terminos.page';
import { usarEntornoDePrueba } from '../../../testing';

usarEntornoDePrueba();

describe('TerminosPage', () => {
  let terminos: { aceptar: ReturnType<typeof vi.fn> };

  function abrir(conSesion: boolean, aceptar?: string) {
    terminos = { aceptar: vi.fn().mockResolvedValue(undefined) };
    TestBed.configureTestingModule({
      providers: [
        { provide: TerminosService, useValue: terminos },
        { provide: AuthService, useValue: { user: conSesion ? { uid: 'u1' } : null, logout: vi.fn() } },
      ],
    });
    const fixture = TestBed.createComponent(TerminosPage);
    if (aceptar) fixture.componentRef.setInput('aceptar', aceptar);
    fixture.detectChanges();
    return fixture;
  }

  it('muestra los términos y la privacidad, sin pedir aceptar', () => {
    const fixture = abrir(false);
    const texto = fixture.nativeElement.textContent as string;
    expect(texto).toContain('Términos de uso');
    expect(texto).toContain('Política de privacidad');
    expect(texto).toContain('133 Carabineros');
    expect(texto).not.toContain('Acepto');
  });

  it('con ?aceptar=1 y sesión, pide aceptar y vuelve al inicio', async () => {
    const fixture = abrir(true, '1');
    const navegar = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    expect(fixture.nativeElement.textContent).toContain('Para seguir usando Ciudad Alerta');

    await fixture.componentInstance.aceptarTerminos();

    expect(terminos.aceptar).toHaveBeenCalled();
    expect(navegar).toHaveBeenCalledWith('/home', { replaceUrl: true });
  });
});
