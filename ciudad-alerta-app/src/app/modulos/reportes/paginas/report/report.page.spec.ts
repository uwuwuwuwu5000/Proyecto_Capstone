import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { ToastController } from '@ionic/angular';
import { vi } from 'vitest';

import { ReportPage } from './report.page';
import { usarEntornoDePrueba } from '../../../../../testing';
import { CameraService, CapturedPhoto } from '../../datos/camera.service';
import { BorradorService } from '../../datos/borrador.service';
import { DuplicateDetectionService } from '../../datos/duplicate-detection.service';
import { PrivacidadError, PrivacidadService } from '../../datos/privacidad.service';

usarEntornoDePrueba({ uid: 'vecino-1' });

const ORIGINAL: CapturedPhoto = {
  dataUrl: 'data:image/jpeg;base64,AAEC',
  blob: new Blob([new Uint8Array([0, 1, 2])], { type: 'image/jpeg' }),
  mimeType: 'image/jpeg',
  sizeBytes: 3,
  width: 1024,
  height: 768,
};

const PROTEGIDA: CapturedPhoto = {
  ...ORIGINAL,
  privacidad: { aplicada: true, rostros: 1, personas: 0, version: 'nube:prueba' },
  embedding: [1, 0],
};

/** Doble del servicio de privacidad: la prueba decide cuándo y cómo responde. */
function privacidadFalsa() {
  let resolver: (foto: CapturedPhoto) => void = () => undefined;
  let rechazar: (error: unknown) => void = () => undefined;

  const falsa = {
    estado: signal<'inactivo' | 'enviando' | 'despertando'>('inactivo'),
    ultimoErrorTecnico: signal<string | null>(null),
    despertar: vi.fn(),
    cancelar: vi.fn(() => rechazar(new PrivacidadError('Cancelaste la protección de la foto.', 'cancelado'))),
    anonimizar: vi.fn(
      () =>
        new Promise<CapturedPhoto>((res, rej) => {
          resolver = res;
          rechazar = rej;
        }),
    ),
    responder: (foto: CapturedPhoto) => resolver(foto),
    fallar: (error: unknown) => rechazar(error),
  };
  return falsa;
}

describe('ReportPage', () => {
  let component: ReportPage;
  let fixture: ComponentFixture<ReportPage>;
  let privacidad: ReturnType<typeof privacidadFalsa>;
  let duplicados: { findSimilar: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    privacidad = privacidadFalsa();
    duplicados = { findSimilar: vi.fn(async () => []) };

    TestBed.configureTestingModule({
      providers: [
        { provide: PrivacidadService, useValue: privacidad },
        { provide: DuplicateDetectionService, useValue: duplicados },
        { provide: CameraService, useValue: { takePhoto: vi.fn(async () => ORIGINAL), pickFromGallery: vi.fn() } },
        // Los toasts de Ionic esperan elementos que no existen en la prueba.
        { provide: ToastController, useValue: { create: vi.fn(async () => ({ present: async () => undefined })) } },
      ],
    });

    fixture = TestBed.createComponent(ReportPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  const texto = () => (fixture.nativeElement as HTMLElement).textContent ?? '';

  it('pide la ubicación antes de enviar', () => {
    expect(component.puedeEnviar()).toBe(false);
    expect(component.motivoBloqueo()?.icono).toBe('locate-outline');
  });

  it('despierta el servicio de privacidad al abrir la página', () => {
    component.ionViewWillEnter();

    expect(privacidad.despertar).toHaveBeenCalledTimes(1);
  });

  it('mientras protege la foto, el formulario sigue disponible y avisa si el servicio está despertando', async () => {
    const enCurso = component.tomarFotografia();
    await vi.waitFor(() => expect(privacidad.anonimizar).toHaveBeenCalledWith(ORIGINAL));

    expect(component.protegiendo()).toBe(true);
    expect(component.formulario.controls.descripcion.enabled).toBe(true);
    expect(component.motivoBloqueo()?.texto).toContain('protegiendo la foto');

    privacidad.estado.set('despertando');
    fixture.detectChanges();
    expect(texto()).toContain('Despertando el servicio de privacidad');
    expect(texto()).toContain('puedes seguir');

    privacidad.responder(PROTEGIDA);
    await enCurso;
  });

  it('al cancelar, quita la foto y deja enviar el reporte sin ella', async () => {
    component.ubicacion.set({ lat: -33.45, lng: -70.66, accuracy: 10 });
    const enCurso = component.tomarFotografia();
    await vi.waitFor(() => expect(privacidad.anonimizar).toHaveBeenCalled());
    fixture.detectChanges();
    expect(texto()).toContain('Cancelar');

    component.cancelarProteccion();
    await enCurso;

    expect(privacidad.cancelar).toHaveBeenCalled();
    expect(component.protegiendo()).toBe(false);
    expect(component.foto()).toBeNull();
    expect(component.fotoSinProteger()).toBeNull();
    expect(component.puedeEnviar()).toBe(true);
  });

  it('usa el vector que devuelve el servicio para buscar duplicados', async () => {
    component.ubicacion.set({ lat: -33.45, lng: -70.66, accuracy: 10 });
    const enCurso = component.tomarFotografia();
    await vi.waitFor(() => expect(privacidad.anonimizar).toHaveBeenCalled());

    privacidad.responder(PROTEGIDA);
    await enCurso;

    expect(component.foto()).toBe(PROTEGIDA);
    expect(duplicados.findSimilar).toHaveBeenCalledWith(expect.objectContaining({ embedding: [1, 0] }));
  });

  it('si la protección falla, la foto queda pendiente y bloquea el envío', async () => {
    component.ubicacion.set({ lat: -33.45, lng: -70.66, accuracy: 10 });
    const enCurso = component.tomarFotografia();
    await vi.waitFor(() => expect(privacidad.anonimizar).toHaveBeenCalled());

    privacidad.fallar(new PrivacidadError('No pudimos conectar con el servicio de privacidad.', 'red'));
    await enCurso;
    fixture.detectChanges();

    expect(component.foto()).toBeNull();
    expect(component.fotoSinProteger()).toBe(ORIGINAL);
    expect(component.puedeEnviar()).toBe(false);
    expect(component.motivoBloqueo()?.texto).toContain('Reintenta');
    expect(texto()).toContain('Reintentar');
  });

  it('al salir de la página con una foto en proceso, cancela la espera', async () => {
    const enCurso = component.tomarFotografia();
    await vi.waitFor(() => expect(privacidad.anonimizar).toHaveBeenCalled());

    fixture.destroy();
    await enCurso;

    expect(privacidad.cancelar).toHaveBeenCalled();
  });
});

describe('ReportPage sin señal', () => {
  let component: ReportPage;
  let fixture: ComponentFixture<ReportPage>;
  let privacidad: ReturnType<typeof privacidadFalsa>;
  let borrador: { enLinea: ReturnType<typeof signal<boolean>>; guardar: ReturnType<typeof vi.fn> };
  let toasts: string[];

  beforeEach(() => {
    privacidad = privacidadFalsa();
    borrador = { enLinea: signal(false), guardar: vi.fn(() => 'ok') };
    toasts = [];

    TestBed.configureTestingModule({
      providers: [
        { provide: PrivacidadService, useValue: privacidad },
        { provide: DuplicateDetectionService, useValue: { findSimilar: vi.fn(async () => []) } },
        { provide: CameraService, useValue: { takePhoto: vi.fn(async () => ORIGINAL), pickFromGallery: vi.fn() } },
        { provide: BorradorService, useValue: borrador },
        {
          provide: ToastController,
          useValue: {
            create: vi.fn(async ({ message }: { message: string }) => {
              toasts.push(message);
              return { present: async () => undefined };
            }),
          },
        },
      ],
    });

    fixture = TestBed.createComponent(ReportPage);
    component = fixture.componentInstance;
    component.ubicacion.set({ lat: -33.45, lng: -70.66, accuracy: 10 });
    component.formulario.setValue({ categoria: 'calle_deteriorada', descripcion: 'Bache grande frente al paradero' });
    fixture.detectChanges();
  });

  const texto = () => (fixture.nativeElement as HTMLElement).textContent ?? '';

  it('avisa que el reporte se guardará y cambia el botón', () => {
    expect(texto()).toContain('Sin señal. Al enviar, el reporte se guarda en este teléfono');
    expect(texto()).toContain('Guardar y enviar con señal');
  });

  it('una foto que no se pudo proteger por falta de señal no bloquea: se guarda con el borrador', async () => {
    const enCurso = component.tomarFotografia();
    await vi.waitFor(() => expect(privacidad.anonimizar).toHaveBeenCalled());
    privacidad.fallar(new PrivacidadError('No pudimos conectar con el servicio de privacidad.', 'red'));
    await enCurso;
    fixture.detectChanges();

    expect(component.puedeEnviar()).toBe(true);
    expect(component.motivoBloqueo()).toBeNull();
    expect(texto()).toContain('la foto se protege antes de subirla');
    expect(texto()).not.toContain('Reintentar');

    const navegar = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    await component.enviar();

    expect(borrador.guardar).toHaveBeenCalledWith(
      expect.objectContaining({ categoria: 'calle_deteriorada', descripcion: 'Bache grande frente al paradero', foto: null }),
      ORIGINAL,
    );
    expect(toasts).toContain('Sin señal: guardamos tu reporte y lo enviaremos solo cuando vuelva la conexión.');
    expect(navegar).toHaveBeenCalledWith('/home', { replaceUrl: true });
  });

  it('si ya hay un reporte esperando, no guarda otro y deja el formulario como está', async () => {
    borrador.guardar.mockReturnValue('ocupado');
    const navegar = vi.spyOn(TestBed.inject(Router), 'navigateByUrl');

    await component.enviar();

    expect(toasts[0]).toContain('Ya tienes un reporte esperando señal');
    expect(component.formulario.controls.descripcion.value).toBe('Bache grande frente al paradero');
    expect(navegar).not.toHaveBeenCalled();
  });
});
