import { Component, inject, signal } from '@angular/core';
import {
  AbstractControl,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { Router } from '@angular/router';
import {
  AlertController,
  IonButton,
  IonContent,
  IonIcon,
  IonInput,
  IonInputPasswordToggle,
  IonNote,
  IonSegment,
  IonSegmentButton,
  IonText,
  LoadingController,
  ToastController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { alertCircleOutline, mailOutline, shieldCheckmarkOutline } from 'ionicons/icons';

import { AuthFailure, AuthService } from '../../services/auth.service';

type Modo = 'login' | 'registro';

/** Validador de grupo: la confirmación debe coincidir con la contraseña. */
function passwordsIguales(group: AbstractControl): ValidationErrors | null {
  const password = group.get('password')?.value;
  const confirm = group.get('confirmPassword')?.value;
  return password && confirm && password !== confirm ? { noCoinciden: true } : null;
}

@Component({
  selector: 'app-login',
  standalone: true,
  templateUrl: './login.page.html',
  styleUrls: ['./login.page.scss'],
  imports: [
    ReactiveFormsModule,
    IonContent,
    IonSegment,
    IonSegmentButton,
    IonInput,
    IonInputPasswordToggle,
    IonButton,
    IonIcon,
    IonNote,
    IonText,
  ],
})
export class LoginPage {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly loadingCtrl = inject(LoadingController);
  private readonly toastCtrl = inject(ToastController);
  private readonly alertCtrl = inject(AlertController);

  readonly modo = signal<Modo>('login');
  readonly errorMensaje = signal<string | null>(null);

  // CA-49 · Credenciales de acceso
  readonly loginForm = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]],
  });

  // CA-48 · Alta de cuenta
  readonly registroForm = this.fb.group(
    {
      displayName: ['', [Validators.required, Validators.minLength(3)]],
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(6)]],
      confirmPassword: ['', [Validators.required]],
    },
    { validators: passwordsIguales },
  );

  constructor() {
    addIcons({ mailOutline, alertCircleOutline, shieldCheckmarkOutline });
  }

  cambiarModo(valor: string | number | undefined): void {
    if (valor !== 'login' && valor !== 'registro') {
      return;
    }
    this.modo.set(valor);
    this.errorMensaje.set(null);
  }

  async iniciarSesion(): Promise<void> {
    this.errorMensaje.set(null);

    if (this.loginForm.invalid) {
      this.loginForm.markAllAsTouched();
      return;
    }

    const { email, password } = this.loginForm.getRawValue();
    const loading = await this.mostrarCargando('Verificando credenciales');

    try {
      await this.authService.login(email, password);
      await loading.dismiss();
      await this.router.navigateByUrl('/home', { replaceUrl: true });
    } catch (error) {
      await loading.dismiss();
      this.mostrarError(error);
    }
  }

  async registrar(): Promise<void> {
    this.errorMensaje.set(null);

    if (this.registroForm.invalid) {
      this.registroForm.markAllAsTouched();
      return;
    }

    const { displayName, email, password } = this.registroForm.getRawValue();
    const loading = await this.mostrarCargando('Creando tu cuenta');

    try {
      await this.authService.register(email, password, displayName);
      await loading.dismiss();
      await this.mostrarToast('Cuenta creada. Bienvenido a Ciudad Alerta.', 'success');
      await this.router.navigateByUrl('/home', { replaceUrl: true });
    } catch (error) {
      await loading.dismiss();
      this.mostrarError(error);
    }
  }

  /** CA-75 · Recuperación de contraseña mediante ion-alert con input. */
  async recuperarContrasena(): Promise<void> {
    const correoPrecargado = this.loginForm.controls.email.value;

    const alert = await this.alertCtrl.create({
      header: 'Recuperar contraseña',
      message: 'Te enviaremos un enlace para crear una contraseña nueva.',
      inputs: [
        {
          name: 'email',
          type: 'email',
          placeholder: 'tucorreo@ejemplo.cl',
          value: correoPrecargado,
          attributes: { autocomplete: 'email', inputmode: 'email' },
        },
      ],
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Enviar enlace',
          role: 'confirm',
          handler: (data: { email: string }) => {
            const email = (data.email ?? '').trim();
            const formatoValido = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);

            if (!formatoValido) {
              this.mostrarToast('Escribe un correo válido para enviar el enlace.', 'warning');
              return false;
            }

            void this.enviarCorreoRecuperacion(email);
            return true;
          },
        },
      ],
    });

    await alert.present();
  }

  private async enviarCorreoRecuperacion(email: string): Promise<void> {
    const loading = await this.mostrarCargando('Enviando enlace');

    try {
      await this.authService.resetPassword(email);
      await loading.dismiss();
      await this.mostrarToast(
        `Enviamos el enlace a ${email}. Revisa también la carpeta de spam.`,
        'success',
      );
    } catch (error) {
      await loading.dismiss();
      this.mostrarError(error);
    }
  }

  private async mostrarCargando(mensaje: string): Promise<HTMLIonLoadingElement> {
    const loading = await this.loadingCtrl.create({
      message: mensaje,
      spinner: 'crescent',
      backdropDismiss: false,
    });
    await loading.present();
    return loading;
  }

  private async mostrarToast(
    mensaje: string,
    color: 'success' | 'danger' | 'warning',
  ): Promise<void> {
    const toast = await this.toastCtrl.create({
      message: mensaje,
      duration: 3200,
      color,
      position: 'bottom',
      buttons: [{ text: 'Cerrar', role: 'cancel' }],
    });
    await toast.present();
  }

  private mostrarError(error: unknown): void {
    const mensaje =
      error instanceof AuthFailure
        ? error.message
        : 'No pudimos completar la operación. Intenta nuevamente.';

    this.errorMensaje.set(mensaje);
    void this.mostrarToast(mensaje, 'danger');
  }
}