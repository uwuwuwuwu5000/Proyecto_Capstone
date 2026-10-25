import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { ToastController } from '@ionic/angular';
import { vi } from 'vitest';

import {
  AVISO_PANTALLA_NO_ABRE,
  AVISO_PANTALLA_SIN_SENAL,
  OPCIONES_DEL_ENRUTADOR,
  RecuperacionDePantallas,
  esFallaDeCarga,
} from './enrutador';
import { usarEntornoDePrueba } from '../../testing';

usarEntornoDePrueba();

@Component({ template: 'inicio' })
class InicioDePruebaComponent {}

/** Lo que RecuperacionDePantallas deja reemplazar en las pruebas. */
interface Interno {
  hayConexion(): Promise<boolean>;
  recargar(destino: string): void;
}

const SIN_CODIGO = () => Promise.reject(new TypeError('Failed to fetch dynamically imported module: /mapa.js'));

describe('esFallaDeCarga', () => {
  it('reconoce cómo lo dice cada navegador', () => {
    expect(esFallaDeCarga(new TypeError('Failed to fetch dynamically imported module: https://app/home.page-T7CY.js'))).toBe(true);
    expect(esFallaDeCarga(new TypeError('error loading dynamically imported module: https://app/mapa.js'))).toBe(true);
    expect(esFallaDeCarga(new TypeError('Importing a module script failed.'))).toBe(true);
    expect(esFallaDeCarga(Object.assign(new Error('Loading chunk 123 failed.'), { name: 'ChunkLoadError' }))).toBe(true);
  });

  it('no confunde otros errores con una falta de señal', () => {
    expect(esFallaDeCarga(new TypeError("Cannot read properties of undefined (reading 'uid')"))).toBe(false);
    expect(esFallaDeCarga(new Error('NG04002: Cannot match any routes'))).toBe(false);
    expect(esFallaDeCarga(null)).toBe(false);
  });
});

describe('Enrutador de la app', () => {
  let avisos: string[];
  let errores: ReturnType<typeof vi.spyOn>;
  let conexion: boolean;
  let recargas: string[];

  function configurar(cargar: () => Promise<unknown>): Router {
    avisos = [];
    recargas = [];
    TestBed.configureTestingModule({
      providers: [
        provideRouter(
          [
            { path: '', component: InicioDePruebaComponent },
            { path: 'mapa', loadComponent: cargar as () => Promise<typeof InicioDePruebaComponent> },
          ],
          ...OPCIONES_DEL_ENRUTADOR,
        ),
        {
          provide: ToastController,
          useValue: {
            create: async ({ message }: { message: string }) => {
              avisos.push(message);
              return { present: async () => undefined };
            },
          },
        },
      ],
    });
    const recuperacion = TestBed.inject(RecuperacionDePantallas) as unknown as Interno;
    vi.spyOn(recuperacion, 'hayConexion').mockImplementation(async () => conexion);
    vi.spyOn(recuperacion, 'recargar').mockImplementation((destino) => void recargas.push(destino));
    return TestBed.inject(Router);
  }

  beforeEach(() => {
    conexion = false;
    sessionStorage.clear();
    errores = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => errores.mockRestore());

  it('sin señal, si no se pudo descargar la pantalla, avisa y la navegación no lanza el error', async () => {
    const router = configurar(SIN_CODIGO);

    await expect(router.navigateByUrl('/mapa')).resolves.toBe(false);

    await vi.waitFor(() => expect(avisos).toEqual([AVISO_PANTALLA_SIN_SENAL]));
    expect(recargas).toEqual([]);
    expect(errores).not.toHaveBeenCalled();
  });

  it('con señal recarga la app en esa pantalla (el navegador no vuelve a intentar la descarga fallida)', async () => {
    conexion = true;
    const router = configurar(SIN_CODIGO);

    await router.navigateByUrl('/mapa');

    await vi.waitFor(() => expect(recargas).toEqual(['/mapa']));
    expect(avisos).toEqual([]);
  });

  it('si recién se recargó por la misma pantalla, no recarga en bucle: avisa', async () => {
    conexion = true;
    const router = configurar(SIN_CODIGO);

    await router.navigateByUrl('/mapa');
    await vi.waitFor(() => expect(recargas).toHaveLength(1));
    await router.navigateByUrl('/mapa');

    await vi.waitFor(() => expect(avisos).toEqual([AVISO_PANTALLA_NO_ABRE]));
    expect(recargas).toHaveLength(1);
  });

  it('cualquier otro error al navegar sigue apareciendo en la consola, sin un aviso engañoso', async () => {
    const falla = new TypeError("Cannot read properties of undefined (reading 'uid')");
    const router = configurar(() => Promise.reject(falla));

    await expect(router.navigateByUrl('/mapa')).resolves.toBe(false);

    expect(errores).toHaveBeenCalledWith(falla);
    expect(avisos).toEqual([]);
    expect(recargas).toEqual([]);
  });

  it('una navegación normal no cambia', async () => {
    const router = configurar(async () => InicioDePruebaComponent);

    await expect(router.navigateByUrl('/mapa')).resolves.toBe(true);
    expect(router.url).toBe('/mapa');
  });
});
