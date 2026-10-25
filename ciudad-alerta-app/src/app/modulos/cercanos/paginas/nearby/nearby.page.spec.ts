import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { vi } from 'vitest';

import { NearbyReport, Report } from '../../../../models/report.model';
import { AuthService } from '../../../../services/auth.service';
import { GeolocationService, LocationError } from '../../../../services/geolocation.service';
import { ReportQueryService } from '../../../../services/report-query.service';
import { NearbyPage } from './nearby.page';
import { usarEntornoDePrueba } from '../../../../../testing';

usarEntornoDePrueba();

const AQUI = { lat: -33.51, lng: -70.76, accuracy: 10 };
const cercano = (id: string, metros: number): NearbyReport => ({
  report: { id, descripcion: `Reporte ${id}`, estado: 'reportado', categoria: 'luminaria' } as Report,
  distanciaMetros: metros,
});

describe('NearbyPage · Cerca de mí', () => {
  let pagina: NearbyPage;
  let pedidos: { radio: number; responder: (r: NearbyReport[]) => void }[];
  let ubicacion: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    pedidos = [];
    ubicacion = vi.fn(async () => AQUI);
    TestBed.configureTestingModule({
      providers: [
        {
          provide: ReportQueryService,
          useValue: {
            findNearby: (_centro: unknown, radio: number) =>
              new Promise<NearbyReport[]>((responder) => pedidos.push({ radio, responder })),
          },
        },
        { provide: GeolocationService, useValue: { getCurrentPosition: ubicacion } },
        // authState$: la campana de la barra (ranura) también la lee.
        { provide: AuthService, useValue: { user: { uid: 'ana' }, authState$: of(null) } },
      ],
    });
    pagina = TestBed.createComponent(NearbyPage).componentInstance;
  });

  it('ubica a la persona y muestra los reportes del radio elegido', async () => {
    const entrada = pagina.ionViewWillEnter();
    await vi.waitFor(() => expect(pedidos).toHaveLength(1));
    pedidos[0].responder([cercano('a', 120)]);
    await entrada;

    expect(pedidos[0].radio).toBe(500);
    expect(pagina.estado()).toBe('listo');
    expect(pagina.resultados().map((r) => r.report.id)).toEqual(['a']);
  });

  it('con el radio cambiado dos veces seguidas, la respuesta lenta no reemplaza a la última', async () => {
    const entrada = pagina.ionViewWillEnter();
    await vi.waitFor(() => expect(pedidos).toHaveLength(1));
    pedidos[0].responder([]);
    await entrada;

    const amplio = pagina.cambiarRadio(1000);
    const corto = pagina.cambiarRadio(250);
    pedidos[2].responder([cercano('cerca', 90)]);
    pedidos[1].responder([cercano('cerca', 90), cercano('lejos', 900)]);
    await Promise.all([amplio, corto]);

    expect(pagina.radio()).toBe(250);
    expect(pagina.resultados().map((r) => r.report.id)).toEqual(['cerca']);
  });

  it('sin permiso de ubicación lo explica, sin consultar reportes', async () => {
    ubicacion.mockRejectedValue(new LocationError('Activa la ubicación del teléfono.', 'denegado'));

    await pagina.ionViewWillEnter();

    expect(pagina.estado()).toBe('error_ubicacion');
    expect(pagina.mensajeError()).toContain('Activa la ubicación');
    expect(pedidos).toHaveLength(0);
  });
});
