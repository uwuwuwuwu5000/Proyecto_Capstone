import { TestBed } from '@angular/core/testing';
import { VERSION_TERMINOS } from '@ciudad-alerta/comun';

import { UserProfile } from '../models/user-profile.model';
import { TerminosService } from './terminos.service';
import { usarEntornoDePrueba } from '../../testing';

usarEntornoDePrueba();

describe('TerminosService', () => {
  const perfil = (terminosVersion?: string) => ({ uid: 'u1', terminosVersion }) as UserProfile;

  it('pide aceptar si no hay versión o es una vieja', () => {
    const servicio = TestBed.inject(TerminosService);
    expect(servicio.necesitaAceptar(perfil())).toBe(true);
    expect(servicio.necesitaAceptar(perfil('2020-01'))).toBe(true);
    expect(servicio.necesitaAceptar(perfil(VERSION_TERMINOS))).toBe(false);
  });

  it('sin perfil (sin red) no insiste', () => {
    expect(TestBed.inject(TerminosService).necesitaAceptar(null)).toBe(false);
  });

  it('sin sesión no intenta guardar', async () => {
    await expect(TestBed.inject(TerminosService).aceptar()).rejects.toThrow('Sin sesión');
  });
});
