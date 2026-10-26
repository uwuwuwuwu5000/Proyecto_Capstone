import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { LoadingController, ToastController } from '@ionic/angular';
import { vi } from 'vitest';

import { ReportPage } from './report.page';
import { authDePrueba, usarEntornoDePrueba } from '../../../../../testing';
import { FIREBASE_AUTH } from '../../../../core/firebase.providers';
import { ComunaDetectada, ComunaService } from '../../../../services/comuna.service';
import { GeolocationService, LocationError } from '../../../../services/geolocation.service';
import { CameraService, CapturedPhoto } from '../../datos/camera.service';
import { BorradorService } from '../../datos/borrador.service';
import { DuplicateDetectionService } from '../../datos/duplicate-detection.service';
import { PrivacidadError, PrivacidadService } from '../../datos/privacidad.service';
import { ReportService } from '../../datos/report.service';

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

describe('ReportPage · dónde se marca el reporte', () => {
  const DIA = 86_400_000;
  const GPS = { lat: -33.5106, lng: -70.7572, accuracy: 12 };
  const MAIPU: ComunaDetectada = {
    comuna: 'Maipú',
    region: 'Región Metropolitana de Santiago',
    codigo: '13119',
    organismoId: 'muni_13119',
    fuente: 'limites_oficiales',
  };

  let fixture: ComponentFixture<ReportPage>;
  let component: ReportPage;
  let gps: { getCurrentPosition: ReturnType<typeof vi.fn> };
  let comunas: { detectar: ReturnType<typeof vi.fn> };
  let duplicados: { findSimilar: ReturnType<typeof vi.fn> };
  let reportes: { createReport: ReturnType<typeof vi.fn> };

  /** Abre la página con una cuenta creada en `creadaMs` (sin fecha si no se indica). */
  function montar(creadaMs?: number): void {
    gps = { getCurrentPosition: vi.fn(async () => ({ ...GPS })) };
    comunas = { detectar: vi.fn(async () => MAIPU) };
    duplicados = { findSimilar: vi.fn(async () => []) };
    reportes = { createReport: vi.fn(async () => 'nuevo') };

    TestBed.configureTestingModule({
      providers: [
        { provide: FIREBASE_AUTH, useFactory: () => authDePrueba({ uid: 'vecino-1', creadaMs }) },
        { provide: GeolocationService, useValue: gps },
        { provide: ComunaService, useValue: comunas },
        { provide: DuplicateDetectionService, useValue: duplicados },
        { provide: ReportService, useValue: reportes },
        { provide: PrivacidadService, useValue: privacidadFalsa() },
        { provide: BorradorService, useValue: { enLinea: signal(true), guardar: vi.fn() } },
        { provide: ToastController, useValue: { create: vi.fn(async () => ({ present: async () => undefined })) } },
        {
          provide: LoadingController,
          useValue: { create: vi.fn(async () => ({ present: async () => undefined, dismiss: async () => undefined })) },
        },
      ],
    });

    fixture = TestBed.createComponent(ReportPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  const texto = () => (fixture.nativeElement as HTMLElement).textContent ?? '';
  const boton = (nombre: string) =>
    [...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLIonButtonElement>('ion-button')].find((b) => b.textContent?.includes(nombre));

  it('una cuenta con más de 7 días puede elegir el punto en el mapa, que empieza donde está el teléfono', async () => {
    montar(Date.now() - 30 * DIA);

    expect(boton('Elegir en el mapa')?.disabled).toBe(false);
    expect(texto()).not.toContain('estará disponible');
    expect(component.motivoBloqueo()?.texto).toContain('"Elegir en el mapa"');

    await component.elegirEnMapa();
    fixture.detectChanges();

    expect(gps.getCurrentPosition).toHaveBeenCalledTimes(1);
    expect(component.eligiendoEnMapa()).toBe(true);
    expect(component.inicioMapa()).toEqual({ lat: GPS.lat, lng: GPS.lng });
    // El GPS solo sirve para empezar: la ubicación es el punto que se elija.
    expect(component.ubicacion()).toBeNull();
    expect((fixture.nativeElement as HTMLElement).querySelector('app-elegir-punto')).not.toBeNull();
    expect(component.motivoBloqueo()?.texto).toContain('"Usar este punto"');
  });

  it('el punto elegido es la ubicación del reporte: la comuna, los parecidos y el envío usan ese punto', async () => {
    montar(Date.now() - 30 * DIA);
    await component.elegirEnMapa();
    await component.usarPuntoDelMapa({ lat: -33.5121, lng: -70.759 });
    fixture.detectChanges();

    const punto = { lat: -33.5121, lng: -70.759, accuracy: 0, fuente: 'mapa' };
    expect(component.eligiendoEnMapa()).toBe(false);
    expect(component.ubicacion()).toEqual(punto);
    expect(comunas.detectar).toHaveBeenCalledWith(punto);
    expect(duplicados.findSimilar).toHaveBeenCalledWith(expect.objectContaining({ ubicacion: punto }));
    expect(texto()).toContain('punto elegido en el mapa');
    expect(texto()).not.toContain('precisión aproximada');
    expect(texto()).toContain('Mover el punto');
    expect(texto()).toContain('Usar mi ubicación actual');

    component.formulario.setValue({ categoria: 'microbasural', descripcion: 'Bolsas de basura en la esquina del pasaje' });
    vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    await component.enviar();

    expect(reportes.createReport).toHaveBeenCalledWith(expect.objectContaining({ ubicacion: punto, comuna: MAIPU }));
  });

  it('la ubicación del GPS queda marcada como tal, y el mapa empieza en ella sin volver a pedirla', async () => {
    montar(Date.now() - 30 * DIA);
    await component.obtenerUbicacion();
    fixture.detectChanges();

    expect(component.ubicacion()).toEqual({ ...GPS, fuente: 'gps' });
    expect(texto()).toContain('precisión aproximada de 12 m');

    await component.elegirEnMapa();
    expect(gps.getCurrentPosition).toHaveBeenCalledTimes(1);
    expect(component.inicioMapa()).toEqual({ lat: GPS.lat, lng: GPS.lng });

    // Cancelar deja la ubicación que había.
    component.cancelarMapa();
    expect(component.eligiendoEnMapa()).toBe(false);
    expect(component.ubicacion()).toEqual({ ...GPS, fuente: 'gps' });
  });

  it('sin GPS el mapa igual se abre, para buscar el lugar a mano', async () => {
    montar(Date.now() - 30 * DIA);
    gps.getCurrentPosition.mockRejectedValue(new LocationError('El permiso de ubicación está denegado.', 'denegado'));

    await component.elegirEnMapa();

    expect(component.eligiendoEnMapa()).toBe(true);
    expect(component.inicioMapa()).toBeNull();
    expect(component.preparandoMapa()).toBe(false);
  });

  it('una cuenta de menos de 7 días solo puede usar su ubicación actual, y se le dice cuánto falta', async () => {
    montar(Date.now() - 2 * DIA);

    expect(boton('Elegir en el mapa')?.disabled).toBe(true);
    expect(texto()).toContain('cuando tu cuenta cumpla 7 días (te faltan 5 días)');
    expect(component.motivoBloqueo()?.texto).not.toContain('Elegir en el mapa');

    await component.elegirEnMapa();
    await component.usarPuntoDelMapa({ lat: -33.6, lng: -70.6 });
    expect(component.eligiendoEnMapa()).toBe(false);
    expect(component.ubicacion()).toBeNull();
    expect(gps.getCurrentPosition).not.toHaveBeenCalled();

    // Con la ubicación ya registrada tampoco se ofrece.
    await component.obtenerUbicacion();
    fixture.detectChanges();
    expect(boton('Elegir en el mapa')).toBeUndefined();
    expect(boton('Mover el punto')).toBeUndefined();
  });

  it('si no se sabe cuándo se creó la cuenta, la trata como nueva', () => {
    montar(undefined);

    expect(component.permisoMapa().permitido).toBe(false);
    expect(boton('Elegir en el mapa')?.disabled).toBe(true);
    expect(texto()).toContain('para cuentas con al menos 7 días');
  });

  it('si el punto cambia mientras se busca la comuna, se queda con la del último punto', async () => {
    montar(Date.now() - 30 * DIA);
    let responderPrimera: (comuna: ComunaDetectada) => void = () => undefined;
    comunas.detectar.mockImplementationOnce(() => new Promise((res) => (responderPrimera = res)));

    const conGps = component.obtenerUbicacion();
    await vi.waitFor(() => expect(comunas.detectar).toHaveBeenCalledTimes(1));

    const cerrillos: ComunaDetectada = { ...MAIPU, comuna: 'Cerrillos', codigo: '13102', organismoId: 'muni_13102' };
    comunas.detectar.mockResolvedValueOnce(cerrillos);
    await component.usarPuntoDelMapa({ lat: -33.49, lng: -70.71 });
    expect(component.comuna()).toEqual(cerrillos);

    // La respuesta atrasada del primer punto llega después y no lo pisa.
    responderPrimera(MAIPU);
    await conGps;
    expect(component.comuna()).toEqual(cerrillos);
    expect(component.detectandoComuna()).toBe(false);
  });
});
