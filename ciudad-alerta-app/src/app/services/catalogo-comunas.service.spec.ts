import { TestBed } from '@angular/core/testing';

import { CatalogoComunasService, ComunaCatalogo } from './catalogo-comunas.service';

function comuna(codigo: string, nombre: string, codigoRegion: string, region: string): ComunaCatalogo {
  return { codigo, nombre, clave: CatalogoComunasService.clave(nombre), codigoRegion, region, organismoId: `muni_${codigo}` };
}

const CATALOGO_DE_PRUEBA: ComunaCatalogo[] = [
  comuna('13119', 'Maipú', '13', 'Región Metropolitana de Santiago'),
  comuna('13125', 'Quilicura', '13', 'Región Metropolitana de Santiago'),
  comuna('13604', 'Tiltil', '13', 'Región Metropolitana de Santiago'),
  comuna('11101', 'Coyhaique', '11', 'Región de Aysén del General Carlos Ibáñez del Campo'),
  comuna('05101', 'Valparaíso', '05', 'Región de Valparaíso'),
  comuna('05201', 'Isla de Pascua', '05', 'Región de Valparaíso'),
];

describe('CatalogoComunasService', () => {
  let fetch: ReturnType<typeof vi.fn>;
  let catalogo: CatalogoComunasService;

  beforeEach(() => {
    fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ comunas: CATALOGO_DE_PRUEBA }) });
    vi.stubGlobal('fetch', fetch);
    catalogo = TestBed.inject(CatalogoComunasService);
  });

  afterEach(() => vi.unstubAllGlobals());

  it('busca por código CUT, también sin el cero inicial', async () => {
    expect((await catalogo.buscar('13119', null))?.nombre).toBe('Maipú');
    expect((await catalogo.buscar('5101', null))?.nombre).toBe('Valparaíso');
  });

  it('busca por nombre sin importar tildes ni mayúsculas', async () => {
    expect((await catalogo.buscar(null, 'MAIPU'))?.codigo).toBe('13119');
  });

  it('entiende las variantes ortográficas de otras fuentes', async () => {
    expect((await catalogo.buscar(null, 'Coihaique'))?.codigo).toBe('11101');
    expect((await catalogo.buscar(null, 'Til Til'))?.codigo).toBe('13604');
  });

  it('descarga el catálogo una sola vez', async () => {
    await Promise.all([catalogo.todas(), catalogo.buscar('13119', null)]);
    await catalogo.todas();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('si la descarga falla, reintenta en la próxima llamada', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    fetch.mockResolvedValueOnce({ ok: false, status: 503 });

    expect(await catalogo.todas()).toEqual([]);
    expect(await catalogo.todas()).toHaveLength(CATALOGO_DE_PRUEBA.length);
  });
});
