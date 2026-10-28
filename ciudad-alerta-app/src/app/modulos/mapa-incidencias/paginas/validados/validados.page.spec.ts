import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { of } from 'rxjs';
import { vi } from 'vitest';

import { Report } from '../../../../models/report.model';
import { UserProfile } from '../../../../models/user-profile.model';
import { AuthService } from '../../../../services/auth.service';
import { ReportQueryService } from '../../../../services/report-query.service';
import { RoutingService } from '../../../../services/routing.service';
import { ValidadosPage } from './validados.page';
import { usarEntornoDePrueba } from '../../../../../testing';

usarEntornoDePrueba();

const ORGANISMO: Partial<UserProfile> = { uid: 'org', role: 'organismo', organismoId: 'muni_13119', displayName: 'Municipalidad de Maipú' };
const validado = (id: string, extra: Partial<Report> = {}): Report =>
  ({
    id,
    descripcion: `Reporte ${id}`,
    estado: 'en_revision',
    categoria: 'luminaria',
    comuna: 'Maipú',
    ubicacion: { lat: -33.51, lng: -70.76, accuracy: 5 },
    validacion: { puntos: 120, votos: 4, validado: true },
    ...extra,
  }) as Report;

describe('ValidadosPage · mapa de una cuenta de organismo', () => {
  let perfil: Partial<UserProfile> | null;
  let validadosDeOrganismo: ReturnType<typeof vi.fn>;
  function crear(): ValidadosPage {
    return TestBed.createComponent(ValidadosPage).componentInstance;
  }

  beforeEach(() => {
    perfil = ORGANISMO;
    validadosDeOrganismo = vi.fn(async () => ({ reportes: [validado('a'), validado('b', { estado: 'resuelto' })], hayMas: false }));
    TestBed.configureTestingModule({
      providers: [
        { provide: ReportQueryService, useValue: { validadosDeOrganismo, formatearFecha: () => 'hoy' } },
        { provide: RoutingService, useValue: { nombreDeOrganismo: async () => 'Municipalidad de Maipú' } },
        // authState$: la campana de la barra (ranura) también la lee.
        { provide: AuthService, useValue: { user: { uid: 'org' }, authState$: of(null), getUserProfile: async () => perfil } },
      ],
    });
  });

  afterEach(() => vi.restoreAllMocks());

  it('pide solo los reportes validados de su organismo y los muestra en el mapa', async () => {
    const pagina = crear();
    await pagina.ionViewWillEnter();

    expect(validadosDeOrganismo).toHaveBeenCalledWith('muni_13119', pagina.maximo);
    expect(pagina.estado()).toBe('listo');
    expect(pagina.organismo()).toBe('Municipalidad de Maipú');
    expect(pagina.marcadores().map((m) => m.id)).toEqual(['a', 'b']);
    expect(pagina.marcadores().every((m) => m.destacado)).toBe(true);
    expect(pagina.encuadre()).not.toBeNull();
  });

  it('una cuenta que no es de organismo no consulta nada y lo explica', async () => {
    perfil = { uid: 'ana', role: 'ciudadano' };
    const pagina = crear();
    await pagina.ionViewWillEnter();

    expect(pagina.estado()).toBe('sin_organismo');
    expect(validadosDeOrganismo).not.toHaveBeenCalled();
  });

  it('un organismo sin organismoId tampoco consulta', async () => {
    perfil = { ...ORGANISMO, organismoId: null };
    const pagina = crear();
    await pagina.ionViewWillEnter();

    expect(pagina.estado()).toBe('sin_organismo');
    expect(validadosDeOrganismo).not.toHaveBeenCalled();
  });

  it('si la consulta falla, muestra el error para reintentar', async () => {
    validadosDeOrganismo.mockRejectedValue(new Error('sin red'));
    const pagina = crear();
    await pagina.ionViewWillEnter();

    expect(pagina.estado()).toBe('error');
    expect(pagina.resultados()).toEqual([]);
  });

  it('al volver desde el detalle no vuelve a consultar', async () => {
    const pagina = crear();
    await pagina.ionViewWillEnter();
    await pagina.ionViewWillEnter();

    expect(validadosDeOrganismo).toHaveBeenCalledTimes(1);
  });

  it('un marcador o una fila abre el detalle del reporte', async () => {
    const navegar = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const pagina = crear();
    await pagina.ionViewWillEnter();
    pagina.abrirDetalle('a');

    expect(navegar).toHaveBeenCalledWith(['/report', 'a']);
  });
});
