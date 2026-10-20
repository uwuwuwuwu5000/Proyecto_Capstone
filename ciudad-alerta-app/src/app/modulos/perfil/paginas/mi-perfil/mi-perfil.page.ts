import { Component, computed, inject, signal } from '@angular/core';
import { Timestamp } from 'firebase/firestore';
import {
  IonBackButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonTitle,
  IonToolbar,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { personCircleOutline } from 'ionicons/icons';

import { CerrarSesionComponent } from '../../../../compartido/sesion';
import { ThemeToggleComponent } from '../../../../compartido/tema';
import { UserProfile } from '../../../../models/user-profile.model';
import { RanuraComponent } from '../../../../nucleo/modulos';
import { AuthService } from '../../../../services/auth.service';
import { VerificacionCorreoComponent } from '../../componentes/verificacion-correo/verificacion-correo.component';
import { PerfilService } from '../../datos/perfil.service';
import { ETIQUETAS_ROL } from '../../modelo';

type Estado = 'cargando' | 'listo' | 'error';

/**
 * Mi perfil (feedback Sprint 5: «mover Información de Perfil a sección mi
 * perfil»). Reúne lo que antes estaba en el inicio: datos de la cuenta,
 * verificación del correo y cierre de sesión.
 *
 * Deja la ranura `perfil.resumen`, donde el sistema de confianza pone el
 * nivel del usuario.
 */
@Component({
  selector: 'app-mi-perfil',
  standalone: true,
  templateUrl: './mi-perfil.page.html',
  styleUrls: ['./mi-perfil.page.scss'],
  imports: [
    CerrarSesionComponent,
    RanuraComponent,
    ThemeToggleComponent,
    VerificacionCorreoComponent,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonBackButton,
    IonContent,
    IonIcon,
  ],
})
export class MiPerfilPage {
  private readonly authService = inject(AuthService);
  private readonly perfilService = inject(PerfilService);

  readonly usuario = this.authService.currentUser;
  readonly perfil = signal<UserProfile | null>(null);
  readonly estado = signal<Estado>('cargando');
  readonly correoVerificado = signal(false);
  /** Solo para operadores: "Municipalidad de Maipú". */
  readonly organismo = signal<string | null>(null);

  readonly rol = computed(() => ETIQUETAS_ROL[this.perfil()?.role ?? 'ciudadano']);

  readonly miembroDesde = computed(() => {
    const creado = this.perfil()?.createdAt;
    return creado instanceof Timestamp
      ? creado.toDate().toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' })
      : null;
  });

  constructor() {
    addIcons({ personCircleOutline });
  }

  /**
   * Se relee en cada entrada (BUG 31): Ionic reutiliza la página y, sin esto,
   * tras cambiar de cuenta quedaban los datos de la anterior.
   */
  async ionViewWillEnter(): Promise<void> {
    await this.cargar();
  }

  async cargar(): Promise<void> {
    const usuario = this.authService.user;
    this.organismo.set(null);

    if (!usuario) {
      this.perfil.set(null);
      this.estado.set('error');
      return;
    }

    this.estado.set('cargando');
    this.correoVerificado.set(usuario.emailVerified);

    try {
      const perfil = await this.authService.getUserProfile(usuario.uid);
      this.perfil.set(perfil);
      this.estado.set(perfil ? 'listo' : 'error');

      if (perfil?.role === 'operador' && perfil.operadorId) {
        this.organismo.set(await this.perfilService.organismoDeOperador(perfil.operadorId));
      }
    } catch {
      this.perfil.set(null);
      this.estado.set('error');
    }
  }

  alVerificar(): void {
    this.correoVerificado.set(true);
    this.perfil.update((actual) => (actual ? { ...actual, emailVerified: true } : actual));
  }
}
