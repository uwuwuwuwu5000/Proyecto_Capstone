import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AlertController, IonButton, IonIcon, LoadingController, ToastController } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { logOutOutline } from 'ionicons/icons';

import { AuthFailure, AuthService } from '../../services/auth.service';

/**
 * CA-77 · Botón «Cerrar sesión» con confirmación previa.
 *
 * Lo usan el inicio (siempre está, aunque se desactive cualquier módulo) y
 * «Mi perfil». Feedback Sprint 5: en rojo, para que no se confunda con las
 * acciones de la app.
 */
@Component({
  selector: 'app-cerrar-sesion',
  standalone: true,
  imports: [IonButton, IonIcon],
  template: `
    <ion-button class="accion-salir" expand="block" fill="outline" (click)="confirmar()">
      <ion-icon slot="start" name="log-out-outline" aria-hidden="true"></ion-icon>
      Cerrar sesión
    </ion-button>
  `,
  styles: `
    :host {
      display: block;
    }

    .accion-salir {
      --color: var(--ion-color-danger);
      --border-color: var(--ion-color-danger);
      --border-radius: 10px;
      margin: 0;
      text-transform: none;
      font-weight: 600;
    }
  `,
})
export class CerrarSesionComponent {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly alertCtrl = inject(AlertController);
  private readonly loadingCtrl = inject(LoadingController);
  private readonly toastCtrl = inject(ToastController);

  constructor() {
    addIcons({ logOutOutline });
  }

  async confirmar(): Promise<void> {
    const alerta = await this.alertCtrl.create({
      header: 'Cerrar sesión',
      message: 'Tendrás que ingresar tus credenciales la próxima vez.',
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Cerrar sesión',
          role: 'destructive',
          handler: () => {
            void this.cerrar();
          },
        },
      ],
    });

    await alerta.present();
  }

  async cerrar(): Promise<void> {
    const cargando = await this.loadingCtrl.create({ message: 'Cerrando sesión', spinner: 'crescent' });
    await cargando.present();

    try {
      await this.authService.logout();
      await cargando.dismiss();
      await this.router.navigateByUrl('/login', { replaceUrl: true });
    } catch (error) {
      await cargando.dismiss();
      const toast = await this.toastCtrl.create({
        message:
          error instanceof AuthFailure ? error.message : 'No pudimos cerrar la sesión. Intenta nuevamente.',
        duration: 3000,
        color: 'danger',
        position: 'bottom',
      });
      await toast.present();
    }
  }
}
