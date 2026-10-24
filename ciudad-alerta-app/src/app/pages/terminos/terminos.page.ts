import { Component, computed, inject, input, signal } from '@angular/core';
import { Router } from '@angular/router';
import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonContent,
  IonFooter,
  IonHeader,
  IonSpinner,
  IonTitle,
  IonToolbar,
  ToastController,
} from '@ionic/angular';
import { DOCUMENTOS_LEGALES, FECHA_TERMINOS } from '@ciudad-alerta/comun';

import { AuthService } from '../../services/auth.service';
import { TerminosService } from '../../services/terminos.service';

/**
 * Términos de uso y política de privacidad. Es parte del esqueleto (como el
 * login): se abre sin sesión desde el registro, y con `?aceptar=1` el inicio
 * la usa para pedir que una cuenta acepte la versión vigente.
 *
 * El texto está en comun/src/legal/terminos.ts, el mismo que publica el
 * servicio de Render en /privacidad.
 */
@Component({
  selector: 'app-terminos',
  standalone: true,
  templateUrl: './terminos.page.html',
  styleUrls: ['./terminos.page.scss'],
  imports: [
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonBackButton,
    IonContent,
    IonFooter,
    IonButton,
    IonSpinner,
  ],
})
export class TerminosPage {
  private readonly terminos = inject(TerminosService);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly toastCtrl = inject(ToastController);

  /** `?aceptar=1`: la cuenta debe aceptarlos para seguir (withComponentInputBinding). */
  readonly aceptar = input<string | undefined>(undefined);

  readonly documentos = DOCUMENTOS_LEGALES;
  readonly fecha = FECHA_TERMINOS;
  readonly guardando = signal(false);

  readonly pidiendoAceptar = computed(() => !!this.aceptar() && this.authService.user !== null);

  irA(id: string): void {
    document.getElementById(`legal-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async aceptarTerminos(): Promise<void> {
    if (this.guardando()) return;
    this.guardando.set(true);
    try {
      await this.terminos.aceptar();
      await this.router.navigateByUrl('/home', { replaceUrl: true });
    } catch {
      const toast = await this.toastCtrl.create({
        message: 'No pudimos guardar tu aceptación. Revisa tu conexión y vuelve a intentar.',
        duration: 3000,
        color: 'danger',
        position: 'bottom',
      });
      await toast.present();
    } finally {
      this.guardando.set(false);
    }
  }

  async cerrarSesion(): Promise<void> {
    await this.authService.logout();
    await this.router.navigateByUrl('/login', { replaceUrl: true });
  }
}
