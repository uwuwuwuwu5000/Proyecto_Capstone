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
import { RUTAS_REPORTES } from '../../../reportes';
import { HistorialService } from '../../../../services/historial.service';
import { Aviso, AvisoVeredicto } from '../../modelo/aviso.model';
import { ETIQUETAS_ESTADO } from '../../../../models/report.model';

/** Lista de avisos de cambios de estado y veredictos en los reportes del ciudadano. */
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

  /** «+10 puntos de confianza», «−15 puntos de confianza» o por qué no cambiaron. */
  textoPuntos(aviso: AvisoVeredicto): string {
    if (aviso.puntos > 0) return `+${aviso.puntos} puntos de confianza`;
    if (aviso.puntos < 0) return `−${-aviso.puntos} puntos de confianza`;
    return aviso.veredicto === 'real'
      ? 'ya tienes el máximo de puntos de confianza'
      : 'tus puntos de confianza ya estaban en 0';
  }

  /** Abrir un aviso lo marca como visto y lleva al detalle del reporte. */
  async abrir(aviso: Aviso): Promise<void> {
    void this.avisosService.marcarVisto(aviso.id);
    await this.router.navigate(RUTAS_REPORTES.detalle(aviso.reportId));
  }

  async marcarTodos(): Promise<void> {
    await this.avisosService.marcarTodos();
  }
}
