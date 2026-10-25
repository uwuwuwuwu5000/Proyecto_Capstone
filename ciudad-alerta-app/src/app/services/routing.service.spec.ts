import { TestBed } from '@angular/core/testing';
import { FirebaseError } from 'firebase/app';
import { vi } from 'vitest';

import { ORGANISMOS } from '../models/organismo.model';
import { ComunaDetectada } from './comuna.service';
import { RoutingService } from './routing.service';
import { usarEntornoDePrueba } from '../../testing';

usarEntornoDePrueba();

const MAIPU: ComunaDetectada = {
  comuna: 'Maipú',
  region: 'Región Metropolitana de Santiago',
  codigo: '13119',
  organismoId: 'muni_13119',
  fuente: 'limites_oficiales',
};

type Interno = {
  leerOrganismo: (id: string) => Promise<unknown>;
  consultarOperadores: (id: string) => Promise<unknown>;
};

/** Documento de `organismos` como lo devuelve getDoc. */
const documento = (datos: Record<string, unknown> | null) => ({
  exists: () => datos !== null,
  data: () => datos ?? undefined,
});

/** Resultado de la consulta de `operadores`. */
const operadores = (...ids: string[]) => ({ docs: ids.map((id) => ({ id, data: () => ({ id }) })) });

const sinRed = () => new FirebaseError('unavailable', 'Failed to get document because the client is offline.');

describe('RoutingService · a quién se deriva un reporte', () => {
  let servicio: RoutingService;
  let interno: Interno;

  beforeEach(() => {
    servicio = TestBed.inject(RoutingService);
    interno = servicio as unknown as Interno;
  });

  it('sin municipalidad identificada, usa el organismo genérico de la categoría', async () => {
    const leer = vi.spyOn(interno, 'leerOrganismo');

    expect(await servicio.resolveOrganismo('fuga_agua', null)).toEqual(ORGANISMOS.fuga_agua);
    expect(await servicio.resolveOrganismo('otro', { ...MAIPU, organismoId: null })).toEqual(ORGANISMOS.otro);
    expect(leer).not.toHaveBeenCalled();
  });

  it('con la municipalidad activa, la usa (copia reducida) y no la vuelve a leer', async () => {
    const leer = vi.spyOn(interno, 'leerOrganismo').mockResolvedValue(
      documento({
        id: 'muni_13119',
        nombre: 'Municipalidad de Maipú',
        tipo: 'municipio',
        comuna: 'Maipú',
        activo: true,
        comunasAtendidas: ['13119'],
      }),
    );

    const primero = await servicio.resolveOrganismo('luminaria', MAIPU);
    const segundo = await servicio.resolveOrganismo('microbasural', MAIPU);

    expect(primero).toEqual({ id: 'muni_13119', nombre: 'Municipalidad de Maipú', tipo: 'municipio', comuna: 'Maipú' });
    expect(segundo).toEqual(primero);
    expect(leer).toHaveBeenCalledTimes(1);
  });

  it('una municipalidad inactiva o que no está en el catálogo da el genérico', async () => {
    vi.spyOn(interno, 'leerOrganismo').mockResolvedValueOnce(documento({ id: 'muni_13119', activo: false }));
    expect(await servicio.resolveOrganismo('luminaria', MAIPU)).toEqual(ORGANISMOS.luminaria);

    vi.spyOn(interno, 'leerOrganismo').mockResolvedValueOnce(documento(null));
    expect(await servicio.resolveOrganismo('luminaria', { ...MAIPU, organismoId: 'muni_99999' })).toEqual(
      ORGANISMOS.luminaria,
    );
  });

  it('sin conexión no deriva a la OIRS genérica: avisa, y la próxima vez vuelve a leer', async () => {
    const leer = vi
      .spyOn(interno, 'leerOrganismo')
      .mockRejectedValueOnce(sinRed())
      .mockResolvedValueOnce(documento({ id: 'muni_13119', nombre: 'Municipalidad de Maipú', tipo: 'municipio', activo: true }));

    await expect(servicio.resolveOrganismo('luminaria', MAIPU)).rejects.toMatchObject({ code: 'unavailable' });
    expect((await servicio.resolveOrganismo('luminaria', MAIPU)).id).toBe('muni_13119');
    expect(leer).toHaveBeenCalledTimes(2);
  });

  it('otro error de lectura (no de red) sigue con el genérico, como antes', async () => {
    vi.spyOn(interno, 'leerOrganismo').mockRejectedValue(new FirebaseError('permission-denied', 'no'));
    expect(await servicio.resolveOrganismo('luminaria', MAIPU)).toEqual(ORGANISMOS.luminaria);
  });

  it('los organismos genéricos no tienen operador y no se consultan', async () => {
    const consultar = vi.spyOn(interno, 'consultarOperadores');

    expect(await servicio.resolveOperador('muni_oirs')).toBeNull();
    expect(await servicio.resolveOperador('sanitaria')).toBeNull();
    expect(consultar).not.toHaveBeenCalled();
  });

  it('con varios operadores activos elige siempre el mismo (orden alfabético) y lo recuerda', async () => {
    const consultar = vi.spyOn(interno, 'consultarOperadores').mockResolvedValue(operadores('op_maipu_b', 'op_maipu_a'));

    expect(await servicio.resolveOperador('muni_13119')).toBe('op_maipu_a');
    expect(await servicio.resolveOperador('muni_13119')).toBe('op_maipu_a');
    expect(consultar).toHaveBeenCalledTimes(1);
  });

  it('sin operadores activos, null', async () => {
    vi.spyOn(interno, 'consultarOperadores').mockResolvedValue(operadores());
    expect(await servicio.resolveOperador('muni_13119')).toBeNull();
  });

  it('sin conexión no deja el reporte sin operador: avisa', async () => {
    vi.spyOn(interno, 'consultarOperadores').mockRejectedValue(sinRed());
    await expect(servicio.resolveOperador('muni_13119')).rejects.toMatchObject({ code: 'unavailable' });
  });
});
