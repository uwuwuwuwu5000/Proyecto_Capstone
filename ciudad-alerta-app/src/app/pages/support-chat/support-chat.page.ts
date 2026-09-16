import {
  Component,
  ElementRef,
  OnDestroy,
  computed,
  effect,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import {
  AlertController,
  IonBackButton,
  IonBadge,
  IonButton,
  IonButtons,
  IonContent,
  IonFooter,
  IonHeader,
  IonIcon,
  IonTextarea,
  IonTitle,
  IonToolbar,
  ToastController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { ellipsisVertical, sendOutline } from 'ionicons/icons';

import { AuthService } from '../../services/auth.service';
import { SupportError, SupportService } from '../../services/support.service';
import {
  COLORES_ESTADO_TICKET,
  ETIQUETAS_ESTADO_TICKET,
  ETIQUETAS_TIPO,
  EstadoTicket,
  MENSAJE_MAX,
  SupportMessage,
  SupportTicket,
} from '../../models/support.model';

/**
 * Conversación de soporte. La usan tanto el ciudadano como el equipo de
 * soporte: el rol determina qué acciones aparecen y de qué lado se alinean los
 * mensajes, pero el hilo es el mismo.
 */
@Component({
  selector: 'app-support-chat',
  standalone: true,
  templateUrl: './support-chat.page.html',
  styleUrls: ['./support-chat.page.scss'],
  imports: [
    FormsModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonBackButton,
    IonContent,
    IonFooter,
    IonTextarea,
    IonButton,
    IonIcon,
    IonBadge,
  ],
})
export class SupportChatPage implements OnDestroy {
  private readonly supportService = inject(SupportService);
  private readonly authService = inject(AuthService);
  private readonly toastCtrl = inject(ToastController);
  private readonly alertCtrl = inject(AlertController);

  readonly id = input<string>('');

  readonly etiquetasTipo = ETIQUETAS_TIPO;
  readonly etiquetasEstado = ETIQUETAS_ESTADO_TICKET;
  readonly colores = COLORES_ESTADO_TICKET;
  readonly mensajeMax = MENSAJE_MAX;

  readonly ticket = signal<SupportTicket | null>(null);
  readonly mensajes = signal<SupportMessage[]>([]);
  readonly estado = signal<'cargando' | 'listo' | 'no_encontrado' | 'error'>('cargando');
  readonly esStaff = signal(false);
  readonly enviando = signal(false);

  borrador = '';

  private readonly contenido = viewChild<IonContent>(IonContent);
  private suscripcion: Subscription | null = null;

  /** El ciudadano no puede escribir en un ticket cerrado; el staff sí. */
  readonly puedeEscribir = computed(() => {
    const actual = this.ticket();

    if (!actual) {
      return false;
    }

    return this.esStaff() || actual.estado !== 'cerrado';
  });

  readonly transiciones = computed<ReadonlyArray<EstadoTicket>>(() => {
    const actual = this.ticket();
    return actual ? this.supportService.transicionesDisponibles(actual.estado) : [];
  });

  constructor() {
    addIcons({ ellipsisVertical, sendOutline });

    effect(() => {
      const identificador = this.id();

      if (identificador) {
        void this.cargar(identificador);
      }
    });
  }

  ngOnDestroy(): void {
    this.suscripcion?.unsubscribe();
  }

  esPropio(mensaje: SupportMessage): boolean {
    return mensaje.autorUid === this.authService.user?.uid;
  }

  fecha(mensaje: SupportMessage): string {
    return this.supportService.formatearFecha(mensaje.createdAt);
  }

  async enviar(): Promise<void> {
    const texto = this.borrador.trim();

    if (!texto || this.enviando() || !this.ticket()) {
      return;
    }

    this.enviando.set(true);
    const respaldo = this.borrador;
    this.borrador = '';

    try {
      await this.supportService.enviarMensaje(
        this.id(),
        texto,
        this.esStaff() ? 'staff' : 'ciudadano',
      );

      // El estado del ticket puede haber cambiado al responder el staff.
      this.ticket.set(await this.supportService.obtenerTicket(this.id()));
    } catch (error) {
      // Se devuelve el texto al campo para que el usuario no lo pierda.
      this.borrador = respaldo;

      const mensaje =
        error instanceof SupportError
          ? error.message
          : 'No pudimos enviar tu mensaje.';
      await this.toast(mensaje, 'danger');
    } finally {
      this.enviando.set(false);
    }
  }

  /** Cambio de estado del ticket, disponible solo para el equipo de soporte. */
  async cambiarEstado(nuevoEstado: EstadoTicket): Promise<void> {
    const actual = this.ticket();

    if (!actual) {
      return;
    }

    const alert = await this.alertCtrl.create({
      header: `Marcar como "${ETIQUETAS_ESTADO_TICKET[nuevoEstado]}"`,
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Confirmar',
          role: 'confirm',
          handler: () => {
            void this.aplicarEstado(actual, nuevoEstado);
            return true;
          },
        },
      ],
    });

    await alert.present();
  }

  private async aplicarEstado(
    actual: SupportTicket,
    nuevoEstado: EstadoTicket,
  ): Promise<void> {
    try {
      await this.supportService.cambiarEstado(actual, nuevoEstado);
      this.ticket.set({ ...actual, estado: nuevoEstado });
      await this.toast('Estado actualizado.', 'success');
    } catch (error) {
      const mensaje =
        error instanceof SupportError ? error.message : 'No se pudo actualizar el estado.';
      await this.toast(mensaje, 'danger');
    }
  }

  private async cargar(ticketId: string): Promise<void> {
    this.estado.set('cargando');
    this.mensajes.set([]);
    this.suscripcion?.unsubscribe();

    const usuario = this.authService.user;

    if (usuario) {
      const perfil = await this.authService.getUserProfile(usuario.uid).catch(() => null);
      this.esStaff.set(perfil?.role === 'operador' || perfil?.role === 'admin');
    }

    try {
      const ticket = await this.supportService.obtenerTicket(ticketId);

      if (!ticket) {
        this.estado.set('no_encontrado');
        return;
      }

      this.ticket.set(ticket);
      this.estado.set('listo');
    } catch {
      this.estado.set('error');
      return;
    }

    this.suscripcion = this.supportService.escucharMensajes(ticketId).subscribe({
      next: (mensajes) => {
        this.mensajes.set(mensajes);
        setTimeout(() => void this.contenido()?.scrollToBottom(200), 80);
      },
      error: () => this.estado.set('error'),
    });
  }

  private async toast(
    message: string,
    color: 'success' | 'danger',
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
