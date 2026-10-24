import { Component, computed, inject, input, signal } from '@angular/core';
import { AlertController, IonButton, IonIcon, ToastController } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { closeCircleOutline, createOutline } from 'ionicons/icons';
import { problemaDescripcion } from '@ciudad-alerta/comun';

import { DESCRIPCION_MAX, DESCRIPCION_MIN, Report } from '../../../../models/report.model';
import { MOTIVO_RETIRO_MAXIMO, MiReporteError, MiReporteService } from '../../datos/mi-reporte.service';

/**
 * «Tu reporte» en el detalle: el autor corrige la descripción o retira el
 * reporte mientras nadie lo haya revisado. Después de un cambio avisa al
 * detalle con el reporte nuevo (alCambiar), que también recarga el
 * historial.
 */
@Component({
  selector: 'app-acciones-autor',
  standalone: true,
  imports: [IonButton, IonIcon],
  template: `
    @if (visible()) {
      <section class="propio" aria-labelledby="titulo-propio">
        <h2 id="titulo-propio">Tu reporte</h2>
        <p class="nota">Mientras nadie lo revise, puedes corregir la descripción o retirarlo.</p>
        <div class="propio__acciones">
          <ion-button fill="outline" size="small" [disabled]="guardando()" (click)="pedirEdicion()">
            <ion-icon slot="start" name="create-outline" aria-hidden="true"></ion-icon>
            Corregir descripción
          </ion-button>
          <ion-button fill="clear" size="small" color="danger" [disabled]="guardando()" (click)="pedirRetiro()">
            <ion-icon slot="start" name="close-circle-outline" aria-hidden="true"></ion-icon>
            Retirar reporte
          </ion-button>
        </div>
      </section>
    }
  `,
  styles: `
    :host {
      display: block;
    }
    .propio {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }
    h2 {
      margin: 0;
      font-size: 1rem;
      font-weight: 700;
    }
    .nota {
      margin: 0;
      font-size: 0.84rem;
      line-height: 1.5;
      color: var(--ca-muted);
    }
    .propio__acciones {
      display: flex;
      flex-wrap: wrap;
      gap: 0.4rem;
    }
    ion-button {
      margin: 0;
      text-transform: none;
    }
  `,
})
export class AccionesAutorComponent {
  private readonly servicio = inject(MiReporteService);
  private readonly alertCtrl = inject(AlertController);
  private readonly toastCtrl = inject(ToastController);

  readonly reporte = input.required<Report>();
  readonly alCambiar = input<((reporte: Report) => void) | null>(null);

  protected readonly guardando = signal(false);
  protected readonly visible = computed(() => this.servicio.puedeModificar(this.reporte()));

  async pedirEdicion(): Promise<void> {
    const alerta = await this.alertCtrl.create({
      header: 'Corregir descripción',
      inputs: [
        {
          name: 'descripcion',
          type: 'textarea',
          value: this.reporte().descripcion,
          attributes: { maxlength: DESCRIPCION_MAX, rows: 5 },
        },
      ],
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Guardar',
          handler: (datos: { descripcion?: string }) => {
            const texto = datos.descripcion ?? '';
            if (problemaDescripcion(texto) !== null) {
              void this.toast(`Usa entre ${DESCRIPCION_MIN} y ${DESCRIPCION_MAX} caracteres.`, 'danger');
              return false;
            }
            void this.aplicar(() => this.servicio.editarDescripcion(this.reporte(), texto), 'Descripción corregida.');
            return true;
          },
        },
      ],
    });
    await alerta.present();
  }

  async pedirRetiro(): Promise<void> {
    const alerta = await this.alertCtrl.create({
      header: '¿Retirar el reporte?',
      message: 'Quedará cerrado y el organismo verá que lo retiraste. No se puede deshacer.',
      inputs: [
        {
          name: 'motivo',
          type: 'textarea',
          placeholder: 'Motivo (opcional): ya se arregló, me equivoqué de lugar…',
          attributes: { maxlength: MOTIVO_RETIRO_MAXIMO },
        },
      ],
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Retirar',
          role: 'destructive',
          handler: (datos: { motivo?: string }) => {
            void this.aplicar(() => this.servicio.retirar(this.reporte(), datos.motivo ?? ''), 'Reporte retirado.');
            return true;
          },
        },
      ],
    });
    await alerta.present();
  }

  async aplicar(cambio: () => Promise<Report>, exito: string): Promise<void> {
    if (this.guardando()) return;
    this.guardando.set(true);
    try {
      const actualizado = await cambio();
      this.alCambiar()?.(actualizado);
      await this.toast(exito, 'success');
    } catch (error) {
      await this.toast(error instanceof MiReporteError ? error.message : 'No se pudo guardar el cambio.', 'danger');
    } finally {
      this.guardando.set(false);
    }
  }

  private async toast(message: string, color: 'success' | 'danger'): Promise<void> {
    const toast = await this.toastCtrl.create({ message, duration: 3000, color, position: 'bottom' });
    await toast.present();
  }

  constructor() {
    addIcons({ closeCircleOutline, createOutline });
  }
}
