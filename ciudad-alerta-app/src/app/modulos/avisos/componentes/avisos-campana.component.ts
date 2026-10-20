import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IonBadge, IonButton, IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { notificationsOutline } from 'ionicons/icons';

import { AvisosService } from '../datos/avisos.service';

/**
 * Campana con el número de avisos sin ver. Abre la lista de avisos.
 * La pone el módulo de avisos en la ranura `cabecera.acciones`.
 */
@Component({
  selector: 'app-avisos-campana',
  standalone: true,
  imports: [RouterLink, IonButton, IonIcon, IonBadge],
  template: `
    <ion-button
      fill="clear"
      class="campana"
      routerLink="/avisos"
      [attr.aria-label]="etiqueta()"
      [title]="etiqueta()"
    >
      <ion-icon slot="icon-only" name="notifications-outline" aria-hidden="true"></ion-icon>
      @if (noVistos() > 0) {
        <ion-badge class="campana__contador" aria-hidden="true">
          {{ noVistos() > 9 ? '9+' : noVistos() }}
        </ion-badge>
      }
    </ion-button>
  `,
  styles: `
    .campana {
      --color: var(--ca-ink);
      --padding-start: 8px;
      --padding-end: 8px;
      position: relative;
      margin: 0;
    }

    .campana__contador {
      position: absolute;
      top: 2px;
      right: 0;
      min-width: 18px;
      height: 18px;
      padding: 2px 5px;
      border-radius: 999px;
      --background: var(--ion-color-danger);
      --color: var(--ion-color-danger-contrast);
      font-size: 0.66rem;
      font-weight: 700;
      line-height: 14px;
    }
  `,
})
export class AvisosCampanaComponent {
  private readonly avisosService = inject(AvisosService);
  protected readonly noVistos = this.avisosService.noVistos;

  /** El número va en la etiqueta para que el lector de pantalla lo anuncie. */
  protected readonly etiqueta = computed(() => {
    const total = this.noVistos();
    return total === 0
      ? 'Avisos, ninguno sin ver'
      : `Avisos, ${total} sin ver`;
  });

  constructor() {
    addIcons({ notificationsOutline });
  }
}
