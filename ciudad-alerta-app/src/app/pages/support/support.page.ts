import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import {
  IonBackButton,
  IonBadge,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonTitle,
  IonToolbar,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { addCircleOutline, chatbubblesOutline, refreshOutline } from 'ionicons/icons';

import { AuthService } from '../../services/auth.service';
import { SupportService } from '../../services/support.service';
import {
  COLORES_ESTADO_TICKET,
  ETIQUETAS_ESTADO_TICKET,
  ETIQUETAS_TIPO,
  SupportTicket,
} from '../../models/support.model';

/** Listado de las conversaciones de soporte del ciudadano. */
@Component({
  selector: 'app-support',
  standalone: true,
  templateUrl: './support.page.html',
  styleUrls: ['./support.page.scss'],
  imports: [
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonBackButton,
    IonContent,
    IonButton,
    IonIcon,
    IonBadge,
  ],
})
export class SupportPage {
  private readonly supportService = inject(SupportService);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  readonly etiquetasTipo = ETIQUETAS_TIPO;
  readonly etiquetasEstado = ETIQUETAS_ESTADO_TICKET;
  readonly colores = COLORES_ESTADO_TICKET;

  readonly tickets = signal<SupportTicket[]>([]);
  readonly estado = signal<'cargando' | 'listo' | 'error'>('cargando');

  private uidCargado: string | null = null;

  constructor() {
    addIcons({ addCircleOutline, chatbubblesOutline, refreshOutline });
  }

  async ionViewWillEnter(): Promise<void> {
    const uidActual = this.authService.user?.uid ?? null;

    if (uidActual !== this.uidCargado) {
      this.tickets.set([]);
      this.uidCargado = uidActual;
    }

    await this.cargar();
  }

  async cargar(): Promise<void> {
    this.estado.set('cargando');

    try {
      this.tickets.set(await this.supportService.misTickets());
      this.estado.set('listo');
    } catch {
      this.estado.set('error');
    }
  }

  fecha(ticket: SupportTicket): string {
    return this.supportService.formatearFecha(ticket.lastMessageAt);
  }

  abrir(ticketId: string): void {
    void this.router.navigate(['/support', ticketId]);
  }

  nuevo(): void {
    void this.router.navigateByUrl('/support-new');
  }
}
