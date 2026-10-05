import { Component, computed, inject } from '@angular/core';
import { IonButton, IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { moonOutline, sunnyOutline } from 'ionicons/icons';

import { ThemeService } from '../../services/theme.service';

/**
 * Botón para alternar entre tema claro y oscuro.
 *
 * Muestra el icono del tema al que se va a cambiar, no del actual: es la
 * convención más extendida y la que el usuario reconoce como acción.
 */
@Component({
  selector: 'app-theme-toggle',
  standalone: true,
  imports: [IonButton, IonIcon],
  template: `
    <ion-button
      fill="clear"
      class="alternador"
      [attr.aria-label]="etiqueta()"
      [title]="etiqueta()"
      (click)="themeService.alternar()"
    >
      <ion-icon slot="icon-only" [name]="icono()" aria-hidden="true"></ion-icon>
    </ion-button>
  `,
  styles: `
    .alternador {
      --color: var(--ca-ink);
      --padding-start: 8px;
      --padding-end: 8px;
      margin: 0;
    }

    .alternador:active {
      opacity: 0.7;
    }
  `,
})
export class ThemeToggleComponent {
  protected readonly themeService = inject(ThemeService);

  protected readonly icono = computed(() =>
    this.themeService.tema() === 'oscuro' ? 'sunny-outline' : 'moon-outline',
  );

  protected readonly etiqueta = computed(() =>
    this.themeService.tema() === 'oscuro' ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro',
  );

  constructor() {
    addIcons({ moonOutline, sunnyOutline });
  }
}
