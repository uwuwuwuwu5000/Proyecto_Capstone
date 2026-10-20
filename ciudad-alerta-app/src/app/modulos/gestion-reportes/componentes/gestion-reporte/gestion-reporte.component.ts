import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { AlertController, IonButton, IonSpinner, ToastController } from '@ionic/angular';
import { PermisoGestion } from '@ciudad-alerta/comun';

import { ETIQUETAS_ESTADO, Report, ReportStatus } from '../../../../models/report.model';
import { CambioEstadoError, CambioEstadoService } from '../../datos/cambio-estado.service';

/**
 * HU-28 · Bloque «Gestión» del detalle de un reporte.
 *
 * Llena la ranura `detalle-reporte.gestion`. Lo ve solo quien tiene rol de
 * gestión: el responsable del reporte (o un admin) con los botones de cambio
 * de estado; otro operador, con el motivo por el que no puede cambiarlo.
 * Con el módulo de gestión desactivado, el detalle no muestra nada aquí.
 */
@Component({
  selector: 'app-gestion-reporte',
  standalone: true,
  imports: [IonButton, IonSpinner],
  templateUrl: './gestion-reporte.component.html',
  styleUrls: ['./gestion-reporte.component.scss'],
})
export class GestionReporteComponent {
  private readonly cambioEstado = inject(CambioEstadoService);
  private readonly alertCtrl = inject(AlertController);
  private readonly toastCtrl = inject(ToastController);

  readonly reporte = input.required<Report>();
  /** El detalle lo pasa para mostrar el estado nuevo y recargar el seguimiento. */
  readonly alCambiar = input<((reporte: Report) => void) | null>(null);

  protected readonly etiquetas = ETIQUETAS_ESTADO;
  /** null mientras se lee el perfil. */
  protected readonly permiso = signal<PermisoGestion | null>(null);
  protected readonly guardando = signal<ReportStatus | null>(null);

  protected readonly transiciones = computed(() => this.cambioEstado.transiciones(this.reporte().estado));

  /** Permiso evaluado para este id; se reevalúa solo al cambiar de reporte. */
  private evaluadoPara: string | null = null;

  constructor() {
    effect(() => {
      const reporte = this.reporte();

      if (reporte.id === this.evaluadoPara) {
        return;
      }

      this.evaluadoPara = reporte.id;
      this.permiso.set(null);
      void this.cambioEstado
        .permiso(reporte)
        .then((permiso) => {
          if (this.evaluadoPara === reporte.id) this.permiso.set(permiso);
        })
        .catch(() => this.permiso.set({ esGestor: false, puede: false, motivo: null }));
    });
  }

  async pedirCambio(nuevoEstado: ReportStatus): Promise<void> {
    const alerta = await this.alertCtrl.create({
      header: `Marcar como "${ETIQUETAS_ESTADO[nuevoEstado]}"`,
      inputs: [{ name: 'comentario', type: 'textarea', placeholder: 'Comentario para el historial (opcional)' }],
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Confirmar',
          role: 'confirm',
          handler: (datos: { comentario?: string }) => {
            void this.aplicar(nuevoEstado, datos.comentario ?? '');
            return true;
          },
        },
      ],
    });

    await alerta.present();
  }

  async aplicar(nuevoEstado: ReportStatus, comentario: string): Promise<void> {
    if (this.guardando() !== null) {
      return;
    }

    this.guardando.set(nuevoEstado);

    try {
      const actualizado = await this.cambioEstado.cambiar(this.reporte(), nuevoEstado, comentario);
      this.alCambiar()?.(actualizado);
      await this.toast('Estado actualizado.', 'success');
    } catch (error) {
      await this.toast(
        error instanceof CambioEstadoError ? error.message : 'No se pudo actualizar el estado.',
        'danger',
      );
    } finally {
      this.guardando.set(null);
    }
  }

  private async toast(message: string, color: 'success' | 'danger'): Promise<void> {
    const toast = await this.toastCtrl.create({
      message,
      duration: 3000,
      color,
      position: 'bottom',
      buttons: [{ text: 'Cerrar', role: 'cancel' }],
    });
    await toast.present();
  }
}
