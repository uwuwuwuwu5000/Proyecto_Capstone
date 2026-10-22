import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AlertController, ToastController } from '@ionic/angular';
import { vi } from 'vitest';

import { Report } from '../../../../models/report.model';
import { PermisoVeredicto, VeredictoError, VeredictoService } from '../../datos/veredicto.service';
import { VeredictoReporteComponent } from './veredicto-reporte.component';
import { usarEntornoDePrueba } from '../../../../../testing';

const REPORTE = { id: 'r1', uid: 'vecina', estado: 'en_revision', operadorId: 'op1' } as Report;

usarEntornoDePrueba();

describe('VeredictoReporteComponent (ranura detalle-reporte.gestion)', () => {
  let fixture: ComponentFixture<VeredictoReporteComponent>;
  let servicio: { permiso: ReturnType<typeof vi.fn>; dar: ReturnType<typeof vi.fn> };
  let toasts: string[];
  let alCambiar: ReturnType<typeof vi.fn>;

  function montar(permiso: PermisoVeredicto, reporte: Report = REPORTE): void {
    servicio.permiso.mockResolvedValue(permiso);
    fixture = TestBed.createComponent(VeredictoReporteComponent);
    fixture.componentRef.setInput('reporte', reporte);
    fixture.componentRef.setInput('alCambiar', alCambiar);
  }

  async function texto(): Promise<string> {
    fixture.detectChanges();
    await vi.waitFor(() => expect(servicio.permiso).toHaveBeenCalled());
    await fixture.whenStable();
    fixture.detectChanges();
    return (fixture.nativeElement.textContent as string).replace(/\s+/g, ' ');
  }

  const botones = (): string[] =>
    [...fixture.nativeElement.querySelectorAll('ion-button')].map((b: Element) => b.textContent?.trim() ?? '');

  beforeEach(() => {
    toasts = [];
    alCambiar = vi.fn();
    servicio = { permiso: vi.fn(), dar: vi.fn() };

    TestBed.configureTestingModule({
      providers: [
        { provide: VeredictoService, useValue: servicio },
        {
          provide: ToastController,
          useValue: {
            create: async ({ message }: { message: string }) => {
              toasts.push(message);
              return { present: async () => undefined };
            },
          },
        },
        { provide: AlertController, useValue: { create: vi.fn() } },
      ],
    });
  });

  it('quien no gestiona el reporte no ve nada', async () => {
    montar({ gestiona: false, puede: false, motivo: null });
    expect((await texto()).trim()).toBe('');
  });

  it('quien gestiona ve «Es real» y «Es falso» con lo que cambia para el autor', async () => {
    montar({ gestiona: true, puede: true, motivo: null });
    const contenido = await texto();
    expect(contenido).toContain('Veredicto');
    expect(contenido).toContain('+10 puntos de confianza si es real, −15 si es falso');
    expect(botones()).toEqual(['Es real', 'Es falso']);
  });

  it('sobre un reporte propio explica por qué no puede', async () => {
    montar({ gestiona: true, puede: false, motivo: 'Es tu propio reporte: el veredicto lo da otro gestor.' });
    expect(await texto()).toContain('propio reporte');
    expect(botones()).toEqual([]);
  });

  it('con el veredicto dado, muestra el resultado y el motivo', async () => {
    montar(
      { gestiona: true, puede: false, motivo: null },
      {
        ...REPORTE,
        validacion: { veredicto: 'falso', veredictoPuntos: -15, veredictoComentario: 'No había ningún bache' },
      },
    );
    const contenido = await texto();
    expect(contenido).toContain('Marcado como falso · −15 PC al autor');
    expect(contenido).toContain('Motivo: No había ningún bache');
    expect(botones()).toEqual([]);
  });

  it('en el tope de puntos, dice que no cambió nada', async () => {
    montar({ gestiona: true, puede: false, motivo: null }, { ...REPORTE, validacion: { veredicto: 'real', veredictoPuntos: 0 } });
    expect(await texto()).toContain('Verificado como real · sin cambio de PC al autor');
  });

  it('al aplicar, avisa al detalle con el reporte actualizado', async () => {
    const actualizado = { ...REPORTE, validacion: { veredicto: 'real' as const, veredictoPuntos: 10 } };
    servicio.dar.mockResolvedValue(actualizado);
    montar({ gestiona: true, puede: true, motivo: null });
    await texto();

    await fixture.componentInstance.aplicar('real', '');

    expect(servicio.dar).toHaveBeenCalledWith(REPORTE, 'real', '');
    expect(alCambiar).toHaveBeenCalledWith(actualizado);
    expect(toasts).toContain('Veredicto registrado. El autor recibirá un aviso.');
  });

  it('si las reglas lo rechazan, muestra el motivo y no avisa al detalle', async () => {
    servicio.dar.mockRejectedValue(new VeredictoError('No se pudo registrar el veredicto. Solo lo da…', 'sin_permiso'));
    montar({ gestiona: true, puede: true, motivo: null });
    await texto();

    await fixture.componentInstance.aplicar('falso', 'Foto de otro lugar');

    expect(alCambiar).not.toHaveBeenCalled();
    expect(toasts[0]).toContain('No se pudo registrar el veredicto');
  });
});
