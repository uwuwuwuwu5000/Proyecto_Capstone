import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IonButton, IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { settingsOutline } from 'ionicons/icons';

/**
 * Engranaje de la barra superior que abre Configuración. Lo pone el módulo
 * de configuración en la ranura `cabecera.acciones`, junto a la campana.
 */
@Component({
  selector: 'app-boton-configuracion',
  standalone: true,
  imports: [RouterLink, IonButton, IonIcon],
  template: `
    <ion-button
      fill="clear"
      class="engranaje"
      routerLink="/configuracion"
      aria-label="Configuración"
      title="Configuración"
    >
      <ion-icon slot="icon-only" name="settings-outline" aria-hidden="true"></ion-icon>
    </ion-button>
  `,
  styles: `
    .engranaje {
      --color: var(--ca-ink);
      --padding-start: 8px;
      --padding-end: 8px;
      margin: 0;
    }
  `,
})
export class BotonConfiguracionComponent {
  constructor() {
    addIcons({ settingsOutline });
  }
}
