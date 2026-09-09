import { Component, OnInit, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import {
  AlertController,
  IonButton,
  IonContent,
  IonHeader,
  IonIcon,
  IonTitle,
  IonToolbar,
  LoadingController,
  ToastController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { logOutOutline, personCircleOutline, ribbonOutline } from 'ionicons/icons';

import { AuthFailure, AuthService } from '../../services/auth.service';
import { UserProfile } from '../../models/user-profile.model';

@Component({
  selector: 'app-home',
  standalone: true,
  templateUrl: './home.page.html',
  styleUrls: ['./home.page.scss'],
  imports: [
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonButton,
    IonIcon,
  ],
})
export class HomePage implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly loadingCtrl = inject(LoadingController);
  private readonly toastCtrl = inject(ToastController);
  private readonly alertCtrl = inject(AlertController);

  /** Usuario autenticado expuesto como señal por el servicio. */
  readonly usuario = this.authService.currentUser;
  readonly perfil = signal<UserProfile | null>(null);
  readonly cargandoPerfil = signal(true);

  constructor() {
    addIcons({ logOutOutline, personCircleOutline, ribbonOutline });
  }

  async ngOnInit(): Promise<void> {
    const actual = this.authService.user;

    if (!actual) {
      this.cargandoPerfil.set(false);
      return;
    }

    try {
      this.perfil.set(await this.authService.getUserProfile(actual.uid));
    } catch {
      this.perfil.set(null);
    } finally {
      this.cargandoPerfil.set(false);
    }
  }

  /** CA-77 · Cierre de sesión con confirmación previa. */
  async confirmarCierreSesion(): Promise<void> {
    const alert = await this.alertCtrl.create({
      header: 'Cerrar sesión',
      message: 'Tendrás que ingresar tus credenciales la próxima vez.',
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Cerrar sesión',
          role: 'destructive',
          handler: () => {
            void this.cerrarSesion();
          },
        },
      ],
    });

    await alert.present();
  }

  private async cerrarSesion(): Promise<void> {
    const loading = await this.loadingCtrl.create({
      message: 'Cerrando sesión',
      spinner: 'crescent',
    });
    await loading.present();

    try {
      await this.authService.logout();
      await loading.dismiss();
      await this.router.navigateByUrl('/login', { replaceUrl: true });
    } catch (error) {
      await loading.dismiss();
      const mensaje =
        error instanceof AuthFailure
          ? error.message
          : 'No pudimos cerrar la sesión. Intenta nuevamente.';

      const toast = await this.toastCtrl.create({
        message: mensaje,
        duration: 3000,
        color: 'danger',
        position: 'bottom',
      });
      await toast.present();
    }
  }
}