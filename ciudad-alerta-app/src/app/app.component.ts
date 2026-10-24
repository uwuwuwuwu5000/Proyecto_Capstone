import { Component, Injector, afterNextRender, inject } from '@angular/core';
import { NavigationEnd, NavigationError, Router } from '@angular/router';
import { IonApp, IonRouterOutlet } from '@ionic/angular';

import { ArranqueService } from './nucleo/carga';
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

  // El servicio de avisos ya no se crea aquí: lo arranca el módulo de avisos
  // (modulos/avisos/avisos.modulo.ts) solo si está activo.

  constructor() {
    /**
     * La pantalla de arranque (index.html) la quita el inicio cuando tiene
     * todo. Si la app abre en otra pantalla (el login, o un enlace directo),
     * se quita apenas esa pantalla se dibuja.
     */
    const router = inject(Router);
    const arranque = inject(ArranqueService);
    const injector = inject(Injector);

    const suscripcion = router.events.subscribe((evento) => {
      // Una navegación cancelada (un guard que redirige al login) no cuenta:
      // la que sigue es la que termina en pantalla.
      if (!(evento instanceof NavigationEnd || evento instanceof NavigationError)) {
        return;
      }

      suscripcion.unsubscribe();
      const enInicio = evento instanceof NavigationEnd && evento.urlAfterRedirects.startsWith('/home');
      if (!enInicio) {
        afterNextRender(() => arranque.terminar(), { injector });
      }
    });
  }
}
