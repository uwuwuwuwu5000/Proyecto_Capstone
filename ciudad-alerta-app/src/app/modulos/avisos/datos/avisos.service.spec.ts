import { TestBed } from '@angular/core/testing';
import { Timestamp } from 'firebase/firestore';
import { vi } from 'vitest';

import { Report } from '../../../models/report.model';
import { AvisoSinVisto } from '../modelo/aviso.model';
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
