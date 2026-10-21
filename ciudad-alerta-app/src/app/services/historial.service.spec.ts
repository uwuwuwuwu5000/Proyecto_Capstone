import { TestBed } from '@angular/core/testing';
import { Timestamp } from 'firebase/firestore';

import { NOMBRE_ADMINISTRACION, Report, StatusChange } from '../models/report.model';
import { HistorialService } from './historial.service';
import { RoutingService } from './routing.service';
import { usarEntornoDePrueba } from '../../testing';

const creado = Timestamp.fromDate(new Date('2026-10-01T12:00:00Z'));
const reporte = { id: 'r1', createdAt: creado, autorNombre: 'Vecina Privada' } as Report;

function cambio(datos: Partial<StatusChange>): StatusChange {
  return {
    reportId: 'r1',
    desde: 'reportado',
    hacia: 'en_revision',
    autorUid: 'x',
    comentario: '',
    createdAt: Timestamp.fromDate(new Date('2026-10-01T14:00:00Z')),
    ...datos,
  };
}

usarEntornoDePrueba();

describe('HistorialService', () => {
  let historial: ReturnType<typeof vi.fn>;
  let servicio: HistorialService;

  beforeEach(() => {
    historial = vi.fn();
    TestBed.configureTestingModule({ providers: [{ provide: RoutingService, useValue: { getStatusHistory: historial } }] });
    servicio = TestBed.inject(HistorialService);
  });

  it('la línea de tiempo empieza con la creación, sin el nombre del ciudadano', async () => {
    historial.mockResolvedValue([cambio({ autorNombre: 'Municipalidad de Maipú', autorRol: 'operador', comentario: '  En terreno  ' })]);

    const eventos = await servicio.lineaDeTiempo(reporte);

    expect(eventos).toHaveLength(2);
    expect(eventos[0]).toMatchObject({ desde: null, hacia: 'reportado', autor: 'Creado por un ciudadano' });
    expect(eventos[0].fecha?.toISOString()).toBe('2026-10-01T12:00:00.000Z');
    expect(JSON.stringify(eventos)).not.toContain('Vecina Privada');
    expect(eventos[1]).toMatchObject({ hacia: 'en_revision', autor: 'Municipalidad de Maipú', comentario: 'En terreno' });
  });

  it('si el historial no se pudo leer, falla en vez de mostrar una línea incompleta (BUG 22)', async () => {
    historial.mockResolvedValue(null);
    await expect(servicio.lineaDeTiempo(reporte)).rejects.toThrow('No se pudo leer');
  });

  it('un cambio de un admin siempre se firma como la administración', () => {
    expect(servicio.etiquetaAutor({ autorRol: 'admin', autorNombre: 'Otro nombre' })).toBe(NOMBRE_ADMINISTRACION);
  });

  it('sin nombre registrado lo dice', () => {
    expect(servicio.etiquetaAutor({ autorNombre: '   ' })).toBe('Autor no registrado');
    expect(servicio.etiquetaAutor({})).toBe('Autor no registrado');
  });

  it('fecha pendiente del servidor o ausente', () => {
    expect(servicio.aFecha(undefined)).toBeNull();
    expect(servicio.formatear(null)).toBe('Fecha no disponible');
  });
});
