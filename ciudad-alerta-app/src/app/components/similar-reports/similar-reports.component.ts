import { Component, inject, input, output, signal } from '@angular/core';
import { IonBadge, IonButton, IonIcon, ToastController } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { checkmarkCircleOutline, warningOutline } from 'ionicons/icons';

import { ConfirmationError, ConfirmationService } from '../../services/confirmation.service';
import { MatchCandidate } from '../../models/report.model';

/**
 * Muestra los reportes cercanos detectados y permite confirmarlos.
 *
 * Es informativo: nunca bloquea ni descarta el reporte que el usuario está
 * creando. Si decide que su situación es distinta, simplemente continúa.
 */
@Component({
  selector: 'app-similar-reports',
  standalone: true,
  imports: [IonButton, IonIcon, IonBadge],
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

  readonly confirmando = signal<string | null>(null);
  readonly yaConfirmados = signal<string[]>([]);

  constructor() {
    addIcons({ checkmarkCircleOutline, warningOutline });
  }

  yaConfirmo(reportId: string): boolean {
    return this.yaConfirmados().includes(reportId);
  }

  async confirmar(candidato: MatchCandidate): Promise<void> {
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
