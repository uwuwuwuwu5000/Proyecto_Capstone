import { TestBed } from '@angular/core/testing';
import { afterEach, vi } from 'vitest';

import { CatalogoComunasService } from './catalogo-comunas.service';
import { ComunaService } from './comuna.service';
import { usarEntornoDePrueba } from '../../testing';

usarEntornoDePrueba();

/**
 * Una región de prueba con una comuna cuadrada (lng −70.80 a −70.70, lat
 * −33.55 a −33.45) que tiene un hueco en el centro, como un enclave.
 */
const INDICE = {
  regiones: [{ codigo: '13', archivo: 'region-13.geojson' }],
  comunas: [{ cut: '13119', region: '13', caja: [-70.8, -33.55, -70.7, -33.45] }],
};
const REGION = {
  features: [
    {
      properties: { NOM_COM: 'MAIPÚ', CUT_COM: '13119', NOM_REG: 'Región Metropolitana de Santiago' },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [[-70.8, -33.55], [-70.7, -33.55], [-70.7, -33.45], [-70.8, -33.45], [-70.8, -33.55]],
          [[-70.76, -33.51], [-70.74, -33.51], [-70.74, -33.49], [-70.76, -33.49], [-70.76, -33.51]],
        ],
      },
    },
  ],
};

const respuesta = (cuerpo: unknown, ok = true) => ({ ok, status: ok ? 200 : 404, json: async () => cuerpo }) as Response;

describe('ComunaService · en qué comuna está un punto', () => {
  let servicio: ComunaService;
  let traer: ReturnType<typeof vi.fn>;
  let catalogo: { buscar: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    traer = vi.fn(async (url: string) =>
      url.endsWith('indice.json') ? respuesta(INDICE) : url.endsWith('region-13.geojson') ? respuesta(REGION) : respuesta(null, false),
    );
    vi.stubGlobal('fetch', traer);
    catalogo = {
      buscar: vi.fn(async (codigo: string | null) =>
        codigo === '13119'
          ? { nombre: 'Maipú', codigo: '13119', region: 'Región Metropolitana de Santiago', organismoId: 'muni_13119' }
          : null,
      ),
    };
    TestBed.configureTestingModule({ providers: [{ provide: CatalogoComunasService, useValue: catalogo }] });
    servicio = TestBed.inject(ComunaService);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('dentro del límite: la comuna del catálogo oficial, con su municipalidad', async () => {
    expect(await servicio.detectar({ lat: -33.46, lng: -70.79, accuracy: 10 })).toEqual({
      comuna: 'Maipú',
      region: 'Región Metropolitana de Santiago',
      codigo: '13119',
      organismoId: 'muni_13119',
      fuente: 'limites_oficiales',
    });
  });

  it('en un hueco del polígono (un enclave) no es de esa comuna', async () => {
    expect((await servicio.detectar({ lat: -33.5, lng: -70.75, accuracy: 10 })).comuna).toBeNull();
  });

  it('fuera de toda comuna conocida: sin dato, y el reporte se guarda igual', async () => {
    expect(await servicio.detectar({ lat: -20, lng: -70, accuracy: 10 })).toMatchObject({
      comuna: null,
      organismoId: null,
      fuente: 'no_disponible',
    });
  });

  it('el mismo lugar no se vuelve a calcular', async () => {
    await servicio.detectar({ lat: -33.46, lng: -70.79, accuracy: 10 });
    const llamadas = traer.mock.calls.length;
    await servicio.detectar({ lat: -33.46001, lng: -70.79001, accuracy: 10 });
    expect(traer.mock.calls.length).toBe(llamadas);
  });

  it('si no se pudieron cargar los límites, no lanza y reintenta la próxima vez', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    traer.mockImplementation(async (url: string) => (url.endsWith('indice.json') ? respuesta(INDICE) : respuesta(null, false)));

    expect((await servicio.detectar({ lat: -33.46, lng: -70.79, accuracy: 10 })).comuna).toBeNull();

    traer.mockImplementation(async (url: string) => (url.endsWith('indice.json') ? respuesta(INDICE) : respuesta(REGION)));
    expect((await servicio.detectar({ lat: -33.46, lng: -70.79, accuracy: 10 })).comuna).toBe('Maipú');
  });

  it('sin catálogo para esa comuna conserva lo detectado, con el nombre bien escrito', async () => {
    catalogo.buscar.mockResolvedValue(null);
    expect(await servicio.detectar({ lat: -33.46, lng: -70.79, accuracy: 10 })).toMatchObject({
      comuna: 'Maipú',
      codigo: '13119',
      organismoId: null,
    });
  });
});
