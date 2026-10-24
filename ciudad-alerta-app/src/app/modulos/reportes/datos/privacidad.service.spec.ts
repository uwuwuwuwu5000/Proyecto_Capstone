import { TestBed } from '@angular/core/testing';
import { afterEach, vi } from 'vitest';

import { FIREBASE_AUTH } from '../../../core/firebase.providers';
import { usarEntornoDePrueba } from '../../../../testing';
import { authDePrueba } from '../../../../testing/firebase-de-prueba';
import { PARAMETROS_PRIVACIDAD } from '../parametros';
import { CapturedPhoto } from './camera.service';
import { PrivacidadError, PrivacidadService } from './privacidad.service';

usarEntornoDePrueba({ uid: 'vecino-1' });

const ORIGINAL: CapturedPhoto = {
  dataUrl: 'data:image/jpeg;base64,AAEC',
  blob: new Blob([new Uint8Array([0, 1, 2])], { type: 'image/jpeg' }),
  mimeType: 'image/jpeg',
  sizeBytes: 3,
  width: 1024,
  height: 768,
};

const PROTEGIDA = {
  imagen: `data:image/jpeg;base64,${btoa('jpeg-protegido')}`,
  mimeType: 'image/jpeg',
  sizeBytes: 14,
  ancho: 1024,
  alto: 768,
  privacidad: { aplicada: true, rostros: 2, personas: 1, version: 'nube:prueba' },
  embedding: [0.6, 0.8],
  ms: 280,
};

/** Respuesta mínima de fetch: solo lo que lee el servicio. */
function respuesta(cuerpo: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => cuerpo } as Response;
}

/** fetch que no responde hasta que se aborta, como el real con la red caída. */
function fetchColgado() {
  return vi.fn(
    (_url: string, init?: RequestInit) =>
      new Promise<Response>((_resolver, rechazar) => {
        init?.signal?.addEventListener('abort', () =>
          rechazar(new DOMException('The operation was aborted.', 'AbortError')),
        );
      }),
  );
}

async function fallo(promesa: Promise<unknown>): Promise<PrivacidadError> {
  try {
    await promesa;
  } catch (error) {
    expect(error).toBeInstanceOf(PrivacidadError);
    return error as PrivacidadError;
  }
  throw new Error('Se esperaba un PrivacidadError');
}

describe('PrivacidadService', () => {
  let service: PrivacidadService;

  beforeEach(() => {
    service = TestBed.inject(PrivacidadService);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('envía la foto con el token de sesión y devuelve la versión protegida con su vector', async () => {
    const fetchFalso = vi.fn(async () => respuesta(PROTEGIDA));
    vi.stubGlobal('fetch', fetchFalso);

    const protegida = await service.anonimizar(ORIGINAL);

    expect(fetchFalso).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFalso.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${PARAMETROS_PRIVACIDAD.url}/v1/proteger`);
    expect(init.method).toBe('POST');
    expect(init.body).toBe(ORIGINAL.blob);
    expect(init.headers).toEqual({ Authorization: 'Bearer token-de-prueba', 'Content-Type': 'image/jpeg' });

    expect(protegida.dataUrl).toBe(PROTEGIDA.imagen);
    expect(protegida.mimeType).toBe('image/jpeg');
    expect(protegida.blob.size).toBe('jpeg-protegido'.length);
    expect(protegida.sizeBytes).toBe('jpeg-protegido'.length);
    expect(protegida.width).toBe(1024);
    expect(protegida.height).toBe(768);
    expect(protegida.privacidad).toEqual(PROTEGIDA.privacidad);
    expect(protegida.embedding).toEqual([0.6, 0.8]);
    expect(service.estado()).toBe('inactivo');
    expect(service.ultimoErrorTecnico()).toBeNull();
  });

  it('acepta una respuesta sin vector (MobileNet no disponible en el servidor)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => respuesta({ ...PROTEGIDA, embedding: null })));

    const protegida = await service.anonimizar(ORIGINAL);

    expect(protegida.embedding).toBeNull();
    expect(protegida.privacidad?.aplicada).toBe(true);
  });

  it('rechaza una respuesta que no confirma la protección', async () => {
    const sinAplicar = { ...PROTEGIDA, privacidad: { ...PROTEGIDA.privacidad, aplicada: false } };
    vi.stubGlobal('fetch', vi.fn(async () => respuesta(sinAplicar)));

    const error = await fallo(service.anonimizar(ORIGINAL));

    expect(error.code).toBe('servicio');
  });

  it.each([
    [401, { error: 'sin_sesion' }, 'sesion'],
    [413, { error: 'foto_muy_grande', mensaje: 'La foto pesa más de 6 MB.' }, 'imagen'],
    [422, { error: 'imagen_invalida' }, 'imagen'],
    [429, { error: 'demasiadas_fotos', mensaje: 'Espera 2 minutos.' }, 'limite'],
    [500, { error: 'error_interno' }, 'servicio'],
    [503, { error: 'ocupado' }, 'servicio'],
  ] as const)('traduce HTTP %i a un error «%s»', async (status, cuerpo, codigo) => {
    vi.stubGlobal('fetch', vi.fn(async () => respuesta(cuerpo, status)));

    const error = await fallo(service.anonimizar(ORIGINAL));

    expect(error.code).toBe(codigo);
    expect(service.ultimoErrorTecnico()).toBe(`HTTP ${status} · ${cuerpo.error}`);
    if ('mensaje' in cuerpo) {
      expect(error.message).toBe(cuerpo.mensaje);
    }
    expect(service.estado()).toBe('inactivo');
  });

  it('sin conexión devuelve un error de red con el detalle técnico', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))));

    const error = await fallo(service.anonimizar(ORIGINAL));

    expect(error.code).toBe('red');
    expect(error.message).toContain('conexión');
    expect(service.ultimoErrorTecnico()).toBe('TypeError: Failed to fetch');
  });

  it('avisa que el servicio está despertando cuando tarda', async () => {
    vi.useFakeTimers();
    const fetchFalso = fetchColgado();
    vi.stubGlobal('fetch', fetchFalso);

    const promesa = service.anonimizar(ORIGINAL);
    const resultado = fallo(promesa);
    await vi.waitFor(() => expect(fetchFalso).toHaveBeenCalled());
    expect(service.estado()).toBe('enviando');

    await vi.advanceTimersByTimeAsync(PARAMETROS_PRIVACIDAD.avisoLentoMs);
    expect(service.estado()).toBe('despertando');

    service.cancelar();
    await resultado;
    expect(service.estado()).toBe('inactivo');
  });

  it('se puede cancelar mientras espera', async () => {
    const fetchFalso = fetchColgado();
    vi.stubGlobal('fetch', fetchFalso);

    const promesa = service.anonimizar(ORIGINAL);
    await vi.waitFor(() => expect(fetchFalso).toHaveBeenCalled());
    service.cancelar();

    const error = await fallo(promesa);
    expect(error.code).toBe('cancelado');
    expect(service.ultimoErrorTecnico()).toBeNull();
  });

  it('deja de esperar al llegar al tiempo máximo', async () => {
    vi.useFakeTimers();
    const fetchFalso = fetchColgado();
    vi.stubGlobal('fetch', fetchFalso);

    const resultado = fallo(service.anonimizar(ORIGINAL));
    await vi.waitFor(() => expect(fetchFalso).toHaveBeenCalled());
    await vi.advanceTimersByTimeAsync(PARAMETROS_PRIVACIDAD.tiempoMaximoMs);

    const error = await resultado;
    expect(error.code).toBe('red');
    expect(error.message).toContain('a tiempo');
  });

  it('consultarEstado() cuenta lo que dice /salud y cuánto tardó', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => respuesta({ listo: true, similitud: false, backend: 'wasm', version: '1.0.0', error: null })),
    );

    const estado = await service.consultarEstado();

    expect(estado).toMatchObject({ responde: true, listo: true, similitud: false, backend: 'wasm', version: '1.0.0', error: null });
    expect(estado.ms).toBeGreaterThanOrEqual(0);
  });

  it('consultarEstado() sin red no lanza: dice que no responde', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))));

    expect(await service.consultarEstado()).toMatchObject({ responde: false, listo: false, error: 'TypeError: Failed to fetch' });
  });

  it('despertar() consulta /salud y no falla si no hay red', async () => {
    const fetchFalso = vi.fn(async () => Promise.reject(new TypeError('Failed to fetch')));
    vi.stubGlobal('fetch', fetchFalso);

    expect(() => service.despertar()).not.toThrow();
    await Promise.resolve();

    expect(fetchFalso).toHaveBeenCalledWith(`${PARAMETROS_PRIVACIDAD.url}/salud`, { cache: 'no-store' });
  });
});

describe('PrivacidadService sin sesión', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [{ provide: FIREBASE_AUTH, useFactory: () => authDePrueba(null) }],
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  it('no envía la foto si no hay sesión', async () => {
    const fetchFalso = vi.fn();
    vi.stubGlobal('fetch', fetchFalso);

    const error = await fallo(TestBed.inject(PrivacidadService).anonimizar(ORIGINAL));

    expect(error.code).toBe('sesion');
    expect(fetchFalso).not.toHaveBeenCalled();
  });
});
