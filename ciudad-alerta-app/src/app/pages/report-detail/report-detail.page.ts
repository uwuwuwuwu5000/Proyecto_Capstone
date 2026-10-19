import { Component, computed, effect, inject, input, signal } from '@angular/core';
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
  etiquetaCategoria,
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
  readonly nombreCategoria = etiquetaCategoria;

  readonly reporte = signal<Report | null>(null);
  readonly cargando = signal(true);
  readonly noEncontrado = signal(false);

  readonly fotoUrl = signal<string | null>(null);
  readonly fotoError = signal(false);
  readonly cargandoFoto = signal(false);

  /** null significa "no se pudo contar", distinto de cero confirmaciones. */
  readonly confirmaciones = signal<number | null>(null);
  /**
   * v2-D6 · Estado explícito en vez de un booleano con null. Antes, mientras se
   * resolvía la consulta el template no podía distinguir "cargando" de "no ha
   * confirmado", y quien ya había confirmado veía aparecer y desaparecer el
   * botón de confirmar.
   */
  readonly estadoConfirmacion = signal<
    'cargando' | 'disponible' | 'confirmado' | 'error'
  >('cargando');
  readonly confirmando = signal(false);

  /** null = el historial no se pudo leer, distinto de no tener movimientos. */
  readonly historial = signal<StatusChange[] | null>([]);

  /** Rol de gestión del usuario, sea o no el responsable de este reporte. */
  readonly esGestor = signal(false);

  /**
   * Si puede cambiar el estado de este reporte en particular.
   *
   * Replica la regla `puedeGestionarReporte`: un admin gestiona cualquier
   * reporte; un operador, solo los que tienen asignado su `operadorId`. Antes
   * se mostraban los botones a cualquier operador en cualquier reporte, y el
   * cambio fallaba con "sin permisos".
   */
  readonly puedeGestionar = signal(false);
  readonly motivoSinGestion = signal<string | null>(null);

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

  /** Fecha de un movimiento del historial. */
  fechaCambio(cambio: StatusChange): string {
    return this.queryService.formatearFecha(cambio.createdAt as Report['createdAt']);
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
      this.estadoConfirmacion.set('confirmado');

      /**
       * v2-D7 · Si el conteo previo había fallado, sumar uno a null dejaba el
       * dato como "no disponible" pese a existir ya una confirmación. Se vuelve
       * a consultar el total.
       */
      const actual = this.confirmaciones();

      if (actual === null) {
        this.confirmaciones.set(
          await this.confirmationService.countConfirmations(reporte.id),
        );
      } else {
        this.confirmaciones.set(actual + 1);
      }

      await this.toast('Confirmación registrada. Gracias por validar.', 'success');
    } catch (error) {
      if (error instanceof ConfirmationError && error.code === 'duplicada') {
        this.estadoConfirmacion.set('confirmado');
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

      const historial = await this.routingService.getStatusHistory(reporte.id);
      this.historial.set(historial === null ? null : [...historial].reverse());
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
      .then((confirmado) => {
        if (confirmado === null) {
          this.estadoConfirmacion.set('error');
          return;
        }

        this.estadoConfirmacion.set(confirmado ? 'confirmado' : 'disponible');
      })
      .catch(() => this.estadoConfirmacion.set('error'));

    void this.routingService
      .getStatusHistory(reporte.id)
      .then((historial) =>
        // v2-D8 · Se invierte para mostrar el movimiento más reciente arriba.
        this.historial.set(historial === null ? null : [...historial].reverse()),
      )
      .catch(() => this.historial.set(null));

    const usuario = this.authService.user;

    if (usuario) {
      void this.authService
        .getUserProfile(usuario.uid)
        .then((perfil) => this.evaluarGestion(reporte, perfil))
        .catch(() => this.puedeGestionar.set(false));
    }
  }

  private evaluarGestion(
    reporte: Report,
    perfil: { role?: string; operadorId?: string | null } | null,
  ): void {
    const rol = perfil?.role;
    this.esGestor.set(rol === 'admin' || rol === 'operador');

    if (rol === 'admin') {
      this.puedeGestionar.set(true);
      this.motivoSinGestion.set(null);
      return;
    }

    if (rol === 'operador') {
      const esSuyo = !!perfil?.operadorId && reporte.operadorId === perfil.operadorId;
      this.puedeGestionar.set(esSuyo);
      this.motivoSinGestion.set(
        esSuyo
          ? null
          : reporte.operadorId
            ? 'Este reporte está asignado a otro operador. Solo él o un administrador pueden cambiar su estado.'
            : 'Este reporte no tiene operador asignado. Un administrador puede asignarlo o cambiar su estado.',
      );
      return;
    }

    this.puedeGestionar.set(false);
    this.motivoSinGestion.set(null);
  }

  private reiniciarEstado(): void {
    this.cargando.set(true);
    this.noEncontrado.set(false);
    this.reporte.set(null);
    this.fotoUrl.set(null);
    this.fotoError.set(false);
    this.cargandoFoto.set(false);
    this.confirmaciones.set(null);
    this.estadoConfirmacion.set('cargando');
    this.historial.set([]);
    this.puedeGestionar.set(false);
    this.esGestor.set(false);
    this.motivoSinGestion.set(null);
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
