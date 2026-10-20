import { Component, effect, inject, input, output, signal } from '@angular/core';
import { IonBadge, IonButton, IonIcon, IonSpinner, ToastController } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { checkmarkCircleOutline, warningOutline } from 'ionicons/icons';

import { formatearDistancia } from '@ciudad-alerta/comun';

import { ConfirmationError, ConfirmationService } from '../../datos/confirmation.service';
import { ETIQUETAS_ESTADO, MatchCandidate } from '../../../../models/report.model';

/**
 * Muestra los reportes cercanos detectados y permite confirmarlos.
 *
 * Es informativo: nunca bloquea ni descarta el reporte que el usuario está
 * creando. Si decide que su situación es distinta, simplemente continúa.
 */
@Component({
  selector: 'app-similar-reports',
  standalone: true,
  imports: [IonButton, IonIcon, IonBadge, IonSpinner],
  templateUrl: './similar-reports.component.html',
  styleUrls: ['./similar-reports.component.scss'],
})
export class SimilarReportsComponent {
  private readonly confirmationService = inject(ConfirmationService);
  private readonly toastCtrl = inject(ToastController);

  readonly candidatos = input.required<MatchCandidate[]>();
  readonly analizando = input(false);

  /** Avisa a la página cuando el usuario confirmó un reporte existente. */
  readonly confirmado = output<string>();

  readonly etiquetas = ETIQUETAS_ESTADO;

  readonly confirmando = signal<string | null>(null);
  readonly yaConfirmados = signal<string[]>([]);

  constructor() {
    addIcons({ checkmarkCircleOutline, warningOutline });

    /**
     * BUG 38 · El componente se reutiliza entre reportes, así que el estado se
     * reinicia con cada conjunto de candidatos.
     *
     * v2-D4 · Además se consulta al servidor qué candidatos ya confirmó este
     * usuario en sesiones anteriores. Antes, el estado vivía solo en memoria y
     * el primer toque de una sesión nueva terminaba en un rechazo por duplicado.
     */
    effect(() => {
      const actuales = this.candidatos();
      this.yaConfirmados.set([]);
      this.confirmando.set(null);

      if (actuales.length > 0) {
        void this.precargarConfirmaciones(actuales);
      }
    });
  }

  yaConfirmo(reportId: string): boolean {
    return this.yaConfirmados().includes(reportId);
  }

  /** Etiqueta legible del estado; antes se mostraba el valor crudo (v2-D2). */
  etiquetaEstado(estado: MatchCandidate['report']['estado']): string {
    return this.etiquetas[estado] ?? estado;
  }

  /** v2-D3 · La distancia es la señal más útil para decidir si es duplicado. */
  formatearDistancia(metros: number): string {
    return `a ${formatearDistancia(metros, { aproximada: true })}`;
  }

  async confirmar(candidato: MatchCandidate): Promise<void> {
    // v2-D5 · Mientras hay una confirmación en curso no se admite otra: antes
    // era posible confirmar dos candidatos a la vez con toques rápidos.
    if (this.confirmando() !== null) {
      return;
    }

    const reportId = candidato.report.id;
    this.confirmando.set(reportId);

    try {
      await this.confirmationService.confirm(reportId);
      this.yaConfirmados.update((actuales) => [...actuales, reportId]);
      await this.toast('Confirmación registrada. Gracias por validar.', 'success');
      this.confirmado.emit(reportId);
    } catch (error) {
      const mensaje =
        error instanceof ConfirmationError
          ? error.message
          : 'No pudimos registrar tu confirmación.';

      if (error instanceof ConfirmationError && error.code === 'duplicada') {
        this.yaConfirmados.update((actuales) => [...actuales, reportId]);
      }

      await this.toast(mensaje, 'warning');
    } finally {
      this.confirmando.set(null);
    }
  }

  private async precargarConfirmaciones(candidatos: MatchCandidate[]): Promise<void> {
    const resultados = await Promise.all(
      candidatos.map(async (candidato) => ({
        id: candidato.report.id,
        confirmado: await this.confirmationService.hasConfirmed(candidato.report.id),
      })),
    );

    const confirmados = resultados
      .filter((resultado) => resultado.confirmado === true)
      .map((resultado) => resultado.id);

    if (confirmados.length > 0) {
      this.yaConfirmados.update((actuales) => [...actuales, ...confirmados]);
    }
  }

  private async toast(
    message: string,
    color: 'success' | 'warning' | 'danger',
  ): Promise<void> {
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
