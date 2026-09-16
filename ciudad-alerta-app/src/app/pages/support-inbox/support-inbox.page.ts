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
  IonSelect,
  IonSelectOption,
  IonTitle,
  IonToolbar,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { refreshOutline } from 'ionicons/icons';

import { FiltrosBandeja, SupportService } from '../../services/support.service';
import {
  COLORES_ESTADO_TICKET,
  ETIQUETAS_ESTADO_TICKET,
  ETIQUETAS_TIPO,
  EstadoTicket,
  SupportTicket,
  TipoTicket,
} from '../../models/support.model';

/**
 * Bandeja del equipo de soporte: todas las quejas y sugerencias recibidas.
 *
 * La ruta está protegida por `staffGuard`, y las reglas de Firestore permiten
 * leer la colección completa solo a los roles `operador` y `admin`. El guard
 * evita mostrar una pantalla que fallaría; la garantía está en las reglas.
 */
@Component({
  selector: 'app-support-inbox',
  standalone: true,
  templateUrl: './support-inbox.page.html',
  styleUrls: ['./support-inbox.page.scss'],
  imports: [
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonBackButton,
    IonContent,
    IonSelect,
    IonSelectOption,
    IonButton,
    IonIcon,
    IonBadge,
  ],
})
export class SupportInboxPage {
  private readonly supportService = inject(SupportService);
  private readonly router = inject(Router);

  readonly etiquetasTipo = ETIQUETAS_TIPO;
  readonly etiquetasEstado = ETIQUETAS_ESTADO_TICKET;
  readonly colores = COLORES_ESTADO_TICKET;
  readonly tipos = Object.entries(ETIQUETAS_TIPO) as [TipoTicket, string][];
  readonly estados = Object.entries(ETIQUETAS_ESTADO_TICKET) as [EstadoTicket, string][];

  readonly tickets = signal<SupportTicket[]>([]);
  readonly estado = signal<'cargando' | 'listo' | 'error'>('cargando');
  readonly filtros = signal<FiltrosBandeja>({ tipo: 'todos', estado: 'todos' });

  constructor() {
    addIcons({ refreshOutline });
  }

  async ionViewWillEnter(): Promise<void> {
    await this.cargar();
  }

  async cambiarTipo(valor: string | number | undefined): Promise<void> {
    this.filtros.update((actuales) => ({
      ...actuales,
      tipo: (valor ?? 'todos') as TipoTicket | 'todos',
    }));
    await this.cargar();
  }

  async cambiarEstado(valor: string | number | undefined): Promise<void> {
    this.filtros.update((actuales) => ({
      ...actuales,
      estado: (valor ?? 'todos') as EstadoTicket | 'todos',
    }));
    await this.cargar();
  }

  async cargar(): Promise<void> {
    this.estado.set('cargando');

    try {
      this.tickets.set(await this.supportService.bandeja(this.filtros()));
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
}
