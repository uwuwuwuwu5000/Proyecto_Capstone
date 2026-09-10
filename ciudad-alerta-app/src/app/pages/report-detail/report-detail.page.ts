import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import {
  AlertController,
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
import {
  businessOutline,
  checkmarkCircleOutline,
  imageOutline,
  peopleOutline,
} from 'ionicons/icons';

import { MapViewComponent } from '../../components/map-view/map-view.component';
import { ConfirmationError, ConfirmationService } from '../../services/confirmation.service';
import { ReportQueryService } from '../../services/report-query.service';
import { ReportService } from '../../services/report.service';
import { RoutingError, RoutingService } from '../../services/routing.service';
import { AuthService } from '../../services/auth.service';
import {
  COLORES_ESTADO,
  ETIQUETAS_ESTADO,
  Report,
  ReportStatus,
  StatusChange,
} from '../../models/report.model';

/** HU-26 · Detalle completo de una incidencia, con confirmación y trazabilidad. */
@Component({
  selector: 'app-report-detail',
  standalone: true,
  templateUrl: './report-detail.page.html',
  styleUrls: ['./report-detail.page.scss'],
  imports: [
    MapViewComponent,
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
export class ReportDetailPage implements OnInit {
  private readonly queryService = inject(ReportQueryService);
  private readonly reportService = inject(ReportService);
  private readonly confirmationService = inject(ConfirmationService);
  private readonly routingService = inject(RoutingService);
  private readonly authService = inject(AuthService);
  private readonly toastCtrl = inject(ToastController);
  private readonly alertCtrl = inject(AlertController);

  /** Id recibido desde la ruta `/report/:id` con withComponentInputBinding. */
  readonly id = input<string>('');

  readonly etiquetas = ETIQUETAS_ESTADO;
  readonly colores = COLORES_ESTADO;

  readonly reporte = signal<Report | null>(null);
  readonly cargando = signal(true);
  readonly noEncontrado = signal(false);

  readonly fotoUrl = signal<string | null>(null);
  readonly fotoError = signal(false);
  readonly cargandoFoto = signal(false);

  readonly confirmaciones = signal(0);
  readonly yaConfirmo = signal(false);
  readonly confirmando = signal(false);

  readonly historial = signal<StatusChange[]>([]);
  readonly puedeGestionar = signal(false);

  readonly esAutor = computed(
    () => this.reporte()?.uid === this.authService.user?.uid,
  );

  readonly transiciones = computed<ReadonlyArray<ReportStatus>>(() => {
    const reporte = this.reporte();
    return reporte ? this.routingService.transicionesDisponibles(reporte.estado) : [];
  });

  constructor() {
    addIcons({ businessOutline, checkmarkCircleOutline, imageOutline, peopleOutline });
  }

  async ngOnInit(): Promise<void> {
    await this.cargar();
  }

  fechaLegible(reporte: Report): string {
    return this.queryService.formatearFecha(reporte.createdAt);
  }

  /** La fotografía se descarga solo cuando el usuario la pide (HU-26). */
  async verFotografia(): Promise<void> {
    const reporte = this.reporte();

    if (!reporte?.foto || this.fotoUrl()) {
      return;
    }

    this.cargandoFoto.set(true);

    try {
      this.fotoUrl.set(await this.reportService.resolvePhotoUrl(reporte));
      this.fotoError.set(false);
    } catch {
      this.fotoError.set(true);
    } finally {
      this.cargandoFoto.set(false);
    }
  }

  async confirmar(): Promise<void> {
    const reporte = this.reporte();

    if (!reporte) {
      return;
    }

    this.confirmando.set(true);

    try {
      await this.confirmationService.confirm(reporte.id);
      this.yaConfirmo.set(true);
      this.confirmaciones.update((total) => total + 1);
      await this.toast('Confirmación registrada. Gracias por validar.', 'success');
    } catch (error) {
      if (error instanceof ConfirmationError && error.code === 'duplicada') {
        this.yaConfirmo.set(true);
      }

      const mensaje =
        error instanceof ConfirmationError
          ? error.message
          : 'No pudimos registrar tu confirmación.';
      await this.toast(mensaje, 'warning');
    } finally {
      this.confirmando.set(false);
    }
  }

  /** HU-28 · Cambio de estado, disponible solo para roles de gestión. */
  async cambiarEstado(nuevoEstado: ReportStatus): Promise<void> {
    const reporte = this.reporte();

    if (!reporte) {
      return;
    }

    const alert = await this.alertCtrl.create({
      header: `Marcar como "${ETIQUETAS_ESTADO[nuevoEstado]}"`,
      inputs: [
        {
          name: 'comentario',
          type: 'textarea',
          placeholder: 'Comentario para el historial (opcional)',
        },
      ],
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Confirmar',
          role: 'confirm',
          handler: (datos: { comentario: string }) => {
            void this.aplicarCambio(nuevoEstado, datos.comentario ?? '');
            return true;
          },
        },
      ],
    });

    await alert.present();
  }

  private async aplicarCambio(nuevoEstado: ReportStatus, comentario: string): Promise<void> {
    const reporte = this.reporte();

    if (!reporte) {
      return;
    }

    try {
      await this.routingService.changeStatus(reporte, nuevoEstado, comentario);
      this.reporte.set({ ...reporte, estado: nuevoEstado });
      this.historial.set(await this.routingService.getStatusHistory(reporte.id));
      await this.toast('Estado actualizado.', 'success');
    } catch (error) {
      const mensaje =
        error instanceof RoutingError
          ? error.message
          : 'No se pudo actualizar el estado.';
      await this.toast(mensaje, 'danger');
    }
  }

  private async cargar(): Promise<void> {
    this.cargando.set(true);

    try {
      const reporte = await this.queryService.getById(this.id());

      if (!reporte) {
        this.noEncontrado.set(true);
        return;
      }

      this.reporte.set(reporte);

      const [total, confirmado, historial, perfil] = await Promise.all([
        this.confirmationService.countConfirmations(reporte.id),
        this.confirmationService.hasConfirmed(reporte.id),
        this.routingService.getStatusHistory(reporte.id),
        this.authService.user
          ? this.authService.getUserProfile(this.authService.user.uid)
          : Promise.resolve(null),
      ]);

      this.confirmaciones.set(total);
      this.yaConfirmo.set(confirmado);
      this.historial.set(historial);
      this.puedeGestionar.set(perfil?.role === 'operador' || perfil?.role === 'admin');
    } catch {
      this.noEncontrado.set(true);
    } finally {
      this.cargando.set(false);
    }
  }

  private async toast(
    message: string,
    color: 'success' | 'warning' | 'danger',
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
