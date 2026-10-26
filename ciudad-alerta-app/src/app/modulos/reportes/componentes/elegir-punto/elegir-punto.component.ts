import { Component, computed, input, output, signal, viewChild } from '@angular/core';
import { IonButton, IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { checkmarkOutline } from 'ionicons/icons';

import { AreaMapa, CajaMapa, MapViewComponent } from '../../../../compartido/mapa';

export interface PuntoElegido {
  lat: number;
  lng: number;
}

/** Con 6 decimales el punto queda a 10 cm: más no aporta y ensucia los datos. */
const redondear = (valor: number) => Math.round(valor * 1e6) / 1e6;

/**
 * Elegir en el mapa el punto de un reporte. La marca queda fija al centro y
 * la persona mueve el mapa debajo hasta dejarla sobre el problema, como al
 * pedir un auto por aplicación: es más fácil de acertar con el dedo que
 * arrastrar un pin pequeño. Con teclado, el mapa se mueve con las flechas.
 *
 * Solo lo ofrece la pantalla de reporte a cuentas con al menos 7 días
 * (ver ubicacion.ts).
 */
@Component({
  selector: 'app-elegir-punto',
  standalone: true,
  imports: [MapViewComponent, IonButton, IonIcon],
  template: `
    <p class="ayuda">Mueve el mapa hasta que la marca quede justo sobre el problema. Con dos dedos lo acercas.</p>
    @if (!inicio()) {
      <p class="ayuda">No pudimos usar tu ubicación para empezar: busca el lugar moviendo el mapa.</p>
    }

    <div class="selector">
      <app-map-view [encuadre]="encuadre()" (areaCambiada)="alMover($event)" />
      @if (!errorDelMapa()) {
        <span class="mira" aria-hidden="true"></span>
      }
    </div>

    <p class="coordenadas" aria-live="polite">
      @if (centro(); as punto) {
        Punto elegido: {{ punto.lat.toFixed(5) }}, {{ punto.lng.toFixed(5) }}
      } @else {
        Mueve el mapa para elegir el punto.
      }
    </p>

    <div class="acciones">
      <ion-button expand="block" type="button" [disabled]="!centro() || !!errorDelMapa()" (click)="usar()">
        <ion-icon slot="start" name="checkmark-outline" aria-hidden="true"></ion-icon>
        Usar este punto
      </ion-button>
      <ion-button class="cancelar" expand="block" fill="clear" type="button" (click)="cancelado.emit()">Cancelar</ion-button>
    </div>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 0.6rem;
    }
    .ayuda,
    .coordenadas {
      margin: 0;
      font-size: 0.86rem;
      line-height: 1.5;
      color: var(--ca-muted);
    }
    .coordenadas {
      color: var(--ca-ink);
      font-variant-numeric: tabular-nums;
    }
    .selector {
      position: relative;
      --mapa-alto: 280px;
    }
    /* La punta de la marca cae en el centro exacto del mapa. */
    .mira {
      position: absolute;
      left: calc(50% - 13px);
      top: calc(50% - 31px);
      width: 22px;
      height: 22px;
      border-radius: 50% 50% 50% 4px;
      transform: rotate(-45deg);
      background: var(--ca-signal);
      border: 2px solid #111827;
      box-shadow: 0 2px 6px rgba(0, 0, 0, 0.4);
      pointer-events: none;
      z-index: 500;
    }
    .acciones {
      display: flex;
      flex-direction: column;
      gap: 0.4rem;
    }
    .acciones ion-button {
      margin: 0;
      --border-radius: 10px;
      text-transform: none;
    }
    .cancelar {
      --color: var(--ca-muted);
    }
  `,
})
export class ElegirPuntoComponent {
  /** Dónde empieza el mapa (la ubicación actual, si se pudo). null: centro de Santiago. */
  readonly inicio = input<PuntoElegido | null>(null);

  readonly elegido = output<PuntoElegido>();
  readonly cancelado = output<void>();

  /** Lo que hay bajo la marca. null hasta que el mapa termina de ubicarse. */
  readonly centro = signal<PuntoElegido | null>(null);

  protected readonly encuadre = computed<CajaMapa | null>(() => {
    const punto = this.inicio();
    return punto ? { minLat: punto.lat, maxLat: punto.lat, minLng: punto.lng, maxLng: punto.lng } : null;
  });

  private readonly mapa = viewChild(MapViewComponent);

  /** Sin mapa (sin señal, servicio caído) no hay dónde elegir: la marca sobraría. */
  protected readonly errorDelMapa = computed(() => this.mapa()?.error() ?? null);

  constructor() {
    addIcons({ checkmarkOutline });
  }

  alMover(area: AreaMapa): void {
    this.centro.set({ lat: redondear(area.centro.lat), lng: redondear(area.centro.lng) });
  }

  usar(): void {
    const punto = this.centro();

    if (punto && !this.errorDelMapa()) {
      this.elegido.emit(punto);
    }
  }
}
