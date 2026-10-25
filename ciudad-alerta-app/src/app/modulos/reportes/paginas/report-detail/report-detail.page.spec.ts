import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Timestamp } from 'firebase/firestore';
import { vi } from 'vitest';

import { Report } from '../../../../models/report.model';
import { AuthService } from '../../../../services/auth.service';
import { ReportQueryService } from '../../../../services/report-query.service';
import { RoutingService } from '../../../../services/routing.service';
import { CambioEstadoService } from '../../../gestion-reportes/datos/cambio-estado.service';
import { ConfianzaService } from '../../../confianza/datos/confianza.service';
import { VeredictoService } from '../../../confianza/datos/veredicto.service';
import { ConfirmationService } from '../../datos/confirmation.service';
import { ContactoOrganismoService } from '../../datos/contacto-organismo.service';
import { ReportDetailPage } from './report-detail.page';
import { usarEntornoDePrueba } from '../../../../../testing';

usarEntornoDePrueba();

const hace = (ms: number) => Timestamp.fromMillis(Date.now() - ms);

function reporte(id: string, cambios: Partial<Report> = {}): Report {
  return {
    id,
    uid: 'ana',
    descripcion: `Descripción del reporte ${id}`,
    categoria: 'luminaria',
    ubicacion: { lat: -33.51, lng: -70.76, accuracy: 10 },
    comuna: 'Maipú',
    autorNombre: 'Ana',
    foto: null,
    estado: 'reportado',
    confirmaciones: 0,
    organismo: { id: 'muni_13119', nombre: 'Municipalidad de Maipú', tipo: 'municipio' },
    operadorId: 'op1',
    createdAt: hace(3_600_000),
    updatedAt: hace(3_600_000),
    ...cambios,
  } as Report;
}

describe('ReportDetailPage', () => {
  let fixture: ComponentFixture<ReportDetailPage>;
  let pendientes: Map<string, { resolver: (r: Report | null) => void; rechazar: (e: unknown) => void }>;
  let conteos: Map<string, (n: number) => void>;
  let usuario: { uid: string } | null;

  beforeEach(() => {
    pendientes = new Map();
    conteos = new Map();
    usuario = { uid: 'ana' };

    TestBed.configureTestingModule({
      providers: [
        {
          provide: ReportQueryService,
          useValue: {
            getById: (id: string) =>
              new Promise((resolver, rechazar) => pendientes.set(id, { resolver, rechazar })),
            formatearFecha: () => 'hoy, 10:00',
          },
        },
        {
          provide: ConfirmationService,
          useValue: {
            countConfirmations: (id: string) => new Promise((resolver) => conteos.set(id, resolver)),
            hasConfirmed: async () => false,
          },
        },
        { provide: RoutingService, useValue: { getStatusHistory: async () => [] } },
        { provide: ContactoOrganismoService, useValue: { deOperador: async () => null } },
        { provide: AuthService, useValue: { get user() { return usuario; } } },
        // Lo que llenan las ranuras del detalle, sin Firestore.
        { provide: CambioEstadoService, useValue: { permiso: async () => ({ esGestor: false, puede: false, motivo: null }), transiciones: () => [] } },
        { provide: VeredictoService, useValue: { permiso: async () => ({ gestiona: false, puede: false, motivo: null }) } },
        { provide: ConfianzaService, useValue: { disponibilidad: async () => ({ bloqueo: 'propio' }) } },
      ],
    });
    fixture = TestBed.createComponent(ReportDetailPage);
  });

  async function abrir(id: string): Promise<void> {
    fixture.componentRef.setInput('id', id);
    fixture.detectChanges();
    await vi.waitFor(() => expect(pendientes.has(id)).toBe(true));
  }

  async function texto(): Promise<string> {
    await fixture.whenStable();
    fixture.detectChanges();
    return (fixture.nativeElement.textContent as string).replace(/\s+/g, ' ');
  }

  it('muestra el reporte, quién lo atiende y, al autor en «reportado», «Tu reporte»', async () => {
    await abrir('r1');
    pendientes.get('r1')!.resolver(reporte('r1'));

    const contenido = await texto();
    expect(contenido).toContain('Descripción del reporte r1');
    expect(contenido).toContain('Municipalidad de Maipú');
    expect(contenido).toContain('Contactar al organismo');
    expect(contenido).toContain('Tu reporte');
  });

  it('a otra persona no le muestra «Tu reporte»', async () => {
    usuario = { uid: 'luis' };
    await abrir('r1');
    pendientes.get('r1')!.resolver(reporte('r1'));

    expect(await texto()).not.toContain('Tu reporte');
  });

  it('un reporte retirado lo dice, y ya no ofrece corregirlo', async () => {
    await abrir('r1');
    pendientes.get('r1')!.resolver(reporte('r1', { estado: 'cerrado', retiradoPorAutor: true }));

    const contenido = await texto();
    expect(contenido).toContain('Quien lo reportó lo retiró');
    expect(contenido).not.toContain('Corregir descripción');
  });

  it('un reporte que no existe, o que no se pudo leer, lo dice', async () => {
    await abrir('r9');
    pendientes.get('r9')!.resolver(null);
    expect(await texto()).toContain('No encontramos esta incidencia');
  });

  it('al pasar rápido a otro reporte, la respuesta tardía del primero no lo reemplaza', async () => {
    await abrir('r1');
    await abrir('r2');

    pendientes.get('r2')!.resolver(reporte('r2'));
    await vi.waitFor(() => expect(fixture.componentInstance.reporte()?.id).toBe('r2'));
    pendientes.get('r1')!.resolver(reporte('r1'));
    await new Promise((resolver) => setTimeout(resolver, 0));

    expect(fixture.componentInstance.reporte()?.id).toBe('r2');
    expect(await texto()).toContain('Descripción del reporte r2');
  });

  it('las confirmaciones contadas para el reporte anterior no se muestran en el nuevo', async () => {
    usuario = { uid: 'luis' };
    await abrir('r1');
    pendientes.get('r1')!.resolver(reporte('r1'));
    await vi.waitFor(() => expect(conteos.has('r1')).toBe(true));

    await abrir('r2');
    pendientes.get('r2')!.resolver(reporte('r2'));
    await vi.waitFor(() => expect(conteos.has('r2')).toBe(true));

    conteos.get('r2')!(1);
    await vi.waitFor(() => expect(fixture.componentInstance.confirmaciones()).toBe(1));
    // Llega tarde el conteo del reporte anterior.
    conteos.get('r1')!(7);
    await new Promise((resolver) => setTimeout(resolver, 0));

    expect(fixture.componentInstance.confirmaciones()).toBe(1);
  });
});
