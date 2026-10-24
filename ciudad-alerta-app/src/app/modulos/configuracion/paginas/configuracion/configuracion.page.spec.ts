import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ToastController } from '@ionic/angular';
import { afterEach, vi } from 'vitest';

import { AuthService } from '../../../../services/auth.service';
import { PreferenciasService } from '../../../../services/preferencias.service';
import { EstadoServicioPrivacidad, PrivacidadService } from '../../../reportes';
import { ConfiguracionPage } from './configuracion.page';
import { usarEntornoDePrueba } from '../../../../../testing';

usarEntornoDePrueba();

const DESPIERTO: EstadoServicioPrivacidad = {
  responde: true,
  listo: true,
  similitud: true,
  backend: 'wasm',
  version: '1.0.0',
  ms: 320,
  error: null,
};

describe('ConfiguracionPage', () => {
  let fixture: ComponentFixture<ConfiguracionPage>;
  let toasts: string[];
  let privacidad: { consultarEstado: ReturnType<typeof vi.fn> };

  async function abrir(rol: string): Promise<ConfiguracionPage> {
    TestBed.configureTestingModule({
      providers: [
        {
          provide: AuthService,
          useValue: {
            user: { uid: 'u1', email: 'rodrigo@prueba.cl' },
            getUserProfile: vi.fn().mockResolvedValue({ role: rol, displayName: 'Rodrigo' }),
          },
        },
        { provide: PrivacidadService, useValue: privacidad },
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
    fixture = TestBed.createComponent(ConfiguracionPage);
    await fixture.componentInstance.ionViewWillEnter();
    fixture.detectChanges();
    return fixture.componentInstance;
  }

  const texto = () => (fixture.nativeElement.textContent as string).replace(/\s+/g, ' ');

  beforeEach(() => {
    localStorage.clear();
    toasts = [];
    privacidad = { consultarEstado: vi.fn().mockResolvedValue(DESPIERTO) };
  });

  afterEach(() => vi.unstubAllGlobals());

  it('un vecino ve apariencia, pantalla al abrir, ahorro de datos y el servicio de fotos, sin lo del equipo', async () => {
    await abrir('ciudadano');

    expect(texto()).toContain('Tamaño del texto');
    expect(texto()).toContain('Al abrir la app');
    expect(texto()).toContain('Ahorro de datos');
    expect(texto()).toContain('Protección de las fotos');
    expect(texto()).not.toContain('Para el equipo');
  });

  it('los cambios llegan a las preferencias', async () => {
    const pagina = await abrir('ciudadano');
    const preferencias = TestBed.inject(PreferenciasService);

    pagina.cambiar('texto', 'grande');
    pagina.cambiar('ahorroDatos', true);
    pagina.cambiarPantalla('/report-new');

    expect(preferencias.valores()).toMatchObject({ texto: 'grande', ahorroDatos: true, abrirEn: '/report-new' });

    pagina.cambiarPantalla('');
    expect(preferencias.valores().abrirEn).toBeNull();
  });

  it('las pantallas para abrir son los botones del inicio de la cuenta, sin Configuración', async () => {
    const pagina = await abrir('ciudadano');
    const rutas = pagina.pantallas().map((p) => p.ruta);
    const textos = pagina.pantallas().map((p) => p.texto);

    expect(textos).toContain('Crear un reporte');
    expect(rutas).not.toContain('/configuracion');
    expect(rutas).not.toContain('/admin-reports');
  });

  it('comprobar el servicio dice si está despierto', async () => {
    const pagina = await abrir('ciudadano');

    await pagina.comprobarServicio();
    fixture.detectChanges();

    expect(privacidad.consultarEstado).toHaveBeenCalledTimes(1);
    expect(texto()).toContain('Despierto: las fotos se protegerán al instante.');
    // Los detalles técnicos son para el equipo.
    expect(texto()).not.toContain('Comparar fotos');
  });

  it('si estaba dormido, dice cuánto tardó en despertar', async () => {
    privacidad.consultarEstado.mockResolvedValue({ ...DESPIERTO, ms: 41_000 });
    const pagina = await abrir('ciudadano');
    await pagina.comprobarServicio();
    fixture.detectChanges();

    expect(texto()).toContain('Estaba dormido y ya despertó (tardó 41 s)');
  });

  it('un operador ve los datos del equipo y del servicio, pero no la lista de módulos', async () => {
    const pagina = await abrir('operador');
    await pagina.comprobarServicio();
    fixture.detectChanges();

    expect(texto()).toContain('Para el equipo');
    expect(texto()).toContain('Proyecto de Firebase');
    expect(texto()).toContain('Comparar fotos');
    expect(texto()).not.toContain('Módulos de esta versión');
  });

  it('un administrador ve además los módulos de la versión', async () => {
    await abrir('admin');
    expect(texto()).toContain('Módulos de esta versión');
    expect(texto()).toContain('Configuración');
  });

  it('copia los datos para soporte sin el correo de la cuenta', async () => {
    const escribir = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { ...navigator, userAgent: 'Prueba/1.0', clipboard: { writeText: escribir } });
    const pagina = await abrir('ciudadano');

    await pagina.copiarDiagnostico();

    const copiado = escribir.mock.calls[0][0] as string;
    expect(copiado).toContain('Ciudad Alerta');
    expect(copiado).toContain('Módulos:');
    expect(copiado).not.toContain('rodrigo@prueba.cl');
    expect(toasts).toContain('Copiado. Pégalo en tu mensaje de soporte.');
  });
});
