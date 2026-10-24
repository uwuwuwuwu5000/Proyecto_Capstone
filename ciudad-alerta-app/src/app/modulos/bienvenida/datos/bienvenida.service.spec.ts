import { TestBed } from '@angular/core/testing';
import { afterEach, vi } from 'vitest';

import { BienvenidaService } from './bienvenida.service';
import { usarEntornoDePrueba } from '../../../../testing';

usarEntornoDePrueba();

describe('BienvenidaService', () => {
  afterEach(() => {
    localStorage.removeItem('ca.bienvenida.vista');
    vi.restoreAllMocks();
  });

  it('la primera vez no está vista; después de marcarla, sí', () => {
    const servicio = TestBed.inject(BienvenidaService);
    expect(servicio.vista()).toBe(false);

    servicio.marcarVista();

    expect(servicio.vista()).toBe(true);
    expect(localStorage.getItem('ca.bienvenida.vista')).toBe('1');
  });

  it('sin almacenamiento no insiste en cada entrada', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('bloqueado', 'SecurityError');
    });
    expect(TestBed.inject(BienvenidaService).vista()).toBe(true);
  });
});
