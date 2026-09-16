import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
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
import {
  addCircleOutline,
  chatbubblesOutline,
  documentTextOutline,
  fileTrayFullOutline,
  logOutOutline,
  mapOutline,
  navigateOutline,
  personCircleOutline,
  ribbonOutline,
} from 'ionicons/icons';

import { AuthFailure, AuthService } from '../../services/auth.service';
import { UserProfile } from '../../models/user-profile.model';

@Component({
  selector: 'app-home',
  standalone: true,
  templateUrl: './home.page.html',
  styleUrls: ['./home.page.scss'],
  imports: [
    RouterLink,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonButton,
    IonIcon,
  ],
})
export class HomePage {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly loadingCtrl = inject(LoadingController);
  private readonly toastCtrl = inject(ToastController);
  private readonly alertCtrl = inject(AlertController);

  /** Usuario autenticado expuesto como señal por el servicio. */
  readonly usuario = this.authService.currentUser;
  readonly perfil = signal<UserProfile | null>(null);

  /**
   * La bandeja de soporte solo aparece para los roles de gestión. Es una ayuda
   * de interfaz: el acceso real lo controlan `staffGuard` y las reglas de
   * Firestore, que rechazan la lectura a cualquier otro rol.
   */
  readonly esStaff = computed(() => {
    const rol = this.perfil()?.role;
    return rol === 'operador' || rol === 'admin';
  });
  readonly cargandoPerfil = signal(true);

  /** uid cuyo perfil está actualmente en pantalla. */
  private uidCargado: string | null = null;

  constructor() {
    addIcons({
      addCircleOutline,
      chatbubblesOutline,
      documentTextOutline,
      fileTrayFullOutline,
      logOutOutline,
      mapOutline,
      navigateOutline,
      personCircleOutline,
      ribbonOutline,
    });
  }

  /**
   * BUG 31 · Ionic reutiliza la instancia de la página al volver a entrar, y con
   * `ngOnInit` el perfil de la cuenta anterior quedaba en pantalla tras cerrar
   * sesión e ingresar con otra. `ionViewWillEnter` corre en cada entrada, y la
   * comparación de uid evita recargas innecesarias.
   */
  async ionViewWillEnter(): Promise<void> {
    const actual = this.authService.user;

    if (!actual) {
      this.perfil.set(null);
      this.uidCargado = null;
      this.cargandoPerfil.set(false);
      return;
    }

    if (this.uidCargado === actual.uid && this.perfil() !== null) {
      return;
    }

    this.cargandoPerfil.set(true);
    this.perfil.set(null);

    try {
      this.perfil.set(await this.authService.getUserProfile(actual.uid));
      this.uidCargado = actual.uid;
    } catch {
      this.perfil.set(null);
      this.uidCargado = null;
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
