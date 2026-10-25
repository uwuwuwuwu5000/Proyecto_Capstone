import { TestBed } from '@angular/core/testing';

import { GeolocationService, LocationError } from './geolocation.service';
import { usarEntornoDePrueba } from '../../testing';

usarEntornoDePrueba();

type Interno = { traducirError: (error: unknown) => LocationError };

describe('GeolocationService · mensajes cuando no hay ubicación', () => {
  let traducir: Interno['traducirError'];

  beforeEach(() => {
    const servicio = TestBed.inject(GeolocationService) as unknown as Interno;
    traducir = (error) => servicio.traducirError(error);
  });

  it.each([
    ['Android: permiso denegado', new Error('Location permission was denied'), 'denegado'],
    ['Android: GPS apagado', new Error('location disabled'), 'no_disponible'],
    ['Android: sin respuesta a tiempo', new Error('Timeout expired'), 'timeout'],
    ['navegador: permiso denegado (code 1)', { code: 1, message: 'User denied Geolocation' }, 'denegado'],
    ['navegador: sin señal (code 2)', { code: 2, message: 'Position update is unavailable' }, 'no_disponible'],
    ['navegador: tiempo (code 3)', { code: 3, message: '' }, 'timeout'],
    ['algo desconocido', 'texto suelto', 'desconocido'],
    ['nada', null, 'desconocido'],
  ] as const)('%s → %s', (_caso, error, codigo) => {
    const traducido = traducir(error);
    expect(traducido).toBeInstanceOf(LocationError);
    expect(traducido.code).toBe(codigo);
    expect(traducido.message.length).toBeGreaterThan(20);
  });

  it('el permiso denegado explica dónde activarlo', () => {
    expect(traducir({ code: 1 }).message).toContain('ajustes del teléfono');
  });
});
