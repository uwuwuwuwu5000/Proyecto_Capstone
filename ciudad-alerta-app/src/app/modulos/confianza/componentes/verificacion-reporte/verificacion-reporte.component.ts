import { Component, DestroyRef, computed, effect, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AlertController, IonButton, IonIcon, IonProgressBar, ToastController } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { checkmarkCircleOutline, refreshOutline, shieldCheckmarkOutline } from 'ionicons/icons';

import { Report } from '../../../../models/report.model';
import { ConfianzaError, ConfianzaService, Disponibilidad } from '../../datos/confianza.service';
import { porcentajeDeValidacion, validacionCompleta } from '@ciudad-alerta/comun';

type EstadoBoton = 'cargando' | 'error' | 'listo' | 'enviando';

/**
 * A3 · Barra de verificación de la comunidad y botón de confirmar con peso.
 *
 * Llena la ranura `detalle-reporte.verificacion` del detalle de un reporte.
 * Si el módulo de confianza se desactiva, el detalle vuelve a su bloque de
 * confirmación simple sin cambiar nada.
 */
@Component({
  selector: 'app-verificacion-reporte',
  standalone: true,
  imports: [RouterLink, IonButton, IonIcon, IonProgressBar],
  templateUrl: './verificacion-reporte.component.html',
  styleUrls: ['./verificacion-reporte.component.scss'],
})
export class VerificacionReporteComponent {
  private readonly confianza = inject(ConfianzaService);
  private readonly toastCtrl = inject(ToastController);
  private readonly alertCtrl = inject(AlertController);
  private readonly router = inject(Router);

  readonly reporte = input.required<Report>();
  readonly esAutor = input(false);
  /** El detalle lo pasa para actualizar su copia del reporte tras confirmar. */
  readonly alConfirmar = input<((reporte: Report) => void) | null>(null);

  protected readonly estado = signal<EstadoBoton>('cargando');
  protected readonly disponibilidad = signal<Disponibilidad | null>(null);
  /** Segundos de pausa que faltan, con cuenta regresiva (A4.3). */
  protected readonly segundosPausa = signal(0);

  protected readonly validacion = computed(() => validacionCompleta(this.reporte().validacion));
  protected readonly porcentaje = computed(() => porcentajeDeValidacion(this.reporte().validacion));

  protected readonly horaReinicio = computed(() => {
    const cupo = this.disponibilidad()?.cupo;
    return cupo
      ? new Date(cupo.reinicioMs).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })
      : '';
  });

  private temporizador: ReturnType<typeof setInterval> | null = null;
  private reporteCargado: string | null = null;

  constructor() {
    addIcons({ checkmarkCircleOutline, refreshOutline, shieldCheckmarkOutline });
    inject(DestroyRef).onDestroy(() => this.detenerPausa());

    effect(() => {
      const reporte = this.reporte();

      // Solo al cambiar de reporte: tras confirmar, el detalle entrega una
      // copia nueva del mismo reporte y no hace falta volver a leer.
      if (!this.esAutor() && reporte.id !== this.reporteCargado) {
        this.reporteCargado = reporte.id;
        void this.cargar();
      }
    });
  }

  async cargar(): Promise<void> {
    this.estado.set('cargando');
    this.detenerPausa();

    try {
      const disponibilidad = await this.confianza.disponibilidad(this.reporte());
      this.disponibilidad.set(disponibilidad);
      this.estado.set('listo');

      if (disponibilidad.bloqueo === 'pausa') {
        this.iniciarPausa(disponibilidad.pausaRestanteMs);
      }
    } catch {
      this.estado.set('error');
    }
  }

  async confirmar(): Promise<void> {
    if (this.estado() !== 'listo') return;

    const reporte = this.reporte();
    this.estado.set('enviando');

    try {
      const resultado = await this.confianza.confirmar(reporte.id);

      this.alConfirmar()?.({ ...reporte, validacion: resultado.validacion });
      this.disponibilidad.update((d) =>
        d
          ? {
              ...d,
              bloqueo: 'confirmado',
              pesoAportado: resultado.peso,
              cupo: { ...d.cupo, usadas: d.cupo.usadas + 1, restantes: resultado.restantesHoy },
            }
          : d,
      );
      this.estado.set('listo');

      const mensaje = resultado.recienValidado
        ? 'Con tu confirmación el reporte quedó validado por la comunidad. ¡Gracias!'
        : resultado.peso > 0
          ? `Confirmación registrada: aportaste ${resultado.peso} puntos.`
          : 'Confirmación registrada. Todavía no suma puntos (revisa el detalle abajo).';
      await this.toast(mensaje, 'success');

      if (this.confianza.explicacionPendiente()) {
        await this.ofrecerExplicacion();
      }
    } catch (error) {
      const fallo =
        error instanceof ConfianzaError
          ? error
          : new ConfianzaError('No pudimos registrar tu confirmación.', 'desconocido');

      await this.toast(fallo.message, 'warning');
      // Vuelve a leer: el motivo (límite, pausa, ya confirmado) queda en pantalla.
      await this.cargar();
    }
  }

  /** A11.1 · La primera vez que confirma, se ofrece la explicación. */
  private async ofrecerExplicacion(): Promise<void> {
    const alerta = await this.alertCtrl.create({
      header: '¿Cómo funciona la verificación?',
      message:
        'Cada confirmación suma puntos al reporte según tu nivel. Con 100 puntos y al menos 3 vecinos, el reporte queda «validado por la comunidad». Tu nivel sube cuando un operador confirma que tus propios reportes eran reales.',
      buttons: [
        { text: 'Entendido', role: 'cancel' },
        {
          text: 'Ver mi nivel',
          handler: () => {
            void this.router.navigateByUrl('/mi-nivel');
          },
        },
      ],
    });
    await alerta.present();
  }

  private iniciarPausa(ms: number): void {
    this.segundosPausa.set(Math.ceil(ms / 1000));
    this.temporizador = setInterval(() => {
      const restante = this.segundosPausa() - 1;
      this.segundosPausa.set(Math.max(0, restante));

      if (restante <= 0) {
        this.detenerPausa();
        this.disponibilidad.update((d) => (d ? { ...d, bloqueo: null, pausaRestanteMs: 0 } : d));
      }
    }, 1000);
  }

  private detenerPausa(): void {
    if (this.temporizador !== null) {
      clearInterval(this.temporizador);
      this.temporizador = null;
    }
  }

  private async toast(message: string, color: 'success' | 'warning'): Promise<void> {
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
