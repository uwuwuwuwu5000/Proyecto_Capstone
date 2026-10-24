import { TestBed } from '@angular/core/testing';

import { cargarPieza, entrada, moduloDePrueba } from '../../../testing/modulos-de-prueba';
import { CONFIGURACION_MODULOS, ModulosService } from './modulos.service';
import { RANURAS } from './ranuras';
import { usarEntornoDePrueba } from '../../../testing';

usarEntornoDePrueba();

describe('ModulosService', () => {
  function servicio(config: Parameters<typeof entrada>[0][] | ReturnType<typeof entrada>[]) {
    TestBed.configureTestingModule({ providers: [{ provide: CONFIGURACION_MODULOS, useValue: config }] });
    return TestBed.inject(ModulosService);
  }

  it('responde si un módulo está activo', () => {
    const modulos = servicio([entrada(moduloDePrueba('a')), entrada(moduloDePrueba('b'), false)]);
    expect(modulos.activo('a')).toBe(true);
    expect(modulos.activo('b')).toBe(false);
    expect(modulos.activo('no-existe')).toBe(false);
  });

  it('descarga una ranura una sola vez aunque aparezca en varias pantallas', async () => {
    const cargar = vi.fn(cargarPieza());
    const modulos = servicio([entrada(moduloDePrueba('a', { ranuras: [{ ranura: RANURAS.inicioResumen, cargar }] }))]);

    const [primera, segunda] = await Promise.all([
      modulos.componentesDeRanura(RANURAS.inicioResumen),
      modulos.componentesDeRanura(RANURAS.inicioResumen),
    ]);

    expect(cargar).toHaveBeenCalledTimes(1);
    expect(primera).toBe(segunda);
  });

  it('si la descarga falla (sin red), lo vuelve a intentar la próxima vez', async () => {
    const cargar = vi.fn().mockRejectedValueOnce(new Error('sin red')).mockImplementation(cargarPieza());
    const modulos = servicio([entrada(moduloDePrueba('a', { ranuras: [{ ranura: RANURAS.inicioResumen, cargar }] }))]);

    await expect(modulos.componentesDeRanura(RANURAS.inicioResumen)).rejects.toThrow('sin red');
    await expect(modulos.componentesDeRanura(RANURAS.inicioResumen)).resolves.toHaveLength(1);
    expect(cargar).toHaveBeenCalledTimes(2);
  });

  it('una ranura sin aportes entrega una lista vacía', async () => {
    const modulos = servicio([entrada(moduloDePrueba('a'))]);
    await expect(modulos.componentesDeRanura(RANURAS.cabeceraAcciones)).resolves.toEqual([]);
  });

  it('pantallaAlEntrarAlInicio: gana el primer módulo activo que pide una, con el perfil de quien entra', () => {
    const recibido: unknown[] = [];
    const modulos = servicio([
      entrada(moduloDePrueba('apagado', { alEntrarAlInicio: () => '/apagado' }), false),
      entrada(moduloDePrueba('nada', { alEntrarAlInicio: (perfil) => (recibido.push(perfil), null) })),
      entrada(moduloDePrueba('falla', { alEntrarAlInicio: () => { throw new Error('roto'); } })),
      entrada(moduloDePrueba('bienvenida', { alEntrarAlInicio: () => '/bienvenida' })),
      entrada(moduloDePrueba('despues', { alEntrarAlInicio: () => '/despues' })),
    ]);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const perfil = { uid: 'u1', role: 'ciudadano' } as never;

    expect(modulos.pantallaAlEntrarAlInicio(perfil)).toBe('/bienvenida');
    expect(recibido).toEqual([perfil]);
    expect(error).toHaveBeenCalledWith(expect.stringContaining('falla'), expect.any(Error));
    error.mockRestore();
  });

  it('pantallaAlEntrarAlInicio: sin módulos que pidan una, null', () => {
    expect(servicio([entrada(moduloDePrueba('a'))]).pantallaAlEntrarAlInicio(null)).toBeNull();
  });

  it('sin reemplazo usa modulos.config.ts', () => {
    TestBed.configureTestingModule({});
    expect(TestBed.inject(ModulosService).activo('reportes')).toBe(true);
  });
});
