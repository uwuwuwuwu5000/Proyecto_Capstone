import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { Location } from '@angular/common';
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
  refreshOutline,
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
export class ReportDetailPage {
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

  /** null significa "no se pudo contar", distinto de cero confirmaciones. */
  readonly confirmaciones = signal<number | null>(null);
  /** null = no se pudo comprobar si este usuario ya confirmó. */
  readonly yaConfirmo = signal<boolean | null>(false);
  readonly confirmando = signal(false);

  /** null = el historial no se pudo leer, distinto de no tener movimientos. */
  readonly historial = signal<StatusChange[] | null>([]);
  readonly puedeGestionar = signal(false);

  readonly esAutor = computed(
    () => this.reporte()?.uid === this.authService.user?.uid,
  );

  readonly transiciones = computed<ReadonlyArray<ReportStatus>>(() => {
    const reporte = this.reporte();
    return reporte ? this.routingService.transicionesDisponibles(reporte.estado) : [];
  });

  constructor() {
    addIcons({
      businessOutline,
      checkmarkCircleOutline,
      imageOutline,
      peopleOutline,
      refreshOutline,
    });

    /**
     * BUG 39 · Al navegar de un detalle a otro, el router reutiliza la instancia
     * del componente y `ngOnInit` no se vuelve a ejecutar. Un effect sobre el
     * input garantiza la recarga cada vez que cambia el identificador.
     */
    effect(() => {
      const identificador = this.id();

      if (identificador) {
        void this.cargar(identificador);
      }
    });
  }

  fechaLegible(reporte: Report): string {
    return this.queryService.formatearFecha(reporte.createdAt);
  }

  /** La fotografía se descarga solo cuando el usuario la pide (HU-26). */
  async verFotografia(): Promise<void> {
    const reporte = this.reporte();

    if (!reporte?.foto || this.cargandoFoto()) {
      return;
    }

    this.cargandoFoto.set(true);
    this.fotoError.set(false);

    try {
      this.fotoUrl.set(await this.reportService.resolvePhotoUrl(reporte));
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
      this.confirmaciones.update((total) => (total === null ? null : total + 1));
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

  /**
   * BUG 13 · La carga del reporte y la de los datos complementarios están
   * separadas a propósito. Antes viajaban en un mismo `Promise.all`, y un fallo
   * al leer el perfil del usuario hacía que la pantalla informara "no
   * encontrado" sobre un reporte que sí existía.
   */
  private async cargar(reportId: string): Promise<void> {
    this.reiniciarEstado();

    let reporte: Report | null;

    try {
      reporte = await this.queryService.getById(reportId);
    } catch {
      this.cargando.set(false);
      this.noEncontrado.set(true);
      return;
    }

    if (!reporte) {
      this.cargando.set(false);
      this.noEncontrado.set(true);
      return;
    }

    this.reporte.set(reporte);
    this.cargando.set(false);

    // Datos complementarios: cada uno falla por su cuenta sin afectar la vista.
    void this.confirmationService
      .countConfirmations(reporte.id)
      .then((total) => this.confirmaciones.set(total))
      .catch(() => this.confirmaciones.set(null));

    void this.confirmationService
      .hasConfirmed(reporte.id)
      .then((confirmado) => this.yaConfirmo.set(confirmado))
      .catch(() => this.yaConfirmo.set(null));

    void this.routingService
      .getStatusHistory(reporte.id)
      .then((historial) => this.historial.set(historial))
      .catch(() => this.historial.set(null));

    const usuario = this.authService.user;

    if (usuario) {
      void this.authService
        .getUserProfile(usuario.uid)
        .then((perfil) =>
          this.puedeGestionar.set(perfil?.role === 'operador' || perfil?.role === 'admin'),
        )
        .catch(() => this.puedeGestionar.set(false));
    }
  }

  private reiniciarEstado(): void {
    this.cargando.set(true);
    this.noEncontrado.set(false);
    this.reporte.set(null);
    this.fotoUrl.set(null);
    this.fotoError.set(false);
    this.cargandoFoto.set(false);
    this.confirmaciones.set(null);
    this.yaConfirmo.set(false);
    this.historial.set([]);
    this.puedeGestionar.set(false);
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
