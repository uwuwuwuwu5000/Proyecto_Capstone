import { Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { chevronForwardOutline, mailUnreadOutline } from 'ionicons/icons';

import { UserProfile } from '../../../models/user-profile.model';
import { AuthService } from '../../../services/auth.service';

/**
 * Recordatorio en el inicio (ranura `inicio.resumen`) mientras el correo no
 * esté verificado. Lleva a «Mi perfil», donde está el envío del enlace.
 */
@Component({
  selector: 'app-aviso-verificacion',
  standalone: true,
  imports: [RouterLink, IonIcon],
  template: `
    @if (pendiente()) {
      <a class="aviso" routerLink="/perfil">
        <ion-icon class="aviso__icono" name="mail-unread-outline" aria-hidden="true"></ion-icon>
        <span class="aviso__cuerpo">
          <strong>Verifica tu correo</strong>
          <span>Así validamos que tus reportes vienen de una persona real.</span>
        </span>
        <ion-icon name="chevron-forward-outline" aria-hidden="true"></ion-icon>
      </a>
    }
  `,
  styles: `
    .aviso {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.8rem 0.9rem;
      border: 1px solid rgba(28, 169, 201, 0.4);
      border-radius: 12px;
      background: rgba(28, 169, 201, 0.08);
      color: var(--ca-ink);
      text-decoration: none;
    }

    .aviso__icono {
      font-size: 1.4rem;
      color: var(--ca-signal);
      flex-shrink: 0;
    }

    .aviso__cuerpo {
      display: flex;
      flex: 1;
      flex-direction: column;
      gap: 0.15rem;
      font-size: 0.82rem;
      line-height: 1.4;
      color: var(--ca-muted);

      strong {
        font-size: 0.92rem;
        color: var(--ca-ink);
      }
    }
  `,
})
export class AvisoVerificacionComponent {
  private readonly authService = inject(AuthService);

  /** Entrada de la ranura; se usa para recalcular al volver al inicio. */
  readonly perfil = input<UserProfile | null>(null);

  /**
   * Manda Firebase Auth: `emailVerified` del perfil puede ir atrasado. Si el
   * perfil ya dice verificado (se comprobó en otra pantalla), también vale.
   */
  protected readonly pendiente = computed(() => {
    const perfil = this.perfil();
    const usuario = this.authService.currentUser();
    return !!usuario && !usuario.emailVerified && perfil?.emailVerified !== true;
  });

  constructor() {
    addIcons({ chevronForwardOutline, mailUnreadOutline });
  }
}
