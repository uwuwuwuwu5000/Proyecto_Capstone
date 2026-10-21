import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonTitle,
  IonToolbar,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { personCircleOutline } from 'ionicons/icons';

import { CerrarSesionComponent } from '../../compartido/sesion';
import { ThemeToggleComponent } from '../../compartido/tema';
import { VersionDemoComponent } from '../../compartido/version-demo';
import { UserProfile } from '../../models/user-profile.model';
import { ModulosService, RanuraComponent } from '../../nucleo/modulos';
import { AuthService } from '../../services/auth.service';

/**
 * Inicio: saludo, lo que los módulos ponen en `inicio.resumen` (recordatorio
 * de verificar el correo, tus reportes, por atender, nivel de confianza) y los
 * botones de cada módulo activo, agrupados: la acción principal, «Explorar»,
 * «Tu cuenta» y «Gestión».
 *
 * Los datos de la cuenta y la verificación del correo están en «Mi perfil»
 * (feedback Sprint 5). Aquí queda lo mínimo para que el inicio funcione con
 * cualquier combinación de módulos, incluido «Cerrar sesión».
 */
@Component({
  selector: 'app-home',
  standalone: true,
  templateUrl: './home.page.html',
  styleUrls: ['./home.page.scss'],
  imports: [
    CerrarSesionComponent,
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
  protected readonly modulos = inject(ModulosService);

  /** Usuario autenticado expuesto como señal por el servicio. */
  readonly usuario = this.authService.currentUser;
  readonly perfil = signal<UserProfile | null>(null);

  /**
   * Botones del inicio: los declara cada módulo activo (modulos.config.ts) y
   * se filtran por rol. Mostrar u ocultar un botón es una ayuda de interfaz:
   * el acceso real lo controlan los guards y las reglas de Firestore.
   */
  readonly grupos = computed(() => this.modulos.grupos(this.perfil()?.role ?? null));

  /** "Hola, Rodrigo": el nombre del perfil, o el comienzo del correo. */
  readonly saludo = computed(() => {
    const nombre = this.perfil()?.displayName?.trim() || this.usuario()?.email?.split('@')[0];
    return nombre ? `Hola, ${nombre.split(' ')[0]}` : 'Hola';
  });

  constructor() {
    // Los íconos de los botones de cada módulo los registra provideModulos().
    addIcons({ personCircleOutline });
  }

  /**
   * BUG 31 · Ionic reutiliza la instancia de la página al volver a entrar, y con
   * `ngOnInit` el perfil de la cuenta anterior quedaba en pantalla tras cerrar
   * sesión e ingresar con otra. `ionViewWillEnter` corre en cada entrada.
   *
   * El perfil se relee siempre, sin caché por uid: con caché, una cuenta
   * promovida a `admin` seguía viendo el menú de ciudadano durante toda la
   * sesión. Es una lectura por entrada, coste asumible frente a mostrar
   * permisos equivocados.
   */
  async ionViewWillEnter(): Promise<void> {
    const actual = this.authService.user;

    if (!actual) {
      this.perfil.set(null);
      return;
    }

    try {
      // Repara el perfil si falta y alinea el rol con la lista de
      // administradores, por si la cuenta se promovió después del último acceso.
      await this.authService.asegurarPerfil();
      this.perfil.set(await this.authService.getUserProfile(actual.uid));
    } catch {
      this.perfil.set(null);
    }
  }
}
