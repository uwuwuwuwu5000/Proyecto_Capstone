import { Component, inject } from '@angular/core';
import { IonApp, IonRouterOutlet } from '@ionic/angular';

import { ThemeService } from './services/theme.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [IonApp, IonRouterOutlet],
  template: `
    <ion-app>
      <ion-router-outlet></ion-router-outlet>
    </ion-app>
  `,
})
export class AppComponent {
  /**
   * Inyectar el servicio aquí fuerza su creación al arrancar la aplicación, de
   * modo que el tema guardado se aplica antes de la primera pantalla.
   */
  private readonly themeService = inject(ThemeService);
}
