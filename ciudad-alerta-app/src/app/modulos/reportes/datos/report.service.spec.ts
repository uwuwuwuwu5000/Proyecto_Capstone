import { TestBed } from '@angular/core/testing';
import { FirebaseError } from 'firebase/app';
import { Timestamp } from 'firebase/firestore';
import { vi } from 'vitest';

import { ORGANISMOS } from '../../../models/organismo.model';
import { INTERVALO_MINIMO_REPORTE_MS } from '../../../models/user-profile.model';
import { AuthService } from '../../../services/auth.service';
import { ComunaDetectada, ComunaService } from '../../../services/comuna.service';
import { RoutingService } from '../../../services/routing.service';
import { CapturedPhoto } from './camera.service';
import { NuevoReporte, ReportError, ReportService } from './report.service';
import { usarEntornoDePrueba } from '../../../../testing';

usarEntornoDePrueba();

const MAIPU: ComunaDetectada = {
  comuna: 'Maipú',
  region: 'Región Metropolitana de Santiago',
  codigo: '13119',
  organismoId: 'muni_13119',
  fuente: 'limites_oficiales',
};
const MUNI = { id: 'muni_13119', nombre: 'Municipalidad de Maipú', tipo: 'municipio' as const, comuna: 'Maipú' };

const DATOS: NuevoReporte = {
  descripcion: '  Bache grande frente al paradero 3  ',
  categoria: 'calle_deteriorada',
  ubicacion: { lat: -33.51, lng: -70.76, accuracy: 12 },
  foto: null,
  comuna: MAIPU,
};

const FOTO: CapturedPhoto = {
  dataUrl: 'data:image/jpeg;base64,AAEC',
  blob: new Blob([new Uint8Array([0, 1, 2])], { type: 'image/jpeg' }),
  mimeType: 'image/jpeg',
  sizeBytes: 3,
  width: 1024,
  height: 768,
};

type Interno = {
  guardarDocumento: (ref: { id: string }, documento: Record<string, unknown>) => Promise<void>;
  marcarUltimoReporte: (uid: string) => Promise<void>;
};

const sinRed = () => new FirebaseError('unavailable', 'client is offline');

async function falla(promesa: Promise<unknown>): Promise<ReportError> {
  try {
    await promesa;
  } catch (error) {
    expect(error).toBeInstanceOf(ReportError);
    return error as ReportError;
  }
  throw new Error('Se esperaba un ReportError');
}

describe('ReportService.createReport', () => {
  let servicio: ReportService;
  let auth: { user: { uid: string; displayName: string | null; email: string } | null; getUserProfile: ReturnType<typeof vi.fn> };
  let ruteo: { resolveOrganismo: ReturnType<typeof vi.fn>; resolveOperador: ReturnType<typeof vi.fn> };
  let comunas: { detectar: ReturnType<typeof vi.fn> };
  let guardar: ReturnType<typeof vi.fn<Interno['guardarDocumento']>>;

  beforeEach(() => {
    auth = {
      user: { uid: 'ana', displayName: 'Ana de Auth', email: 'ana@prueba.cl' },
      getUserProfile: vi.fn(async () => ({ uid: 'ana', displayName: 'Ana Pérez', email: 'ana@prueba.cl', role: 'ciudadano' })),
    };
    ruteo = { resolveOrganismo: vi.fn(async () => MUNI), resolveOperador: vi.fn(async () => 'op_maipu') };
    comunas = { detectar: vi.fn(async () => MAIPU) };

    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: auth },
        { provide: RoutingService, useValue: ruteo },
        { provide: ComunaService, useValue: comunas },
      ],
    });
    servicio = TestBed.inject(ReportService);
    guardar = vi.fn<Interno['guardarDocumento']>(async () => undefined);
    vi.spyOn(servicio as unknown as Interno, 'guardarDocumento').mockImplementation(guardar);
    vi.spyOn(servicio as unknown as Interno, 'marcarUltimoReporte').mockResolvedValue(undefined);
  });

  it('guarda el reporte derivado a la municipalidad y su operador, firmado con el nombre del perfil', async () => {
    const id = await servicio.createReport(DATOS);

    expect(id).toMatch(/^[A-Za-z0-9]{20}$/);
    const [referencia, documento] = guardar.mock.calls[0] as [{ id: string }, Record<string, unknown>];
    expect(referencia.id).toBe(id);
    expect(documento).toMatchObject({
      uid: 'ana',
      descripcion: 'Bache grande frente al paradero 3',
      categoria: 'calle_deteriorada',
      comuna: 'Maipú',
      region: 'Región Metropolitana de Santiago',
      comunaFuente: 'limites_oficiales',
      autorNombre: 'Ana Pérez',
      estado: 'reportado',
      confirmaciones: 0,
      organismo: MUNI,
      operadorId: 'op_maipu',
      foto: null,
      embedding: null,
    });
    expect(documento['geohash']).toMatch(/^66j/);
    expect(ruteo.resolveOrganismo).toHaveBeenCalledWith('calle_deteriorada', MAIPU);
    expect(ruteo.resolveOperador).toHaveBeenCalledWith('muni_13119');
  });

  it('guarda si el punto salió del GPS o se eligió en el mapa', async () => {
    await servicio.createReport({ ...DATOS, ubicacion: { lat: -33.512, lng: -70.759, accuracy: 0, fuente: 'mapa' } });
    await servicio.createReport({ ...DATOS, ubicacion: { ...DATOS.ubicacion, fuente: 'gps' } });

    const ubicaciones = guardar.mock.calls.map(([, documento]) => (documento as Record<string, unknown>)['ubicacion']);
    expect(ubicaciones).toEqual([
      { lat: -33.512, lng: -70.759, accuracy: 0, fuente: 'mapa' },
      { lat: -33.51, lng: -70.76, accuracy: 12, fuente: 'gps' },
    ]);
  });

  it('con un id elegido (borrador sin conexión), usa ese id', async () => {
    expect(await servicio.createReport({ ...DATOS, id: 'borrador123' })).toBe('borrador123');
  });

  it('si no se sabía la comuna, la detecta antes de derivar', async () => {
    await servicio.createReport({ ...DATOS, comuna: null });
    expect(comunas.detectar).toHaveBeenCalledWith(DATOS.ubicacion);
  });

  it('sin sesión no escribe', async () => {
    auth.user = null;
    const error = await falla(servicio.createReport(DATOS));
    expect(error.message).toContain('sesión');
    expect(guardar).not.toHaveBeenCalled();
  });

  it('una foto que no pasó por la protección no se publica', async () => {
    const error = await falla(servicio.createReport({ ...DATOS, foto: FOTO }));
    expect(error.message).toContain('protección de privacidad');
    expect(guardar).not.toHaveBeenCalled();
  });

  it.each([
    ['muy corta', 'corta', 'al menos'],
    ['muy larga', 'x'.repeat(501), 'superar'],
  ])('una descripción %s se rechaza antes de escribir', async (_caso, descripcion, texto) => {
    const error = await falla(servicio.createReport({ ...DATOS, descripcion }));
    expect(error.message).toContain(texto);
    expect(guardar).not.toHaveBeenCalled();
  });

  it('unas coordenadas imposibles se rechazan', async () => {
    const error = await falla(servicio.createReport({ ...DATOS, ubicacion: { lat: 120, lng: 0, accuracy: 5 } }));
    expect(error.message).toContain('coordenadas');
  });

  it('respeta el intervalo mínimo entre reportes', async () => {
    auth.getUserProfile.mockResolvedValue({
      uid: 'ana',
      displayName: 'Ana Pérez',
      email: 'ana@prueba.cl',
      ultimoReporteAt: Timestamp.fromMillis(Date.now() - INTERVALO_MINIMO_REPORTE_MS / 2),
    });

    const error = await falla(servicio.createReport(DATOS));

    expect(error.message).toMatch(/Espera \d+ segundos/);
    expect(guardar).not.toHaveBeenCalled();
  });

  it.each([
    ['leer el perfil', () => auth.getUserProfile.mockRejectedValue(sinRed())],
    ['buscar la municipalidad', () => ruteo.resolveOrganismo.mockRejectedValue(sinRed())],
    ['buscar el operador', () => ruteo.resolveOperador.mockRejectedValue(sinRed())],
  ])('sin conexión al %s, no escribe nada a medias: avisa con código «red»', async (_paso, preparar) => {
    preparar();

    const error = await falla(servicio.createReport(DATOS));

    expect(error.code).toBe('red');
    expect(guardar).not.toHaveBeenCalled();
  });

  it('un perfil ilegible por otra causa no detiene el reporte (lo revisan las reglas)', async () => {
    auth.getUserProfile.mockRejectedValue(new FirebaseError('permission-denied', 'no'));

    await servicio.createReport(DATOS);

    expect((guardar.mock.calls[0][1] as { autorNombre: string }).autorNombre).toBe('Ana de Auth');
  });

  it('si las reglas rechazan la escritura, lo explica sin el mensaje en inglés', async () => {
    guardar.mockRejectedValue(new FirebaseError('permission-denied', 'Missing or insufficient permissions.'));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const error = await falla(servicio.createReport(DATOS));

    expect(error.code).toBe('otro');
    expect(error.message).toContain('No tienes permiso');
  });

  it('sin organismo en el catálogo usa el genérico, que las reglas aceptan', async () => {
    ruteo.resolveOrganismo.mockResolvedValue(ORGANISMOS.otro);
    ruteo.resolveOperador.mockResolvedValue(null);

    await servicio.createReport({ ...DATOS, categoria: 'otro' });

    expect(guardar.mock.calls[0][1]).toMatchObject({ organismo: ORGANISMOS.otro, operadorId: null });
  });
});
