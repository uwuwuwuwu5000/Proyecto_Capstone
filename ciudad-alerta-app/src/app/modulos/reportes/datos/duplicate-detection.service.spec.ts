import { TestBed } from '@angular/core/testing';
import { Timestamp } from 'firebase/firestore';
import { vi } from 'vitest';

import { Report } from '../../../models/report.model';
import { AuthService } from '../../../services/auth.service';
import { DuplicateDetectionService } from './duplicate-detection.service';
import { usarEntornoDePrueba } from '../../../../testing';

usarEntornoDePrueba();

const AQUI = { lat: -33.4489, lng: -70.6693, accuracy: 10 };
/** ~1 m de latitud. */
const METRO = 1 / 111_320;
const HORA = 3_600_000;

function reporte(id: string, metrosAlNorte: number, horas: number, cambios: Partial<Report> = {}): Report {
  return {
    id,
    uid: 'otra',
    categoria: 'microbasural',
    estado: 'reportado',
    ubicacion: { lat: AQUI.lat + metrosAlNorte * METRO, lng: AQUI.lng, accuracy: 10 },
    createdAt: Timestamp.fromMillis(Date.now() - horas * HORA),
    embedding: null,
    ...cambios,
  } as Report;
}

type Interno = { consultarPorGeohash: () => Promise<Report[]> };

describe('DuplicateDetectionService · ¿ya lo reportó alguien?', () => {
  let servicio: DuplicateDetectionService;
  let cercanos: Report[];

  const buscar = (embedding: number[] | null = null) =>
    servicio.findSimilar({ ubicacion: AQUI, categoria: 'microbasural', embedding });

  beforeEach(() => {
    cercanos = [];
    TestBed.configureTestingModule({ providers: [{ provide: AuthService, useValue: { user: { uid: 'yo' } } }] });
    servicio = TestBed.inject(DuplicateDetectionService);
    vi.spyOn(servicio as unknown as Interno, 'consultarPorGeohash').mockImplementation(async () => cercanos);
  });

  it('sin reportes cerca no hay coincidencias (el caso normal)', async () => {
    expect(await buscar()).toEqual([]);
  });

  it('un reporte a pocos metros y reciente es candidato, con los motivos en palabras', async () => {
    cercanos = [reporte('a', 20, 0.5)];

    const [candidato] = await buscar();

    expect(candidato.report.id).toBe('a');
    expect(candidato.distanciaMetros).toBe(20);
    expect(candidato.motivos).toEqual(['A 20 m de tu ubicación', 'Reportado hace menos de una hora']);
  });

  it.each([
    ['propio', reporte('p', 10, 1, { uid: 'yo' })],
    ['resuelto', reporte('r', 10, 1, { estado: 'resuelto' })],
    ['cerrado', reporte('c', 10, 1, { estado: 'cerrado' })],
    ['lejos (más de 150 m)', reporte('l', 400, 1)],
    ['antiguo (más de 72 h)', reporte('v', 10, 80)],
    ['recién enviado (fecha aún sin confirmar)', reporte('s', 10, 0, { createdAt: undefined as never })],
  ])('no ofrece un reporte %s', async (_caso, candidato) => {
    cercanos = [candidato];
    expect(await buscar()).toEqual([]);
  });

  it('ordena por puntaje: más cerca y más reciente primero, hasta 3', async () => {
    cercanos = [reporte('lejano', 120, 60), reporte('cerca', 5, 1), reporte('medio', 60, 10), reporte('otro', 30, 20)];

    const ids = (await buscar()).map((c) => c.report.id);

    expect(ids[0]).toBe('cerca');
    expect(ids).toHaveLength(3);
    expect(ids).not.toContain('lejano');
  });

  it('una foto muy parecida sube el puntaje y lo dice', async () => {
    cercanos = [reporte('igual', 100, 30, { embedding: [1, 0, 0] }), reporte('distinta', 100, 30, { embedding: [0, 1, 0] })];

    const [primero, segundo] = await buscar([1, 0, 0]);

    expect(primero.report.id).toBe('igual');
    expect(primero.motivos).toContain('La fotografía se parece mucho a la tuya');
    expect(segundo?.report.id ?? 'filtrado').not.toBe('igual');
  });

  it('si la consulta falla, deja seguir el reporte sin coincidencias', async () => {
    vi.spyOn(servicio as unknown as Interno, 'consultarPorGeohash').mockRejectedValue(new Error('sin red'));
    expect(await buscar()).toEqual([]);
  });
});
