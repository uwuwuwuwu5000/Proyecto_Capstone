import { Component, inject, output, signal } from '@angular/core';
import { IonButton, IonIcon, ToastController } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { mailUnreadOutline } from 'ionicons/icons';

import { AuthFailure, AuthService } from '../../../../services/auth.service';

/**
 * Bloque «Verifica tu correo»: envía el enlace y comprueba si ya se abrió.
 * Antes estaba en el inicio; ahora vive en «Mi perfil» (feedback Sprint 5) y
 * el inicio solo muestra un recordatorio que lleva aquí.
 */
@Component({
  selector: 'app-verificacion-correo',
  standalone: true,
  imports: [IonButton, IonIcon],
  templateUrl: './verificacion-correo.component.html',
  styleUrls: ['./verificacion-correo.component.scss'],
})
export class VerificacionCorreoComponent {
  private readonly authService = inject(AuthService);
  private readonly toastCtrl = inject(ToastController);

  /** Avisa cuando Firebase confirma el correo, para actualizar la pantalla. */
  readonly verificado = output<void>();

  protected readonly enviando = signal(false);
  protected readonly enviado = signal(false);
  protected readonly comprobando = signal(false);

  constructor() {
    addIcons({ mailUnreadOutline });
  }

  async enviar(): Promise<void> {
    if (this.enviando()) {
      return;
    }

    this.enviando.set(true);

    try {
      await this.authService.enviarVerificacionCorreo();
      this.enviado.set(true);
      const correo = this.authService.user?.email ?? 'tu correo';
      await this.toast(`Te enviamos un enlace a ${correo}. Revisa también la carpeta de spam.`, 'success');
    } catch (error) {
      await this.toast(
        error instanceof AuthFailure ? error.message : 'No pudimos enviar el correo de verificación.',
        'danger',
      );
    } finally {
      this.enviando.set(false);
    }
  }

  /**
   * El usuario verifica desde su bandeja de correo, fuera de la app, así que
   * hay que pedirle a Firebase el estado actualizado.
   */
  async comprobar(): Promise<void> {
    this.comprobando.set(true);

    try {
      if (await this.authService.comprobarVerificacion()) {
        this.verificado.emit();
        await this.toast('Correo verificado. ¡Gracias!', 'success');
      } else {
        await this.toast(
          'Todavía no aparece como verificado. Abre el enlace del correo y vuelve a intentarlo.',
          'danger',
        );
      }
    } catch {
      await this.toast('No pudimos comprobar la verificación.', 'danger');
    } finally {
      this.comprobando.set(false);
    }
  }

  private async toast(message: string, color: 'success' | 'danger'): Promise<void> {
    const toast = await this.toastCtrl.create({
      message,
      duration: 3500,
      color,
      position: 'bottom',
      buttons: [{ text: 'Cerrar', role: 'cancel' }],
    });
    await toast.present();
  }
}
