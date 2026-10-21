import { TestBed } from '@angular/core/testing';

import { CatalogoComunasService, ComunaCatalogo } from '../../../services/catalogo-comunas.service';
import { ComunaDetectada, ComunaService } from '../../../services/comuna.service';
import { RegionesService } from './regiones.service';

const RM = 'Región Metropolitana de Santiago';
const V = 'Región de Valparaíso';

const comunas: ComunaCatalogo[] = [
  { codigo: '13119', nombre: 'Maipú', clave: 'maipu', codigoRegion: '13', region: RM, organismoId: 'muni_13119' },
  { codigo: '13125', nombre: 'Quilicura', clave: 'quilicura', codigoRegion: '13', region: RM, organismoId: 'muni_13125' },
  { codigo: '05101', nombre: 'Valparaíso', clave: 'valparaiso', codigoRegion: '05', region: V, organismoId: 'muni_05101' },
  { codigo: '05201', nombre: 'Isla de Pascua', clave: 'isla de pascua', codigoRegion: '05', region: V, organismoId: 'muni_05201' },
];

/** Cajas [minLng, minLat, maxLng, maxLat] como en assets/geo/indice.json. */
const indice = {
  comunas: [
    { cut: '13119', region: '13', caja: [-70.9, -33.6, -70.7, -33.4] },
    { cut: '13125', region: '13', caja: [-70.8, -33.4, -70.6, -33.3] },
    { cut: '05101', region: '05', caja: [-71.7, -33.2, -71.5, -32.9] },
    // Isla de Pascua: no debe alejar el encuadre de Valparaíso hasta el Pacífico.
    { cut: '05201', region: '05', caja: [-109.5, -27.2, -109.2, -27.0] },
  ],
};

const sinComuna: ComunaDetectada = { comuna: null, region: null, codigo: null, organismoId: null, fuente: 'no_disponible' };

describe('RegionesService', () => {
  let detectar: ReturnType<typeof vi.fn>;
  let servicio: RegionesService;

  beforeEach(() => {
    detectar = vi.fn().mockResolvedValue(sinComuna);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => indice }));
    TestBed.configureTestingModule({
      providers: [
        { provide: CatalogoComunasService, useValue: { todas: async () => comunas } },
        { provide: ComunaService, useValue: { detectar } },
      ],
    });
    servicio = TestBed.inject(RegionesService);
  });

  afterEach(() => vi.unstubAllGlobals());

  it('agrupa las comunas por región, de norte a sur, con nombre corto', async () => {
    const regiones = await servicio.todas();

    expect(regiones.map((r) => r.codigo)).toEqual(['05', '13']);
    expect(regiones[1]).toMatchObject({ nombre: RM, nombreCorto: 'Metropolitana de Santiago', comunas: ['Maipú', 'Quilicura'] });
  });

  it('la caja de la región une las de sus comunas, sin las islas oceánicas', async () => {
    const [valparaiso, metropolitana] = await servicio.todas();

    expect(metropolitana.caja).toEqual({ minLat: -33.6, minLng: -70.9, maxLat: -33.3, maxLng: -70.6 });
    expect(valparaiso.caja).toEqual({ minLat: -33.2, minLng: -71.7, maxLat: -32.9, maxLng: -71.5 });
  });

  it('la región de un punto sale de la comuna detectada', async () => {
    detectar.mockResolvedValue({ ...sinComuna, comuna: 'Maipú', codigo: '13119', region: RM, fuente: 'limites_oficiales' });
    expect((await servicio.regionDe({ lat: -33.5, lng: -70.8, accuracy: 10 }))?.codigo).toBe('13');
  });

  it('fuera de toda comuna (en el mar, cerca de la costa) usa la caja que lo contiene', async () => {
    expect((await servicio.regionDe({ lat: -33.0, lng: -71.6, accuracy: 10 }))?.codigo).toBe('05');
    expect(await servicio.regionDe({ lat: -40, lng: -60, accuracy: 10 })).toBeNull();
  });

  it('el catálogo se arma una sola vez', async () => {
    await Promise.all([servicio.todas(), servicio.porCodigo('13')]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
