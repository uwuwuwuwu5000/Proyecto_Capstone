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

import { ConfirmationService } from '../../services/confirmation.service';
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
  private readonly confirmationService = inject(ConfirmationService);
  private readonly toastCtrl = inject(ToastController);
  private readonly router = inject(Router);

  readonly etiquetas = ETIQUETAS_ESTADO;
  readonly colores = COLORES_ESTADO;

  readonly reportes = signal<Report[]>([]);
  /**
   * BUG 9 · El campo `confirmaciones` del documento nunca se incrementa, así que
   * el conteo real se consulta aparte para cada página de resultados.
   */
  readonly confirmaciones = signal<Map<string, number>>(new Map());
  readonly cargando = signal(false);
  readonly hayMas = signal(false);

  private cursor: QueryDocumentSnapshot | null = null;

  constructor() {
    addIcons({ addCircleOutline, documentTextOutline });
  }

  async ionViewWillEnter(): Promise<void> {
    this.reportes.set([]);
    this.confirmaciones.set(new Map());
    this.cursor = null;
    await this.cargarPagina();
  }

  fechaLegible(reporte: Report): string {
    return this.queryService.formatearFecha(reporte.createdAt);
  }

  /** Devuelve null cuando el conteo todavía no llegó o no se pudo obtener. */
  confirmacionesDe(reportId: string): number | null {
    return this.confirmaciones().get(reportId) ?? null;
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

  private async cargarConfirmaciones(reportIds: string[]): Promise<void> {
    if (reportIds.length === 0) {
      return;
    }

    try {
      const totales = await this.confirmationService.countMany(reportIds);
      this.confirmaciones.update((actuales) => new Map([...actuales, ...totales]));
    } catch {
      // Sin conteo, la tarjeta simplemente no lo muestra.
    }
  }

  private async cargarPagina(): Promise<void> {
    this.cargando.set(true);

    try {
      const pagina = await this.queryService.getMyReports(10, this.cursor);
      this.reportes.update((actuales) => [...actuales, ...pagina.reportes]);
      this.cursor = pagina.cursor;
      this.hayMas.set(pagina.cursor !== null);

      // El conteo llega después para no retrasar la aparición del listado.
      void this.cargarConfirmaciones(pagina.reportes.map((r) => r.id));
    } catch (error) {
      // BUG 45 · Distinguir falta de permisos de un problema de red.
      const mensaje =
        error instanceof Error && error.message.includes('permission')
          ? 'No tienes permisos para ver estos reportes. Vuelve a iniciar sesión.'
          : 'No pudimos cargar tu historial. Revisa tu conexión e inténtalo otra vez.';

      const toast = await this.toastCtrl.create({
        message: mensaje,
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
