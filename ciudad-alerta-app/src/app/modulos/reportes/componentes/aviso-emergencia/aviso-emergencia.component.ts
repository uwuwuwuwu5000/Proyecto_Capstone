import { Component, computed, input } from '@angular/core';
import { IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { callOutline, warningOutline } from 'ionicons/icons';
import { NUMEROS_DE_EMERGENCIA, riesgoDeCategoria } from '@ciudad-alerta/comun';

/**
 * Aviso de emergencia al crear un reporte de una categoría que puede ser un
 * peligro inmediato (árbol, cables, socavón). Ciudad Alerta no atiende
 * emergencias: si hay peligro ahora, hay que llamar.
 */
@Component({
  selector: 'app-aviso-emergencia',
  standalone: true,
  imports: [IonIcon],
  template: `
    @if (riesgo(); as texto) {
      <aside class="emergencia" role="note" aria-labelledby="titulo-emergencia">
        <p class="emergencia__titulo" id="titulo-emergencia">
          <ion-icon name="warning-outline" aria-hidden="true"></ion-icon>
          ¿Hay peligro ahora?
        </p>
        <p class="emergencia__texto">
          {{ texto }}, no esperes la respuesta del reporte: llama. Ciudad Alerta no atiende emergencias.
        </p>
        <div class="emergencia__numeros">
          @for (n of numeros; track n.numero) {
            <a class="numero" [href]="'tel:' + n.numero" [attr.aria-label]="'Llamar a ' + n.nombre + ', ' + n.numero">
              <strong>{{ n.numero }}</strong>
              <span>{{ n.nombre }}</span>
            </a>
          }
        </div>
      </aside>
    }
  `,
  styles: `
    :host {
      display: block;
    }
    .emergencia {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      padding: 0.8rem 0.9rem;
      border-left: 3px solid var(--ca-danger);
      border-radius: 10px;
      background: rgba(224, 101, 107, 0.1);
    }
    .emergencia__titulo {
      display: flex;
      align-items: center;
      gap: 0.4rem;
      margin: 0;
      font-weight: 700;
      font-size: 0.9rem;
      color: var(--ca-ink);
    }
    .emergencia__titulo ion-icon {
      color: var(--ca-danger);
      font-size: 1.15rem;
    }
    .emergencia__texto {
      margin: 0;
      font-size: 0.82rem;
      line-height: 1.45;
      color: var(--ca-ink);
    }
    .emergencia__numeros {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 0.4rem;
    }
    .numero {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 0.45rem 0.25rem;
      border: 1px solid var(--ca-danger);
      border-radius: 8px;
      color: var(--ca-ink);
      text-decoration: none;
      text-align: center;
    }
    .numero strong {
      font-size: 1.05rem;
      color: var(--ca-danger);
    }
    .numero span {
      font-size: 0.7rem;
      color: var(--ca-muted);
    }
  `,
})
export class AvisoEmergenciaComponent {
  readonly categoria = input<string | null>(null);

  protected readonly numeros = NUMEROS_DE_EMERGENCIA;
  protected readonly riesgo = computed(() => riesgoDeCategoria(this.categoria()));

  constructor() {
    addIcons({ callOutline, warningOutline });
  }
}
