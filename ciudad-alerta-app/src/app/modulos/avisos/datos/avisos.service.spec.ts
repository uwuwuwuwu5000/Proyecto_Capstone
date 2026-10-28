import { TestBed } from '@angular/core/testing';
import { Timestamp } from 'firebase/firestore';
import { Subject } from 'rxjs';
import { afterEach, vi } from 'vitest';

import { Report } from '../../../models/report.model';
import { AvisoSinVisto } from '../modelo/aviso.model';
import { AuthService } from '../../../services/auth.service';
import { AvisosService } from './avisos.service';
import { usarEntornoDePrueba } from '../../../../testing';

usarEntornoDePrueba();

const CREADO = Timestamp.fromMillis(Date.UTC(2026, 9, 1, 12));
const VEREDICTO_AT = Timestamp.fromMillis(Date.UTC(2026, 9, 3, 15));

function reporte(validacion: Report['validacion'], cambios: Partial<Report> = {}): Report {
  return {
    id: 'r1',
    uid: 'vecina',
    descripcion: 'Microbasural en la esquina de la plaza',
    estado: 'en_revision',
    createdAt: CREADO,
    updatedAt: VEREDICTO_AT,
    validacion,
    ...cambios,
  } as Report;
}

/**
 * Acceso a lo privado del servicio: la escucha real necesita Firestore, así
 * que la prueba entrega los reportes directo a `procesar` y simula el
 * historial de estados.
 */
type Interno = {
  uid: string | null;
  procesar: (uid: string, reportes: Report[]) => Promise<void>;
  leerAvisos: (uid: string, reporte: Report) => Promise<AvisoSinVisto[]>;
};

describe('AvisosService', () => {
  let service: AvisosService;
  let interno: Interno;
  let historial: ReturnType<typeof vi.fn<Interno['leerAvisos']>>;

  beforeEach(async () => {
    service = TestBed.inject(AvisosService);
    // Deja pasar el primer aviso de sesión (cerrada), que reinicia el servicio.
    await new Promise((resolver) => setTimeout(resolver, 0));
    interno = service as unknown as Interno;
    interno.uid = 'vecina';
    historial = vi.fn<Interno['leerAvisos']>(async () => []);
    interno.leerAvisos = historial;
  });

  it('un veredicto real es un aviso con los puntos que sumó', async () => {
    await interno.procesar('vecina', [
      reporte({ veredicto: 'real', veredictoPor: 'op', veredictoAt: VEREDICTO_AT, veredictoPuntos: 10 }),
    ]);

    expect(service.avisos()).toEqual([
      expect.objectContaining({
        tipo: 'veredicto',
        id: 'r1_veredicto',
        reportId: 'r1',
        veredicto: 'real',
        puntos: 10,
        comentario: null,
        fecha: VEREDICTO_AT.toDate(),
        visto: false,
      }),
    ]);
    expect(service.noVistos()).toBe(1);
  });

  it('un veredicto falso lleva el motivo y los puntos que restó', async () => {
    await interno.procesar('vecina', [
      reporte({
        veredicto: 'falso',
        veredictoPor: 'op',
        veredictoAt: VEREDICTO_AT,
        veredictoPuntos: -15,
        veredictoComentario: '  La foto es de otro lugar ',
      }),
    ]);

    expect(service.avisos()[0]).toMatchObject({ veredicto: 'falso', puntos: -15, comentario: 'La foto es de otro lugar' });
  });

  it('sin veredictoPuntos (reportes antiguos) usa los puntos de las reglas', async () => {
    await interno.procesar('vecina', [reporte({ veredicto: 'falso', veredictoPor: 'op', veredictoAt: VEREDICTO_AT })]);

    expect(service.avisos()[0]).toMatchObject({ puntos: -15 });
  });

  it('sin veredicto no hay aviso de veredicto', async () => {
    await interno.procesar('vecina', [reporte({ puntos: 40, votos: 2 })]);

    expect(service.avisos()).toEqual([]);
    expect(historial).toHaveBeenCalledTimes(1);
  });

  it('junto a los cambios de estado, del más reciente al más antiguo', async () => {
    historial.mockResolvedValue([
      {
        tipo: 'estado',
        id: 'r1_c1',
        reportId: 'r1',
        reporte: 'Microbasural…',
        desde: 'reportado',
        hacia: 'en_revision',
        autor: 'Municipalidad',
        comentario: null,
        fecha: new Date(Date.UTC(2026, 9, 2)),
      },
    ]);

    await interno.procesar('vecina', [
      reporte({ veredicto: 'real', veredictoPor: 'op', veredictoAt: VEREDICTO_AT, veredictoPuntos: 10 }),
    ]);

    expect(service.avisos().map((a) => a.id)).toEqual(['r1_veredicto', 'r1_c1']);
  });
});

describe('AvisosService · al cambiar de cuenta', () => {
  type ConEscucha = {
    leerEstado: (uid: string) => Promise<unknown>;
    escuchar: (uid: string, alCambiar: (r: Report[]) => void, alFallar: (e: unknown) => void) => () => void;
  };

  let sesion: Subject<{ uid: string } | null>;
  let lecturas: Map<string, (estado: unknown) => void>;
  let escuchas: string[];
  let cortadas: string[];
  let fallar: Map<string, (error: unknown) => void>;
  let service: AvisosService;

  beforeEach(() => {
    sesion = new Subject();
    lecturas = new Map();
    escuchas = [];
    cortadas = [];
    fallar = new Map();
    TestBed.configureTestingModule({
      providers: [{ provide: AuthService, useValue: { authState$: sesion.asObservable(), user: null } }],
    });

    // Se reemplazan antes de crear el servicio: la escucha arranca en el constructor.
    const proto = AvisosService.prototype as unknown as ConEscucha;
    vi.spyOn(proto, 'leerEstado').mockImplementation(
      (uid: string) => new Promise((resolver) => lecturas.set(uid, resolver)),
    );
    vi.spyOn(proto, 'escuchar').mockImplementation((uid, _alCambiar, alFallar) => {
      escuchas.push(uid);
      fallar.set(uid, alFallar);
      return () => cortadas.push(uid);
    });
    service = TestBed.inject(AvisosService);
  });

  afterEach(() => vi.restoreAllMocks());

  it('si cierra sesión mientras se lee el estado, no queda escuchando a nadie', async () => {
    sesion.next({ uid: 'ana' });
    sesion.next(null);
    lecturas.get('ana')!({ vistos: ['r1_x'] });
    await Promise.resolve();
    await Promise.resolve();

    expect(escuchas).toEqual([]);
    expect(service.avisos()).toEqual([]);
  });

  it('si entra otra cuenta a mitad de camino, solo escucha a la nueva y no mezcla lo visto', async () => {
    sesion.next({ uid: 'ana' });
    sesion.next({ uid: 'luis' });
    lecturas.get('luis')!({ vistos: [] });
    await vi.waitFor(() => expect(escuchas).toEqual(['luis']));

    // Llega tarde lo de Ana: no se aplica ni abre otra escucha.
    lecturas.get('ana')!({ vistos: ['de_ana'] });
    await Promise.resolve();
    await Promise.resolve();

    expect(escuchas).toEqual(['luis']);
  });

  it('una cuenta de organismo no escucha reportes propios ni muestra un error (las reglas se lo negarían)', async () => {
    const proto = AvisosService.prototype as unknown as { esCuentaDeOrganismo: (uid: string) => Promise<boolean> };
    vi.spyOn(proto, 'esCuentaDeOrganismo').mockResolvedValue(true);

    sesion.next({ uid: 'org' });
    lecturas.get('org')!(undefined);
    await vi.waitFor(() => expect(service.cargando()).toBe(false));

    expect(escuchas).toEqual([]);
    expect(service.error()).toBeNull();
    expect(service.avisos()).toEqual([]);
  });

  it('al cerrar sesión corta la escucha, y un error tardío no muestra un aviso falso', async () => {
    sesion.next({ uid: 'ana' });
    lecturas.get('ana')!(undefined);
    await vi.waitFor(() => expect(escuchas).toEqual(['ana']));

    sesion.next(null);
    expect(cortadas).toEqual(['ana']);

    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    fallar.get('ana')!(new Error('permission-denied tras cerrar sesión'));
    expect(service.error()).toBeNull();
  });
});
