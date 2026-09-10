import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { QueryDocumentSnapshot } from 'firebase/firestore';
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
  ToastController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { addCircleOutline, documentTextOutline } from 'ionicons/icons';

import { ReportQueryService } from '../../services/report-query.service';
import { COLORES_ESTADO, ETIQUETAS_ESTADO, Report } from '../../models/report.model';

/** HU-27 · Historial paginado de los reportes del usuario. */
@Component({
  selector: 'app-my-reports',
  standalone: true,
  templateUrl: './my-reports.page.html',
  styleUrls: ['./my-reports.page.scss'],
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
export class MyReportsPage {
  private readonly queryService = inject(ReportQueryService);
  private readonly toastCtrl = inject(ToastController);
  private readonly router = inject(Router);

  readonly etiquetas = ETIQUETAS_ESTADO;
  readonly colores = COLORES_ESTADO;

  readonly reportes = signal<Report[]>([]);
  readonly cargando = signal(false);
  readonly hayMas = signal(false);

  private cursor: QueryDocumentSnapshot | null = null;

  constructor() {
    addIcons({ addCircleOutline, documentTextOutline });
  }

  async ionViewWillEnter(): Promise<void> {
    this.reportes.set([]);
    this.cursor = null;
    await this.cargarPagina();
  }

  fechaLegible(reporte: Report): string {
    return this.queryService.formatearFecha(reporte.createdAt);
  }

  abrirDetalle(reportId: string): void {
    void this.router.navigate(['/report', reportId]);
  }

  irACrear(): void {
    void this.router.navigateByUrl('/report-new');
  }

  async cargarMas(): Promise<void> {
    await this.cargarPagina();
  }

  private async cargarPagina(): Promise<void> {
    this.cargando.set(true);

    try {
      const pagina = await this.queryService.getMyReports(10, this.cursor);
      this.reportes.update((actuales) => [...actuales, ...pagina.reportes]);
      this.cursor = pagina.cursor;
      this.hayMas.set(pagina.cursor !== null);
    } catch {
      const toast = await this.toastCtrl.create({
        message: 'No pudimos cargar tu historial de reportes.',
        duration: 3000,
        color: 'warning',
        position: 'bottom',
        buttons: [{ text: 'Cerrar', role: 'cancel' }],
      });
      await toast.present();
    } finally {
      this.cargando.set(false);
    }
  }
}
