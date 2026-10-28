import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AlertController, ToastController } from '@ionic/angular';
import { vi } from 'vitest';

import { Report } from '../../../../models/report.model';
import { MiReporteError, MiReporteService } from '../../datos/mi-reporte.service';
import { AccionesAutorComponent } from './acciones-autor.component';
import { usarEntornoDePrueba } from '../../../../../testing';

const REPORTE = { id: 'r1', uid: 'ana', estado: 'reportado', descripcion: 'Bache grande en la esquina' } as Report;

usarEntornoDePrueba();

type Boton = { text: string; handler?: (datos: Record<string, string>) => boolean | void };

describe('AccionesAutorComponent', () => {
  let fixture: ComponentFixture<AccionesAutorComponent>;
  let servicio: {
    puedeModificar: ReturnType<typeof vi.fn>;
    puedeCorregir: ReturnType<typeof vi.fn>;
    editarDescripcion: ReturnType<typeof vi.fn>;
    retirar: ReturnType<typeof vi.fn>;
  };
  let alertas: { header: string; buttons: Boton[] }[];
  let toasts: string[];
  let alCambiar: ReturnType<typeof vi.fn>;

  function montar(puede = true, corregible = puede): string {
    servicio.puedeModificar.mockReturnValue(puede);
    servicio.puedeCorregir.mockReturnValue(corregible);
    fixture = TestBed.createComponent(AccionesAutorComponent);
    fixture.componentRef.setInput('reporte', REPORTE);
    fixture.componentRef.setInput('alCambiar', alCambiar);
    fixture.detectChanges();
    return (fixture.nativeElement.textContent as string).replace(/\s+/g, ' ').trim();
  }

  const boton = (alerta: { buttons: Boton[] }, texto: string): Boton => alerta.buttons.find((b) => b.text === texto)!;

  beforeEach(() => {
    alertas = [];
    toasts = [];
    alCambiar = vi.fn();
    servicio = { puedeModificar: vi.fn(), puedeCorregir: vi.fn(), editarDescripcion: vi.fn(), retirar: vi.fn() };

    TestBed.configureTestingModule({
      providers: [
        { provide: MiReporteService, useValue: servicio },
        {
          provide: AlertController,
          useValue: {
            create: async (opciones: { header: string; buttons: Boton[] }) => {
              alertas.push(opciones);
              return { present: async () => undefined };
            },
          },
        },
        {
          provide: ToastController,
          useValue: {
            create: async ({ message }: { message: string }) => {
              toasts.push(message);
              return { present: async () => undefined };
            },
          },
        },
      ],
    });
  });

  it('a quien no es el autor, o con el reporte ya revisado, no le muestra nada', () => {
    expect(montar(false)).toBe('');
  });

  it('al autor le ofrece corregir y retirar', () => {
    const texto = montar();
    expect(texto).toContain('Tu reporte');
    expect(texto).toContain('Corregir descripción');
    expect(texto).toContain('Retirar reporte');
  });

  it('si ya lo confirmaron con peso, solo ofrece retirarlo y explica por qué', () => {
    const texto = montar(true, false);
    expect(texto).not.toContain('Corregir descripción');
    expect(texto).toContain('Retirar reporte');
    expect(texto).toContain('Ya hay vecinos que lo confirmaron');
  });

  it('corrige la descripción y avisa al detalle', async () => {
    const actualizado = { ...REPORTE, descripcion: 'El bache está frente al paradero 3' };
    servicio.editarDescripcion.mockResolvedValue(actualizado);
    montar();

    await fixture.componentInstance.pedirEdicion();
    expect(boton(alertas[0], 'Guardar').handler!({ descripcion: 'El bache está frente al paradero 3' })).toBe(true);

    await vi.waitFor(() => expect(alCambiar).toHaveBeenCalledWith(actualizado));
    expect(servicio.editarDescripcion).toHaveBeenCalledWith(REPORTE, 'El bache está frente al paradero 3');
    await vi.waitFor(() => expect(toasts).toContain('Descripción corregida.'));
  });

  it('no cierra la ventana si la descripción es muy corta', async () => {
    montar();

    await fixture.componentInstance.pedirEdicion();

    expect(boton(alertas[0], 'Guardar').handler!({ descripcion: 'corto' })).toBe(false);
    expect(servicio.editarDescripcion).not.toHaveBeenCalled();
  });

  it('retira el reporte con el motivo escrito', async () => {
    servicio.retirar.mockResolvedValue({ ...REPORTE, estado: 'cerrado', retiradoPorAutor: true });
    montar();

    await fixture.componentInstance.pedirRetiro();
    expect(alertas[0].header).toBe('¿Retirar el reporte?');
    boton(alertas[0], 'Retirar').handler!({ motivo: 'Ya lo arreglaron' });

    await vi.waitFor(() => expect(servicio.retirar).toHaveBeenCalledWith(REPORTE, 'Ya lo arreglaron'));
    await vi.waitFor(() => expect(toasts).toContain('Reporte retirado.'));
  });

  it('si ya lo están revisando, explica por qué no se pudo y no avisa al detalle', async () => {
    montar();

    await fixture.componentInstance.aplicar(
      () => Promise.reject(new MiReporteError('El organismo ya empezó a revisar este reporte…', 'ya_revisado')),
      'Reporte retirado.',
    );

    expect(alCambiar).not.toHaveBeenCalled();
    expect(toasts).toEqual(['El organismo ya empezó a revisar este reporte…']);
  });
});
