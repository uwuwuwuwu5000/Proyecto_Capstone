import { afterEach, vi } from 'vitest';

import { ESPERA_MAXIMA_MS, EsperaDePantalla } from './espera-de-pantalla';
import { usarEntornoDePrueba } from '../../../testing';

usarEntornoDePrueba();

describe('EsperaDePantalla', () => {
  let espera: EsperaDePantalla;

  beforeEach(() => {
    vi.useFakeTimers();
    espera = new EsperaDePantalla();
  });

  afterEach(() => {
    espera.ngOnDestroy();
    vi.useRealTimers();
  });

  it('se muestra cuando la última parte pendiente termina', () => {
    const perfil = espera.registrar('perfil');
    const tarjeta = espera.registrar('Tus reportes');

    perfil.listo();
    expect(espera.lista()).toBe(false);
    expect(espera.faltan()).toEqual(['Tus reportes']);

    tarjeta.listo();
    expect(espera.lista()).toBe(true);
  });

  it('listo() dos veces no hace daño', () => {
    const a = espera.registrar('a');
    const b = espera.registrar('b');
    a.listo();
    a.listo();
    expect(espera.lista()).toBe(false);
    b.listo();
    expect(espera.lista()).toBe(true);
  });

  it('una vez lista, queda lista aunque una parte vuelva a cargar', () => {
    const tarjeta = espera.registrar('tarjeta');
    tarjeta.listo();

    tarjeta.pendiente();
    espera.registrar('pieza nueva');

    expect(espera.lista()).toBe(true);
  });

  it('sin respuesta, se muestra igual al agotarse el tiempo', () => {
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    espera.registrar('sin red');

    vi.advanceTimersByTime(ESPERA_MAXIMA_MS - 1);
    expect(espera.lista()).toBe(false);

    vi.advanceTimersByTime(1);
    expect(espera.lista()).toBe(true);
    expect(aviso).toHaveBeenCalledWith(expect.stringContaining('sin esperar'), 'sin red');
    aviso.mockRestore();
  });

  it('reiniciar vuelve a esperar (otra cuenta en la misma pantalla)', () => {
    const perfil = espera.registrar('perfil');
    perfil.listo();
    expect(espera.lista()).toBe(true);

    espera.reiniciar();
    perfil.pendiente();
    expect(espera.lista()).toBe(false);

    perfil.listo();
    expect(espera.lista()).toBe(true);
  });
});
