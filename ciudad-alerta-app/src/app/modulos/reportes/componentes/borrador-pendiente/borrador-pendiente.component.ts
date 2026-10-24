import { Component, computed, inject, input } from '@angular/core';
import { AlertController, IonButton, IonIcon, IonSpinner } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { cloudOfflineOutline, cloudUploadOutline } from 'ionicons/icons';

import { etiquetaCategoria } from '../../../../models/report.model';
import { UserProfile } from '../../../../models/user-profile.model';
import { BorradorService } from '../../datos/borrador.service';

/**
 * 1.0 · «Reporte por enviar» en el inicio (ranura `inicio.resumen`): el
 * reporte que se guardó sin señal, cómo va y qué hacer con él. Se envía solo
 * al volver la conexión; aquí también se puede enviar a mano o descartar.
 */
@Component({
  selector: 'app-borrador-pendiente',
  standalone: true,
  imports: [IonButton, IonIcon, IonSpinner],
  template: `
    @if (servicio.pendiente(); as borrador) {
      <section class="borrador" aria-labelledby="titulo-borrador">
        <ion-icon class="borrador__icono" [name]="icono()" aria-hidden="true"></ion-icon>
        <div class="borrador__cuerpo">
          <strong id="titulo-borrador">Reporte por enviar</strong>
          <span class="borrador__detalle">{{ categoria() }} · {{ resumen() }}</span>
          <span class="borrador__nota" role="status">{{ estado() }}</span>
          <div class="borrador__acciones">
            <ion-button
              size="small"
              fill="outline"
              [disabled]="servicio.enviando() || !servicio.enLinea()"
              (click)="enviar()"
            >
              @if (servicio.enviando()) {
                <ion-spinner name="crescent" slot="start"></ion-spinner>
                Enviando…
              } @else {
                Enviar ahora
              }
            </ion-button>
            <ion-button size="small" fill="clear" color="danger" [disabled]="servicio.enviando()" (click)="descartar()">
              Descartar
            </ion-button>
          </div>
        </div>
      </section>
    }
  `,
  styles: `
    :host {
      display: block;
    }
    .borrador {
      display: flex;
      gap: 0.75rem;
      padding: 0.8rem 0.9rem;
      border: 1px solid var(--ca-signal);
      border-radius: 12px;
      background: var(--ca-surface);
      color: var(--ca-ink);
    }
    .borrador__icono {
      font-size: 1.6rem;
      color: var(--ca-signal);
      flex-shrink: 0;
    }
    .borrador__cuerpo {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 0.2rem;
      font-size: 0.92rem;
    }
    .borrador__detalle {
      font-size: 0.82rem;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .borrador__nota {
      font-size: 0.78rem;
      line-height: 1.35;
      color: var(--ca-muted);
    }
    .borrador__acciones {
      display: flex;
      flex-wrap: wrap;
      gap: 0.3rem;
      margin-top: 0.3rem;
    }
    ion-button {
      margin: 0;
      text-transform: none;
    }
  `,
})
export class BorradorPendienteComponent {
  protected readonly servicio = inject(BorradorService);
  private readonly alertCtrl = inject(AlertController);

  /** Entrada de la ranura. No se usa: el borrador ya es de la sesión actual. */
  readonly perfil = input<UserProfile | null>(null);

  protected readonly categoria = computed(() => {
    const borrador = this.servicio.pendiente();
    return borrador ? etiquetaCategoria(borrador.categoria) : '';
  });

  protected readonly resumen = computed(() => {
    const texto = this.servicio.pendiente()?.descripcion ?? '';
    return texto.length > 60 ? `${texto.slice(0, 57)}…` : texto;
  });

  protected readonly icono = computed(() => (this.servicio.enLinea() ? 'cloud-upload-outline' : 'cloud-offline-outline'));

  protected readonly estado = computed(() => {
    const borrador = this.servicio.pendiente();
    if (!borrador) return '';
    if (this.servicio.enviando()) return 'Enviando…';
    const error = this.servicio.error();
    if (error) return `No se envió: ${error}`;
    const fecha = new Date(borrador.guardadoAt);
    const cuando = `${fecha.toLocaleDateString('es-CL', { day: 'numeric', month: 'long' })} a las ${fecha.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })}`;
    const foto = borrador.foto && !borrador.foto.privacidad ? ' La foto se protegerá antes de subirla.' : '';
    return this.servicio.enLinea()
      ? `Guardado sin señal el ${cuando}.${foto}`
      : `Guardado el ${cuando}. Se enviará solo cuando vuelva la señal.${foto}`;
  });

  constructor() {
    addIcons({ cloudOfflineOutline, cloudUploadOutline });
  }

  async enviar(): Promise<void> {
    await this.servicio.enviar();
  }

  async descartar(): Promise<void> {
    const alerta = await this.alertCtrl.create({
      header: '¿Descartar el reporte?',
      message: 'Se borra de este teléfono y no se enviará.',
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        { text: 'Descartar', role: 'destructive', handler: () => this.servicio.descartar() },
      ],
    });
    await alerta.present();
  }
}
