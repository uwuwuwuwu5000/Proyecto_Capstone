import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ToastController } from '@ionic/angular';
import { ETIQUETAS_ESTADO, PermisoGestion, transicionesDisponibles } from '@ciudad-alerta/comun';

import { Report } from '../../../../models/report.model';
import { CambioEstadoError, CambioEstadoService } from '../../datos/cambio-estado.service';
import { GestionReporteComponent } from './gestion-reporte.component';

const REPORTE = {
  id: 'r1',
  estado: 'en_revision',
  autorNombre: 'Vecina de prueba',
  operadorId: 'op1',
} as Report;

describe('GestionReporteComponent (ranura detalle-reporte.gestion)', () => {
  let fixture: ComponentFixture<GestionReporteComponent>;
  let servicio: {
    permiso: ReturnType<typeof vi.fn>;
    transiciones: (estado: Report['estado']) => readonly Report['estado'][];
    cambiar: ReturnType<typeof vi.fn>;
  };

  function montar(permiso: PermisoGestion, reporte: Report = REPORTE): void {
    servicio.permiso.mockResolvedValue(permiso);
    fixture = TestBed.createComponent(GestionReporteComponent);
    fixture.componentRef.setInput('reporte', reporte);
  }

  async function texto(): Promise<string> {
    fixture.detectChanges();
    await vi.waitFor(() => expect(servicio.permiso).toHaveBeenCalled());
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture.nativeElement.textContent as string;
  }

  beforeEach(() => {
    servicio = {
      permiso: vi.fn(),
      transiciones: (estado) => transicionesDisponibles(estado),
      cambiar: vi.fn(async (reporte: Report, estado: Report['estado']) => ({ ...reporte, estado })),
    };

    TestBed.configureTestingModule({
      providers: [
        { provide: CambioEstadoService, useValue: servicio },
        { provide: ToastController, useValue: { create: async () => ({ present: async () => undefined }) } },
      ],
    });
  });

  it('un ciudadano no ve el bloque', async () => {
    montar({ esGestor: false, puede: false, motivo: null });
    expect((await texto()).trim()).toBe('');
  });

  it('otro operador ve por qué no puede cambiar el estado', async () => {
    montar({ esGestor: true, puede: false, motivo: 'Este reporte está asignado a otro operador.' });
    const contenido = await texto();
    expect(contenido).toContain('Gestión');
    expect(contenido).toContain('asignado a otro operador');
    expect(fixture.nativeElement.querySelectorAll('ion-button').length).toBe(0);
  });

  it('quien gestiona ve al autor y un botón por transición', async () => {
    montar({ esGestor: true, puede: true, motivo: null });
    const contenido = await texto();
    expect(contenido).toContain('Reportado por');
    expect(contenido).toContain('Vecina de prueba');
    const botones = [...fixture.nativeElement.querySelectorAll('ion-button')].map((b: Element) => b.textContent?.trim());
    // en_revision → derivado o cerrado, como en firestore.rules.
    expect(botones).toEqual([ETIQUETAS_ESTADO.derivado, ETIQUETAS_ESTADO.cerrado]);
  });

  it('un reporte cerrado no ofrece cambios', async () => {
    montar({ esGestor: true, puede: true, motivo: null }, { ...REPORTE, estado: 'cerrado' });
    expect(await texto()).toContain('ya no admite cambios de estado');
  });

  it('al cambiar avisa al detalle con el reporte actualizado', async () => {
    const alCambiar = vi.fn();
    montar({ esGestor: true, puede: true, motivo: null });
    fixture.componentRef.setInput('alCambiar', alCambiar);
    await texto();

    await fixture.componentInstance.aplicar('derivado', 'Derivado a la cuadrilla');

    expect(servicio.cambiar).toHaveBeenCalledWith(REPORTE, 'derivado', 'Derivado a la cuadrilla');
    expect(alCambiar).toHaveBeenCalledWith({ ...REPORTE, estado: 'derivado' });
  });

  it('si el cambio falla no avisa al detalle', async () => {
    const alCambiar = vi.fn();
    servicio.cambiar.mockRejectedValue(new CambioEstadoError('Sin permisos.', 'sin_permiso'));
    montar({ esGestor: true, puede: true, motivo: null });
    fixture.componentRef.setInput('alCambiar', alCambiar);
    await texto();

    await fixture.componentInstance.aplicar('derivado', '');

    expect(alCambiar).not.toHaveBeenCalled();
  });
});
