import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import { ThemeToggleComponent } from '../../compartido/tema';
import {
  AlertController,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonTitle,
  IonToolbar,
  LoadingController,
  ToastController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';

import { VersionDemoComponent } from '../../compartido/version-demo';
import { logOutOutline, mailUnreadOutline, personCircleOutline } from 'ionicons/icons';

import { AuthFailure, AuthService } from '../../services/auth.service';
import { UserProfile } from '../../models/user-profile.model';
import { ModulosService, RanuraComponent } from '../../nucleo/modulos';

@Component({
  selector: 'app-home',
  standalone: true,
  templateUrl: './home.page.html',
  styleUrls: ['./home.page.scss'],
  imports: [
    RanuraComponent,
    RouterLink,
    ThemeToggleComponent,
    VersionDemoComponent,
    IonButtons,
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
  protected readonly modulos = inject(ModulosService);

  /** Usuario autenticado expuesto como señal por el servicio. */
  readonly usuario = this.authService.currentUser;
  readonly perfil = signal<UserProfile | null>(null);

  /**
   * Botones del inicio: los declara cada módulo activo (modulos.config.ts) y
   * se filtran por rol. Mostrar u ocultar un botón es una ayuda de interfaz:
   * el acceso real lo controlan los guards y las reglas de Firestore.
   */
  readonly accesos = computed(() => this.modulos.accesos(this.perfil()?.role ?? null));
  readonly cargandoPerfil = signal(true);

  /** Estado del flujo de verificación de correo. */
  readonly correoVerificado = signal(false);
  readonly enviandoVerificacion = signal(false);
  readonly verificacionEnviada = signal(false);
  readonly comprobandoVerificacion = signal(false);

  /** uid cuyo perfil está actualmente en pantalla. */
  private uidCargado: string | null = null;

  constructor() {
    // Los íconos de los botones de cada módulo los registra provideModulos().
    addIcons({ logOutOutline, mailUnreadOutline, personCircleOutline });
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

    /**
     * El perfil se relee en cada entrada, sin caché por uid.
     *
     * Antes se omitía la recarga cuando el uid coincidía con el ya cargado, y
     * eso dejaba el rol congelado: una cuenta promovida a `admin` seguía viendo
     * el menú de ciudadano durante toda la sesión, incluso tras cerrar sesión y
     * volver a entrar con el mismo usuario, porque Ionic conserva la instancia
     * de la página. Es una lectura de documento por entrada, coste asumible
     * frente a mostrar permisos equivocados.
     */
    this.cargandoPerfil.set(true);
    this.correoVerificado.set(actual.emailVerified);

    try {
      // Repara el perfil si falta y alinea el rol con la lista de
      // administradores, por si la cuenta se promovió después del último acceso.
      await this.authService.asegurarPerfil();

      this.perfil.set(await this.authService.getUserProfile(actual.uid));
      this.uidCargado = actual.uid;
    } catch {
      this.perfil.set(null);
      this.uidCargado = null;
    } finally {
      this.cargandoPerfil.set(false);
    }
  }

  /** Envía el correo con el enlace de verificación. */
  async enviarVerificacion(): Promise<void> {
    if (this.enviandoVerificacion()) {
      return;
    }

    this.enviandoVerificacion.set(true);

    try {
      await this.authService.enviarVerificacionCorreo();
      this.verificacionEnviada.set(true);

      const correo = this.authService.user?.email ?? 'tu correo';
      await this.mostrarToast(
        `Te enviamos un enlace a ${correo}. Revisa también la carpeta de spam.`,
        'success',
      );
    } catch (error) {
      const mensaje =
        error instanceof AuthFailure
          ? error.message
          : 'No pudimos enviar el correo de verificación.';
      await this.mostrarToast(mensaje, 'danger');
    } finally {
      this.enviandoVerificacion.set(false);
    }
  }

  /**
   * El usuario verifica desde su bandeja de correo, fuera de la app, así que
   * hay que pedirle a Firebase el estado actualizado.
   */
  async comprobarVerificacion(): Promise<void> {
    this.comprobandoVerificacion.set(true);

    try {
      const verificado = await this.authService.comprobarVerificacion();
      this.correoVerificado.set(verificado);

      if (verificado) {
        this.perfil.update((actual) =>
          actual ? { ...actual, emailVerified: true } : actual,
        );
        await this.mostrarToast('Correo verificado. ¡Gracias!', 'success');
      } else {
        await this.mostrarToast(
          'Todavía no aparece como verificado. Abre el enlace del correo y vuelve a intentarlo.',
          'danger',
        );
      }
    } catch {
      await this.mostrarToast('No pudimos comprobar la verificación.', 'danger');
    } finally {
      this.comprobandoVerificacion.set(false);
    }
  }

  private async mostrarToast(message: string, color: 'success' | 'danger'): Promise<void> {
    const toast = await this.toastCtrl.create({
      message,
      duration: 3500,
      color,
      position: 'bottom',
      buttons: [{ text: 'Cerrar', role: 'cancel' }],
    });
    await toast.present();
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
