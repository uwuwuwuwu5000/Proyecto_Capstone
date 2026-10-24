import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AlertController } from '@ionic/angular';
import { vi } from 'vitest';

import { usarEntornoDePrueba } from '../../../../../testing';
import { BorradorReporte, BorradorService } from '../../datos/borrador.service';
import { BorradorPendienteComponent } from './borrador-pendiente.component';

usarEntornoDePrueba({ uid: 'ana' });

const BORRADOR: BorradorReporte = {
  id: 'r1',
  uid: 'ana',
  categoria: 'luminaria',
  descripcion: 'Luminaria apagada en la esquina de la plaza',
  ubicacion: { lat: -33.5, lng: -70.7, accuracy: 15 },
  comuna: null,
  foto: { dataUrl: 'data:image/jpeg;base64,AA==', mimeType: 'image/jpeg', width: 1, height: 1, privacidad: null, embedding: null },
  guardadoAt: new Date(2026, 9, 20, 18, 30).getTime(),
};

describe('BorradorPendienteComponent (ranura inicio.resumen)', () => {
  let fixture: ComponentFixture<BorradorPendienteComponent>;
  let servicio: {
    pendiente: ReturnType<typeof signal<BorradorReporte | null>>;
    enLinea: ReturnType<typeof signal<boolean>>;
    enviando: ReturnType<typeof signal<boolean>>;
    error: ReturnType<typeof signal<string | null>>;
    enviar: ReturnType<typeof vi.fn>;
    descartar: ReturnType<typeof vi.fn>;
  };
  let alertas: { buttons: { text: string; handler?: () => void }[] }[];

  function texto(): string {
    fixture.detectChanges();
    return (fixture.nativeElement.textContent as string).replace(/\s+/g, ' ').trim();
  }

  beforeEach(() => {
    alertas = [];
    servicio = {
      pendiente: signal<BorradorReporte | null>(BORRADOR),
      enLinea: signal(false),
      enviando: signal(false),
      error: signal<string | null>(null),
      enviar: vi.fn(async () => true),
      descartar: vi.fn(),
    };
    TestBed.configureTestingModule({
      providers: [
        { provide: BorradorService, useValue: servicio },
        {
          provide: AlertController,
          useValue: {
            create: async (opciones: (typeof alertas)[number]) => {
              alertas.push(opciones);
              return { present: async () => undefined };
            },
          },
        },
      ],
    });
    fixture = TestBed.createComponent(BorradorPendienteComponent);
  });

  it('sin borrador no muestra nada', () => {
    servicio.pendiente.set(null);
    expect(texto()).toBe('');
  });

  it('sin señal dice que se enviará solo y que la foto se protegerá', () => {
    const contenido = texto();
    expect(contenido).toContain('Reporte por enviar');
    expect(contenido).toContain('Luminaria dañada · Luminaria apagada en la esquina de la plaza');
    expect(contenido).toContain('Guardado el 20 de octubre a las 18:30. Se enviará solo cuando vuelva la señal.');
    expect(contenido).toContain('La foto se protegerá antes de subirla.');
    const enviar = fixture.nativeElement.querySelector('ion-button') as HTMLIonButtonElement;
    expect(enviar.disabled).toBe(true);
  });

  it('con señal deja enviarlo a mano', async () => {
    servicio.enLinea.set(true);
    texto();

    await fixture.componentInstance.enviar();

    expect(servicio.enviar).toHaveBeenCalled();
  });

  it('muestra por qué no se envió', () => {
    servicio.enLinea.set(true);
    servicio.error.set('Espera 20 segundos antes de enviar otro reporte.');
    expect(texto()).toContain('No se envió: Espera 20 segundos');
  });

  it('descartar pide confirmación', async () => {
    texto();
    await fixture.componentInstance.descartar();

    expect(servicio.descartar).not.toHaveBeenCalled();
    alertas[0].buttons.find((b) => b.text === 'Descartar')!.handler!();
    expect(servicio.descartar).toHaveBeenCalled();
  });
});
