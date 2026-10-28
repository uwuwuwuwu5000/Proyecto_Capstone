import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { AlertController, LoadingController, ToastController } from '@ionic/angular';
import { vi } from 'vitest';

import { AuthFailure, AuthService } from '../../services/auth.service';
import { LoginPage } from './login.page';
import { usarEntornoDePrueba } from '../../../testing';

usarEntornoDePrueba();

type Boton = { text: string; handler?: (datos: Record<string, string>) => boolean | void };

describe('LoginPage', () => {
  let fixture: ComponentFixture<LoginPage>;
  let pagina: LoginPage;
  let auth: { login: ReturnType<typeof vi.fn>; register: ReturnType<typeof vi.fn>; resetPassword: ReturnType<typeof vi.fn> };
  let navegar: ReturnType<typeof vi.spyOn>;
  let alertas: { buttons: Boton[]; inputs?: { value?: string }[] }[];
  let toasts: string[];

  beforeEach(() => {
    auth = { login: vi.fn(async () => undefined), register: vi.fn(async () => undefined), resetPassword: vi.fn(async () => undefined) };
    alertas = [];
    toasts = [];
    const presentable = { present: async () => undefined, dismiss: async () => undefined };
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: auth },
        { provide: LoadingController, useValue: { create: async () => presentable } },
        {
          provide: ToastController,
          useValue: { create: async ({ message }: { message: string }) => (toasts.push(message), presentable) },
        },
        {
          provide: AlertController,
          useValue: { create: async (opciones: (typeof alertas)[number]) => (alertas.push(opciones), presentable) },
        },
      ],
    });
    fixture = TestBed.createComponent(LoginPage);
    pagina = fixture.componentInstance;
    navegar = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    fixture.detectChanges();
  });

  const texto = () => {
    fixture.detectChanges();
    return (fixture.nativeElement.textContent as string).replace(/\s+/g, ' ');
  };

  describe('iniciar sesión', () => {
    it('con datos válidos entra y va al inicio sin dejar el login en el historial', async () => {
      pagina.loginForm.setValue({ email: 'ana@prueba.cl', password: 'secreta1' });

      await pagina.iniciarSesion();

      expect(auth.login).toHaveBeenCalledWith('ana@prueba.cl', 'secreta1');
      expect(navegar).toHaveBeenCalledWith('/home', { replaceUrl: true });
    });

    it('con el formulario incompleto no llama a Firebase y marca los campos', async () => {
      pagina.loginForm.setValue({ email: 'no-es-correo', password: '123' });

      await pagina.iniciarSesion();

      expect(auth.login).not.toHaveBeenCalled();
      expect(texto()).toContain('La contraseña tiene al menos 6 caracteres');
    });

    it('si Firebase rechaza, muestra el motivo en el formulario (una sola vez)', async () => {
      auth.login.mockRejectedValue(new AuthFailure('Correo o contraseña incorrectos.', 'auth/invalid-credential'));
      pagina.loginForm.setValue({ email: 'ana@prueba.cl', password: 'equivocada' });

      await pagina.iniciarSesion();

      expect(pagina.errorMensaje()).toBe('Correo o contraseña incorrectos.');
      expect(texto().match(/Correo o contraseña incorrectos/g)).toHaveLength(1);
      expect(toasts).toEqual([]);
      expect(navegar).not.toHaveBeenCalled();
    });

    it('un error inesperado no muestra texto técnico', async () => {
      auth.login.mockRejectedValue(new TypeError('Cannot read properties of undefined'));
      pagina.loginForm.setValue({ email: 'ana@prueba.cl', password: 'secreta1' });

      await pagina.iniciarSesion();

      expect(pagina.errorMensaje()).toBe('No pudimos completar la operación. Intenta nuevamente.');
    });
  });

  describe('crear cuenta', () => {
    const valido = {
      displayName: 'Ana Pérez',
      email: 'ana@prueba.cl',
      password: 'secreta1',
      confirmPassword: 'secreta1',
      aceptaTerminos: true,
    };

    beforeEach(() => pagina.cambiarModo('registro'));

    it('sin aceptar los términos no deja crear la cuenta', async () => {
      pagina.registroForm.setValue({ ...valido, aceptaTerminos: false });

      await pagina.registrar();

      expect(pagina.registroForm.invalid).toBe(true);
      expect(auth.register).not.toHaveBeenCalled();
    });

    it('no acepta un nombre de más de 60 caracteres (las reglas no lo dejarían reportar)', async () => {
      pagina.registroForm.setValue({ ...valido, displayName: 'A'.repeat(61) });

      await pagina.registrar();

      expect(pagina.registroForm.controls.displayName.hasError('maxlength')).toBe(true);
      expect(auth.register).not.toHaveBeenCalled();

      pagina.registroForm.controls.displayName.setValue('A'.repeat(60));
      expect(pagina.registroForm.controls.displayName.valid).toBe(true);
    });

    it('con contraseñas distintas lo dice', async () => {
      pagina.registroForm.setValue({ ...valido, confirmPassword: 'otra1234' });

      await pagina.registrar();

      expect(auth.register).not.toHaveBeenCalled();
      expect(texto()).toContain('Las contraseñas no coinciden');
    });

    it('con todo en orden crea la cuenta, saluda y va al inicio', async () => {
      pagina.registroForm.setValue(valido);

      await pagina.registrar();

      expect(auth.register).toHaveBeenCalledWith('ana@prueba.cl', 'secreta1', 'Ana Pérez');
      expect(toasts[0]).toContain('Cuenta creada');
      expect(navegar).toHaveBeenCalledWith('/home', { replaceUrl: true });
    });

    it('el formulario muestra el enlace a los términos', () => {
      expect(texto()).toContain('Acepto los términos de uso y la política de privacidad');
      expect(fixture.nativeElement.querySelector('.terminos a')?.getAttribute('href')).toBe('/terminos');
    });
  });

  it('al cambiar de modo se borra lo escrito en el otro formulario y el error', async () => {
    pagina.loginForm.setValue({ email: 'ana@prueba.cl', password: 'x' });
    pagina.errorMensaje.set('Algo falló');

    pagina.cambiarModo('registro');
    pagina.cambiarModo('login');

    expect(pagina.loginForm.getRawValue()).toEqual({ email: '', password: '' });
    expect(pagina.errorMensaje()).toBeNull();
  });

  it('recuperar contraseña: precarga el correo y no envía uno inválido', async () => {
    pagina.loginForm.controls.email.setValue('ana@prueba.cl');

    await pagina.recuperarContrasena();

    expect(alertas[0].inputs?.[0].value).toBe('ana@prueba.cl');
    const enviar = alertas[0].buttons.find((b) => b.text === 'Enviar enlace')!;
    expect(enviar.handler!({ email: 'mal' })).toBe(false);
    expect(auth.resetPassword).not.toHaveBeenCalled();

    expect(enviar.handler!({ email: ' ana@prueba.cl ' })).toBe(true);
    await vi.waitFor(() => expect(auth.resetPassword).toHaveBeenCalledWith('ana@prueba.cl'));
    await vi.waitFor(() => expect(toasts.some((t) => t.includes('Revisa también la carpeta de spam'))).toBe(true));
  });
});
