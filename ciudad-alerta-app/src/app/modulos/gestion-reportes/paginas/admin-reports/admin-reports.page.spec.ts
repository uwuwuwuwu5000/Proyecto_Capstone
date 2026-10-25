import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Timestamp } from 'firebase/firestore';
import { of } from 'rxjs';
import { vi } from 'vitest';

import { Report } from '../../../../models/report.model';
import { AuthService } from '../../../../services/auth.service';
import { FiltrosBandejaReportes, PaginaReportes, ReportQueryService } from '../../../../services/report-query.service';
import { AdminReportsPage } from './admin-reports.page';
import { usarEntornoDePrueba } from '../../../../../testing';

usarEntornoDePrueba();

function reporte(id: string, cambios: Partial<Report> = {}): Report {
  return {
    id,
    uid: 'vecina',
    descripcion: `Reporte ${id}`,
    categoria: 'luminaria',
    comuna: 'Maipú',
    estado: 'reportado',
    createdAt: Timestamp.now(),
    ...cambios,
  } as Report;
}

/** Una consulta pendiente: la prueba decide cuándo y qué responde. */
interface Pedido {
  filtros: FiltrosBandejaReportes;
  responder: (pagina: PaginaReportes) => void;
}

describe('AdminReportsPage · bandeja de gestión', () => {
  let fixture: ComponentFixture<AdminReportsPage>;
  let pagina: AdminReportsPage;
  let pedidos: Pedido[];
  let perfil: Record<string, unknown>;
  let asignados: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    pedidos = [];
    perfil = { role: 'admin' };
    asignados = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        {
          provide: ReportQueryService,
          useValue: {
            todosLosReportes: (filtros: FiltrosBandejaReportes) =>
              new Promise<PaginaReportes>((responder) => pedidos.push({ filtros: { ...filtros }, responder })),
            reportesDeOperador: asignados,
            formatearFecha: () => 'hoy',
          },
        },
        { provide: AuthService, useValue: { user: { uid: 'u1' }, authState$: of(null), getUserProfile: async () => perfil } },
      ],
    });
    fixture = TestBed.createComponent(AdminReportsPage);
    pagina = fixture.componentInstance;
  });

  const ids = () => pagina.reportes().map((r) => r.id);

  it('un admin ve todos los reportes, página a página', async () => {
    const entrada = pagina.ionViewWillEnter();
    await vi.waitFor(() => expect(pedidos).toHaveLength(1));
    pedidos[0].responder({ reportes: [reporte('a'), reporte('b')], cursor: {} as never });
    await entrada;

    expect(ids()).toEqual(['a', 'b']);
    expect(pagina.hayMas()).toBe(true);

    const mas = pagina.cargarMas();
    pedidos[1].responder({ reportes: [reporte('c')], cursor: null });
    await mas;

    expect(ids()).toEqual(['a', 'b', 'c']);
    expect(pagina.hayMas()).toBe(false);
  });

  it('dos filtros cambiados seguidos no mezclan resultados: gana el último', async () => {
    const entrada = pagina.ionViewWillEnter();
    await vi.waitFor(() => expect(pedidos).toHaveLength(1));
    pedidos[0].responder({ reportes: [reporte('a')], cursor: null });
    await entrada;

    const porCategoria = pagina.cambiarCategoria('fuga_agua');
    const porEstado = pagina.cambiarEstado('en_proceso');
    expect(pedidos.map((p) => [p.filtros.categoria, p.filtros.estado])).toEqual([
      ['todas', 'todos'],
      ['fuga_agua', 'todos'],
      ['fuga_agua', 'en_proceso'],
    ]);

    // Responde primero la consulta nueva y después la antigua.
    pedidos[2].responder({ reportes: [reporte('nuevo', { estado: 'en_proceso', categoria: 'fuga_agua' })], cursor: null });
    pedidos[1].responder({ reportes: [reporte('viejo1', { categoria: 'fuga_agua' }), reporte('viejo2', { categoria: 'fuga_agua' })], cursor: null });
    await Promise.all([porCategoria, porEstado]);

    expect(ids()).toEqual(['nuevo']);
  });

  it('«Ver más» tocado dos veces pide la página una sola vez', async () => {
    const entrada = pagina.ionViewWillEnter();
    await vi.waitFor(() => expect(pedidos).toHaveLength(1));
    pedidos[0].responder({ reportes: [reporte('a')], cursor: {} as never });
    await entrada;

    const primero = pagina.cargarMas();
    const segundo = pagina.cargarMas();
    expect(pedidos).toHaveLength(2);
    pedidos[1].responder({ reportes: [reporte('b')], cursor: null });
    await Promise.all([primero, segundo]);

    expect(ids()).toEqual(['a', 'b']);
  });

  it('un operador ve solo lo asignado a él, filtrado en la pantalla', async () => {
    perfil = { role: 'operador', operadorId: 'op1' };
    asignados.mockResolvedValue([
      reporte('a', { comuna: 'Maipú' }),
      reporte('b', { comuna: 'Pudahuel', estado: 'en_proceso' }),
    ]);

    await pagina.ionViewWillEnter();
    expect(asignados).toHaveBeenCalledWith('op1');
    expect(ids()).toEqual(['a', 'b']);
    expect(pagina.comunasConocidas()).toEqual(['Maipú', 'Pudahuel']);

    await pagina.cambiarEstado('en_proceso');
    expect(ids()).toEqual(['b']);
  });
});
