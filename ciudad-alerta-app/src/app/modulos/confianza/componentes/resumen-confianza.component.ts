import { Component, effect, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IonIcon, IonProgressBar, ToastController } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { chevronForwardOutline, ribbonOutline } from 'ionicons/icons';

import { UserProfile } from '../../../models/user-profile.model';
import { ConfianzaService } from '../datos/confianza.service';
import { ProgresoNivel, progresoDeNivel } from '@ciudad-alerta/comun';

/**
 * Tarjeta del inicio con el nivel de confianza y el avance al siguiente.
 * Llena la ranura `inicio.resumen`; al tocarla abre «Mi nivel».
 * Las cuentas de operador no la ven: no reportan ni confirman.
 */
@Component({
  selector: 'app-resumen-confianza',
  standalone: true,
  imports: [RouterLink, IonIcon, IonProgressBar],
  template: `
    @if (progreso(); as p) {
      <a class="resumen" routerLink="/mi-nivel">
        <ion-icon class="resumen__icono" name="ribbon-outline" aria-hidden="true"></ion-icon>
        <span class="resumen__cuerpo">
          <strong>Nivel {{ p.nivel }} · {{ p.nombre }}</strong>
          <span class="resumen__detalle">
            {{ p.puntos }} PC
            @if (p.hasta !== null) {
              · te faltan {{ p.faltan }} para el nivel {{ p.nivel + 1 }}
            } @else {
              · nivel máximo
            }
          </span>
          <ion-progress-bar [value]="p.fraccion" aria-hidden="true"></ion-progress-bar>
        </span>
        <ion-icon name="chevron-forward-outline" aria-hidden="true"></ion-icon>
      </a>
    }
  `,
  styles: `
    .resumen {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.8rem 0.9rem;
      border: 1px solid var(--ca-line);
      border-radius: 12px;
      background: var(--ca-surface);
      color: var(--ca-ink);
      text-decoration: none;
    }

    .resumen__icono {
      font-size: 1.6rem;
      color: var(--ca-signal);
      flex-shrink: 0;
    }

    .resumen__cuerpo {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 0.3rem;
      font-size: 0.92rem;
    }

    .resumen__detalle {
      font-size: 0.78rem;
      color: var(--ca-muted);
    }

    ion-progress-bar {
      height: 6px;
      border-radius: 999px;
      --background: var(--ca-velo-fuerte);
      --progress-background: var(--ca-signal);
    }
  `,
})
export class ResumenConfianzaComponent {
  private readonly confianza = inject(ConfianzaService);
  private readonly toastCtrl = inject(ToastController);

  readonly perfil = input<UserProfile | null>(null);

  protected readonly progreso = signal<ProgresoNivel | null>(null);

  constructor() {
    addIcons({ chevronForwardOutline, ribbonOutline });

    effect(() => {
      const perfil = this.perfil();

      if (!perfil || perfil.role === 'operador') {
        this.progreso.set(null);
        return;
      }

      // El inicio vuelve a leer el perfil en cada entrada; con él se relee el
      // nivel, que pudo cambiar por un veredicto mientras tanto.
      void this.cargar();
    });
  }

  private async cargar(): Promise<void> {
    try {
      const estado = await this.confianza.miConfianza();
      const progreso = progresoDeNivel(estado.puntos);
      this.progreso.set(progreso);

      if (this.confianza.subioDeNivel(progreso.nivel)) {
        const toast = await this.toastCtrl.create({
          message: `¡Subiste al nivel ${progreso.nivel}: ${progreso.nombre}!`,
          duration: 4000,
          color: 'success',
          position: 'top',
        });
        await toast.present();
      }
    } catch {
      this.progreso.set(null);
    }
  }
}
