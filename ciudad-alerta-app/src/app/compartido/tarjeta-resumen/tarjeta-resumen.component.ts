import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { chevronForwardOutline } from 'ionicons/icons';

/**
 * Tarjeta del resumen del inicio: ícono, título, una línea de detalle y una
 * nota opcional, y lleva a una pantalla. La usan las piezas que los módulos
 * ponen en la ranura `inicio.resumen` («Tus reportes», «Por atender»), para
 * que todas se vean igual.
 *
 * El ícono lo registra quien la usa (addIcons), como cualquier ion-icon.
 */
@Component({
  selector: 'app-tarjeta-resumen',
  standalone: true,
  imports: [RouterLink, IonIcon],
  template: `
    <a class="tarjeta" [routerLink]="enlace()">
      <ion-icon class="tarjeta__icono" [name]="icono()" aria-hidden="true"></ion-icon>
      <span class="tarjeta__cuerpo">
        <strong>{{ titulo() }}</strong>
        @if (detalle()) {
          <span class="tarjeta__detalle">{{ detalle() }}</span>
        }
        @if (nota()) {
          <span class="tarjeta__nota">{{ nota() }}</span>
        }
      </span>
      <ion-icon name="chevron-forward-outline" aria-hidden="true"></ion-icon>
    </a>
  `,
  styles: `
    :host {
      display: block;
    }

    .tarjeta {
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

    .tarjeta__icono {
      font-size: 1.6rem;
      color: var(--ca-signal);
      flex-shrink: 0;
    }

    .tarjeta__cuerpo {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 0.2rem;
      font-size: 0.92rem;
    }

    .tarjeta__detalle {
      font-size: 0.82rem;
    }

    .tarjeta__nota {
      font-size: 0.78rem;
      color: var(--ca-muted);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  `,
})
export class TarjetaResumenComponent {
  readonly icono = input.required<string>();
  readonly titulo = input.required<string>();
  readonly detalle = input<string | null>(null);
  readonly nota = input<string | null>(null);
  /** Ruta, como en routerLink: '/my-reports' o ['/report', id]. */
  readonly enlace = input.required<string | readonly string[]>();

  constructor() {
    addIcons({ chevronForwardOutline });
  }
}
