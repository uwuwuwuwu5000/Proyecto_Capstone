import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonTitle,
  IonToolbar,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { checkmarkDoneOutline, notificationsOffOutline } from 'ionicons/icons';

import { AvisosService } from '../../datos/avisos.service';
import { HistorialService } from '../../../../services/historial.service';
import { Aviso } from '../../modelo/aviso.model';
import { ETIQUETAS_ESTADO } from '../../../../models/report.model';

/** Lista de avisos de cambios de estado en los reportes del ciudadano. */
@Component({
  selector: 'app-avisos',
  standalone: true,
  templateUrl: './avisos.page.html',
  styleUrls: ['./avisos.page.scss'],
  imports: [
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonBackButton,
    IonContent,
    IonButton,
    IonIcon,
  ],
})
export class AvisosPage {
  protected readonly avisosService = inject(AvisosService);
  private readonly historialService = inject(HistorialService);
  private readonly router = inject(Router);

  readonly etiquetas = ETIQUETAS_ESTADO;

  constructor() {
    addIcons({ checkmarkDoneOutline, notificationsOffOutline });
  }

  fecha(aviso: Aviso): string {
    return this.historialService.formatear(aviso.fecha);
  }

  /** Abrir un aviso lo marca como visto y lleva al detalle del reporte. */
  async abrir(aviso: Aviso): Promise<void> {
    void this.avisosService.marcarVisto(aviso.id);
    await this.router.navigate(['/report', aviso.reportId]);
  }

  async marcarTodos(): Promise<void> {
    await this.avisosService.marcarTodos();
  }
}
