import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { AlertController, IonButton, IonIcon, IonSpinner, ToastController } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { checkmarkCircleOutline, closeCircleOutline } from 'ionicons/icons';
import { MOTIVO_VEREDICTO_MAXIMO, PARAMETROS_CONFIANZA, motivoDeVeredicto, validacionCompleta } from '@ciudad-alerta/comun';

import { Report } from '../../../../models/report.model';
import { PermisoVeredicto, Veredicto, VeredictoError, VeredictoService } from '../../datos/veredicto.service';

/**
 * Veredicto del reporte: «Es real» o «Es falso».
 *
 * Llena la ranura `detalle-reporte.gestion`, bajo el cambio de estado, y solo
 * lo ve quien gestiona el reporte. Cambia los puntos de confianza del autor
 * (+10 o −15) y le llega un aviso. No se puede deshacer, así que pide
 * confirmación; si es falso, también el motivo, que el autor verá.
 */
@Component({
  selector: 'app-veredicto-reporte',
  standalone: true,
  imports: [IonButton, IonIcon, IonSpinner],
  templateUrl: './veredicto-reporte.component.html',
  styleUrls: ['./veredicto-reporte.component.scss'],
})
export class VeredictoReporteComponent {
  private readonly servicio = inject(VeredictoService);
  private readonly alertCtrl = inject(AlertController);
  private readonly toastCtrl = inject(ToastController);

  readonly reporte = input.required<Report>();
  /** El detalle lo pasa para mostrar el reporte actualizado. */
  readonly alCambiar = input<((reporte: Report) => void) | null>(null);

  /** null mientras se lee el perfil. */
  protected readonly permiso = signal<PermisoVeredicto | null>(null);
  protected readonly guardando = signal<Veredicto | null>(null);

  protected readonly veredicto = computed(() => validacionCompleta(this.reporte().validacion).veredicto);
  protected readonly motivo = computed(() => this.reporte().validacion?.veredictoComentario ?? null);
  protected readonly puntos = computed(() => {
    const v = this.reporte().validacion;
    if (typeof v?.veredictoPuntos === 'number') return v.veredictoPuntos;
    return v?.veredicto === 'real' ? PARAMETROS_CONFIANZA.puntosPorReporteReal : PARAMETROS_CONFIANZA.puntosPorReporteFalso;
  });

  protected readonly real = PARAMETROS_CONFIANZA.puntosPorReporteReal;
  protected readonly falso = -PARAMETROS_CONFIANZA.puntosPorReporteFalso;

  private evaluadoPara: string | null = null;

  constructor() {
    addIcons({ checkmarkCircleOutline, closeCircleOutline });

    effect(() => {
      const reporte = this.reporte();

      if (reporte.id === this.evaluadoPara) {
        return;
      }

      this.evaluadoPara = reporte.id;
      this.permiso.set(null);
      void this.servicio
        .permiso(reporte)
        .then((permiso) => {
          if (this.evaluadoPara === reporte.id) this.permiso.set(permiso);
        })
        .catch(() => this.permiso.set({ gestiona: false, puede: false, motivo: null }));
    });
  }

  /** Texto de los PC que movió el veredicto: «+10 PC», «−15 PC» o «sin cambio de PC». */
  protected textoPuntos(puntos: number): string {
    if (puntos > 0) return `+${puntos} PC`;
    if (puntos < 0) return `−${-puntos} PC`;
    return 'sin cambio de PC';
  }

  async pedir(veredicto: Veredicto): Promise<void> {
    const esReal = veredicto === 'real';
    const alerta = await this.alertCtrl.create({
      header: esReal ? '¿El reporte es real?' : '¿El reporte es falso?',
      message: esReal
        ? `El autor sumará ${this.real} puntos de confianza y recibirá un aviso. No se puede deshacer.`
        : `El autor perderá ${this.falso} puntos de confianza y verá el motivo en su aviso. No se puede deshacer.`,
      inputs: [
        {
          name: 'comentario',
          type: 'textarea',
          placeholder: esReal ? 'Comentario para el autor (opcional)' : 'Motivo (obligatorio)',
          attributes: { maxlength: MOTIVO_VEREDICTO_MAXIMO },
        },
      ],
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: esReal ? 'Es real' : 'Es falso',
          role: 'confirm',
          handler: (datos: { comentario?: string }) => {
            const { error } = motivoDeVeredicto(veredicto, datos.comentario);
            if (error) {
              void this.toast(error, 'danger');
              // false deja el diálogo abierto para que escriba el motivo.
              return false;
            }
            void this.aplicar(veredicto, datos.comentario ?? '');
            return true;
          },
        },
      ],
    });

    await alerta.present();
  }

  async aplicar(veredicto: Veredicto, comentario: string): Promise<void> {
    if (this.guardando() !== null) {
      return;
    }

    this.guardando.set(veredicto);

    try {
      const actualizado = await this.servicio.dar(this.reporte(), veredicto, comentario);
      this.permiso.update((p) => (p ? { ...p, puede: false } : p));
      this.alCambiar()?.(actualizado);
      await this.toast('Veredicto registrado. El autor recibirá un aviso.', 'success');
    } catch (error) {
      await this.toast(
        error instanceof VeredictoError ? error.message : 'No se pudo registrar el veredicto.',
        'danger',
      );
    } finally {
      this.guardando.set(null);
    }
  }

  private async toast(message: string, color: 'success' | 'danger'): Promise<void> {
    const toast = await this.toastCtrl.create({
      message,
      duration: 3500,
      color,
      position: 'bottom',
      buttons: [{ text: 'Cerrar', role: 'cancel' }],
    });
    await toast.present();
  }
}
