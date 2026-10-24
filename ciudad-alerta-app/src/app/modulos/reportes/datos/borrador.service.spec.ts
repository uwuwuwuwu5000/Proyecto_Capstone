import { TestBed } from '@angular/core/testing';
import { FirebaseError } from 'firebase/app';
import { ToastController } from '@ionic/angular';
import { afterEach, vi } from 'vitest';

import { usarEntornoDePrueba } from '../../../../testing';
import { BorradorReporte, BorradorService, CLAVE_BORRADOR, fotoDesdeGuardada } from './borrador.service';
import { CapturedPhoto } from './camera.service';
import { PrivacidadError, PrivacidadService } from './privacidad.service';
import { NuevoReporte, ReportError, ReportService } from './report.service';

usarEntornoDePrueba({ uid: 'ana' });

const ORIGINAL: CapturedPhoto = {
  dataUrl: `data:image/jpeg;base64,${btoa('jpeg-original')}`,
  blob: new Blob(['jpeg-original'], { type: 'image/jpeg' }),
  mimeType: 'image/jpeg',
  sizeBytes: 13,
  width: 1024,
  height: 768,
};

const PROTEGIDA: CapturedPhoto = {
  ...ORIGINAL,
  dataUrl: `data:image/jpeg;base64,${btoa('jpeg-protegido')}`,
  privacidad: { aplicada: true, rostros: 1, personas: 0, version: 'nube:prueba' },
  embedding: [0.6, 0.8],
};

const DATOS: NuevoReporte = {
  descripcion: '  Bache grande frente al paradero  ',
  categoria: 'calle_deteriorada',
  ubicacion: { lat: -33.45, lng: -70.66, accuracy: 12 },
  foto: null,
  embedding: null,
  comuna: { comuna: 'Maipú', region: 'Metropolitana', codigo: '13119', organismoId: 'muni_13119', fuente: 'limites_oficiales' },
};

type Interno = { yaExiste: (id: string) => Promise<boolean> };

describe('BorradorService', () => {
  let servicio: BorradorService;
  let reportes: { createReport: ReturnType<typeof vi.fn> };
  let privacidad: { anonimizar: ReturnType<typeof vi.fn> };
  let toasts: string[];

  /** Crea el servicio con «sin señal» o «con señal» desde el arranque. */
  async function crear(enLinea: boolean): Promise<void> {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(enLinea);
    servicio = TestBed.inject(BorradorService);
    vi.spyOn(servicio as unknown as Interno, 'yaExiste').mockResolvedValue(false);
    // El servicio carga el borrador cuando Auth avisa de la sesión.
    await vi.waitFor(() => expect(servicio.enviando()).toBe(false));
    await Promise.resolve();
  }

  function guardado(): BorradorReporte | null {
    const texto = localStorage.getItem(CLAVE_BORRADOR);
    return texto ? (JSON.parse(texto) as BorradorReporte) : null;
  }

  function volverLaSenal(): void {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    window.dispatchEvent(new Event('online'));
  }

  beforeEach(() => {
    localStorage.removeItem(CLAVE_BORRADOR);
    toasts = [];
    reportes = { createReport: vi.fn(async () => 'r-nuevo') };
    privacidad = { anonimizar: vi.fn(async () => PROTEGIDA) };

    TestBed.configureTestingModule({
      providers: [
        { provide: ReportService, useValue: reportes },
        { provide: PrivacidadService, useValue: privacidad },
        {
          provide: ToastController,
          useValue: {
            create: async ({ message }: { message: string }) => {
              toasts.push(message);
              return { present: async () => undefined };
            },
          },
        },
      ],
    });
  });

  afterEach(() => {
    localStorage.removeItem(CLAVE_BORRADOR);
    vi.restoreAllMocks();
  });

  it('sin señal guarda el reporte en el teléfono, con un id ya elegido', async () => {
    await crear(false);

    expect(servicio.guardar(DATOS)).toBe('ok');

    const borrador = guardado()!;
    expect(borrador).toMatchObject({
      uid: 'ana',
      categoria: 'calle_deteriorada',
      descripcion: 'Bache grande frente al paradero',
      ubicacion: { lat: -33.45, lng: -70.66 },
      foto: null,
    });
    expect(borrador.id).toMatch(/^[A-Za-z0-9]{20}$/);
    expect(servicio.pendiente()).toEqual(borrador);
    expect(reportes.createReport).not.toHaveBeenCalled();
  });

  it('guarda la foto sin proteger marcada como tal, sin vector', async () => {
    await crear(false);

    servicio.guardar({ ...DATOS, embedding: [1, 0] }, ORIGINAL);

    expect(guardado()!.foto).toEqual({
      dataUrl: ORIGINAL.dataUrl,
      mimeType: 'image/jpeg',
      width: 1024,
      height: 768,
      privacidad: null,
      embedding: null,
    });
  });

  it('hay un borrador a la vez', async () => {
    await crear(false);
    servicio.guardar(DATOS);

    expect(servicio.guardar({ ...DATOS, descripcion: 'Otro problema distinto en la calle' })).toBe('ocupado');
    expect(guardado()!.descripcion).toBe('Bache grande frente al paradero');
  });

  it('si el teléfono no tiene espacio, lo dice y no queda nada a medias', async () => {
    await crear(false);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Quota exceeded', 'QuotaExceededError');
    });

    expect(servicio.guardar(DATOS, ORIGINAL)).toBe('sin_espacio');
    expect(servicio.pendiente()).toBeNull();
  });

  it('al volver la señal, protege la foto, envía el reporte con su id y lo borra del teléfono', async () => {
    await crear(false);
    servicio.guardar(DATOS, ORIGINAL);
    const id = servicio.pendiente()!.id;

    volverLaSenal();

    await vi.waitFor(() => expect(reportes.createReport).toHaveBeenCalled());
    expect(privacidad.anonimizar).toHaveBeenCalledWith(
      expect.objectContaining({ dataUrl: ORIGINAL.dataUrl, mimeType: 'image/jpeg', width: 1024 }),
    );
    expect(reportes.createReport).toHaveBeenCalledWith(
      expect.objectContaining({
        id,
        descripcion: 'Bache grande frente al paradero',
        categoria: 'calle_deteriorada',
        foto: PROTEGIDA,
        embedding: [0.6, 0.8],
        comuna: DATOS.comuna,
      }),
    );
    await vi.waitFor(() => expect(servicio.pendiente()).toBeNull());
    expect(guardado()).toBeNull();
    expect(toasts).toContain('Enviamos el reporte que guardaste sin señal.');
  });

  it('si ya había llegado a Firestore, no lo vuelve a crear', async () => {
    await crear(false);
    servicio.guardar(DATOS);
    vi.spyOn(servicio as unknown as Interno, 'yaExiste').mockResolvedValue(true);

    volverLaSenal();

    await vi.waitFor(() => expect(servicio.pendiente()).toBeNull());
    expect(reportes.createReport).not.toHaveBeenCalled();
  });

  it('si falla, lo conserva con el motivo; la foto ya protegida no se vuelve a procesar', async () => {
    await crear(false);
    servicio.guardar(DATOS, ORIGINAL);
    reportes.createReport.mockRejectedValueOnce(new ReportError('Espera 20 segundos antes de enviar otro reporte.'));

    volverLaSenal();

    await vi.waitFor(() => expect(servicio.error()).toBe('Espera 20 segundos antes de enviar otro reporte.'));
    expect(servicio.pendiente()!.foto!.privacidad).toEqual(PROTEGIDA.privacidad);
    expect(guardado()!.foto!.dataUrl).toBe(PROTEGIDA.dataUrl);

    expect(await servicio.enviar()).toBe(true);
    expect(privacidad.anonimizar).toHaveBeenCalledTimes(1);
    expect(servicio.pendiente()).toBeNull();
  });

  it('si la foto no se puede proteger, no envía nada', async () => {
    await crear(false);
    servicio.guardar(DATOS, ORIGINAL);
    privacidad.anonimizar.mockRejectedValueOnce(new PrivacidadError('No pudimos leer la imagen.', 'imagen'));

    volverLaSenal();

    await vi.waitFor(() => expect(servicio.error()).toBe('No pudimos leer la imagen.'));
    expect(reportes.createReport).not.toHaveBeenCalled();
    expect(servicio.pendiente()).not.toBeNull();
  });

  it('una falla de red se explica en palabras simples, no con el mensaje de Firebase', async () => {
    await crear(false);
    servicio.guardar(DATOS);
    vi.spyOn(servicio as unknown as Interno, 'yaExiste').mockRejectedValue(
      new FirebaseError('unavailable', 'Failed to get document because the client is offline.'),
    );

    volverLaSenal();

    await vi.waitFor(() => expect(servicio.error()).toContain('La conexión no alcanzó'));
    expect(servicio.pendiente()).not.toBeNull();
  });

  it('al abrir la app con señal y un borrador guardado, lo envía', async () => {
    const borrador: BorradorReporte = {
      id: 'r-guardado',
      uid: 'ana',
      categoria: 'luminaria',
      descripcion: 'Luminaria apagada hace una semana',
      ubicacion: { lat: -33.5, lng: -70.7, accuracy: 15 },
      comuna: null,
      foto: null,
      guardadoAt: Date.now(),
    };
    localStorage.setItem(CLAVE_BORRADOR, JSON.stringify(borrador));

    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    servicio = TestBed.inject(BorradorService);
    vi.spyOn(servicio as unknown as Interno, 'yaExiste').mockResolvedValue(false);

    await vi.waitFor(() => expect(reportes.createReport).toHaveBeenCalledWith(expect.objectContaining({ id: 'r-guardado' })));
    await vi.waitFor(() => expect(guardado()).toBeNull());
  });

  it('el borrador de otra persona no se muestra ni se envía', async () => {
    localStorage.setItem(
      CLAVE_BORRADOR,
      JSON.stringify({ id: 'x', uid: 'luis', categoria: 'otro', descripcion: 'Algo de otra cuenta', ubicacion: { lat: 0, lng: 0 } }),
    );

    await crear(true);

    expect(servicio.pendiente()).toBeNull();
    expect(reportes.createReport).not.toHaveBeenCalled();
    expect(guardado()!.uid).toBe('luis');
  });

  it('descartar lo borra del teléfono', async () => {
    await crear(false);
    servicio.guardar(DATOS);

    servicio.descartar();

    expect(servicio.pendiente()).toBeNull();
    expect(guardado()).toBeNull();
  });
});

describe('fotoDesdeGuardada', () => {
  it('rearma el binario desde el data URL', () => {
    const foto = fotoDesdeGuardada({
      dataUrl: `data:image/jpeg;base64,${btoa('hola')}`,
      mimeType: 'image/jpeg',
      width: 10,
      height: 20,
      privacidad: null,
      embedding: null,
    });

    expect(foto.sizeBytes).toBe(4);
    expect(foto.blob.size).toBe(4);
    expect(foto.blob.type).toBe('image/jpeg');
    expect(foto.privacidad).toBeUndefined();
  });
});
