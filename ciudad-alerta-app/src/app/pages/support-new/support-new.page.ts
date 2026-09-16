import { Component, inject, signal } from '@angular/core';
import {
  NonNullableFormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { Router } from '@angular/router';
import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonInput,
  IonNote,
  IonSegment,
  IonSegmentButton,
  IonTextarea,
  IonTitle,
  IonToolbar,
  LoadingController,
  ToastController,
} from '@ionic/angular';

import { SupportError, SupportService } from '../../services/support.service';
import {
  ASUNTO_MAX,
  ASUNTO_MIN,
  MENSAJE_MAX,
  MENSAJE_MIN,
  TipoTicket,
} from '../../models/support.model';

/**
 * Creación de una conversación con soporte.
 *
 * El primer paso es elegir la naturaleza del contacto —queja o sugerencia—
 * porque determina cómo lo prioriza el equipo: una queja indica algo que no
 * funciona; una sugerencia, una mejora deseable.
 */
@Component({
  selector: 'app-support-new',
  standalone: true,
  templateUrl: './support-new.page.html',
  styleUrls: ['./support-new.page.scss'],
  imports: [
    ReactiveFormsModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonBackButton,
    IonContent,
    IonSegment,
    IonSegmentButton,
    IonInput,
    IonTextarea,
    IonButton,
    IonNote,
  ],
})
export class SupportNewPage {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly supportService = inject(SupportService);
  private readonly router = inject(Router);
  private readonly loadingCtrl = inject(LoadingController);
  private readonly toastCtrl = inject(ToastController);

  readonly asuntoMin = ASUNTO_MIN;
  readonly asuntoMax = ASUNTO_MAX;
  readonly mensajeMin = MENSAJE_MIN;
  readonly mensajeMax = MENSAJE_MAX;

  readonly tipo = signal<TipoTicket>('queja');
  readonly enviando = signal(false);

  readonly formulario = this.fb.group({
    asunto: [
      '',
      [
        Validators.required,
        Validators.minLength(ASUNTO_MIN),
        Validators.maxLength(ASUNTO_MAX),
      ],
    ],
    mensaje: [
      '',
      [
        Validators.required,
        Validators.minLength(MENSAJE_MIN),
        Validators.maxLength(MENSAJE_MAX),
      ],
    ],
  });

  get asuntoControl() {
    return this.formulario.controls.asunto;
  }

  get mensajeControl() {
    return this.formulario.controls.mensaje;
  }

  cambiarTipo(valor: string | number | undefined): void {
    if (valor === 'queja' || valor === 'sugerencia') {
      this.tipo.set(valor);
    }
  }

  textoAyuda(): string {
    return this.tipo() === 'queja'
      ? 'Cuéntanos qué no está funcionando. Si puedes, indica en qué pantalla ocurre y qué esperabas que pasara.'
      : 'Cuéntanos tu idea para mejorar Ciudad Alerta. Toda propuesta se revisa y se considera para las próximas versiones.';
  }

  async enviar(): Promise<void> {
    if (this.enviando()) {
      return;
    }

    if (this.formulario.invalid) {
      this.formulario.markAllAsTouched();
      return;
    }

    this.enviando.set(true);

    const loading = await this.loadingCtrl.create({
      message: 'Abriendo conversación',
      spinner: 'crescent',
      backdropDismiss: false,
    });
    await loading.present();

    try {
      const { asunto, mensaje } = this.formulario.getRawValue();
      const ticketId = await this.supportService.crearTicket(this.tipo(), asunto, mensaje);

      await loading.dismiss();
      this.formulario.reset();

      await this.toast('Conversación abierta. Te responderemos por aquí.', 'success');
      await this.router.navigate(['/support', ticketId], { replaceUrl: true });
    } catch (error) {
      await loading.dismiss();
      const mensaje =
        error instanceof SupportError
          ? error.message
          : 'No pudimos abrir la conversación. Intenta nuevamente.';
      await this.toast(mensaje, 'danger');
    } finally {
      this.enviando.set(false);
    }
  }

  private async toast(
    message: string,
    color: 'success' | 'danger',
  ): Promise<void> {
    const toast = await this.toastCtrl.create({
      message,
      duration: 3200,
      color,
      position: 'bottom',
      buttons: [{ text: 'Cerrar', role: 'cancel' }],
    });
    await toast.present();
  }
}
