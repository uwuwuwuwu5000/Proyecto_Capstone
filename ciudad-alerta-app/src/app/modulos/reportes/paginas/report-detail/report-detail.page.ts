import { Component, computed, effect, inject, input, signal } from '@angular/core';
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
import {
  businessOutline,
  checkmarkCircleOutline,
  checkmarkDoneOutline,
  imageOutline,
  peopleOutline,
  refreshOutline,
  timeOutline,
} from 'ionicons/icons';

import { MapViewComponent } from '../../../../compartido/mapa';
import { ContactoOrganismoComponent } from '../../componentes/contacto-organismo/contacto-organismo.component';
import { ConfirmationError, ConfirmationService } from '../../datos/confirmation.service';
import { ReportQueryService } from '../../../../services/report-query.service';
import { ReportService } from '../../datos/report.service';
import { RoutingService } from '../../../../services/routing.service';
import { AuthService } from '../../../../services/auth.service';
import { RanuraComponent } from '../../../../nucleo/modulos';
import { resolucionDe, textoPrimeraAtencion, textoResolucion } from '../../resolucion';
import {
  COLORES_ESTADO,
  ETIQUETAS_ESTADO,
  Report,
  StatusChange,
  etiquetaCategoria,
} from '../../../../models/report.model';

/** HU-26 · Detalle completo de una incidencia, con confirmación y trazabilidad. */
@Component({
  selector: 'app-report-detail',
  standalone: true,
  templateUrl: './report-detail.page.html',
  styleUrls: ['./report-detail.page.scss'],
  imports: [
    MapViewComponent,
    ContactoOrganismoComponent,
    RanuraComponent,
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

  /** F12 · "Resuelto en 2 h 15 min"; null mientras siga abierto. */
  readonly resolucion = computed(() => {
    const reporte = this.reporte();
    return reporte ? textoResolucion(resolucionDe(reporte, this.historial())) : null;
  });

  /** F12 · Cuánto tardó el primer cambio de estado. */
  readonly primeraAtencion = computed(() => {
    const reporte = this.reporte();
    return reporte ? textoPrimeraAtencion(reporte, this.historial()) : null;
  });

  readonly esAutor = computed(
    () => this.reporte()?.uid === this.authService.user?.uid,
  );

  /**
   * Ranura `detalle-reporte.verificacion`: el módulo de confianza confirma
   * con peso y avisa aquí con el reporte actualizado.
   */
  readonly alConfirmarConPeso = (actualizado: Report): void => {
    this.reporte.set(actualizado);
    this.estadoConfirmacion.set('confirmado');
    this.confirmaciones.update((total) => (total === null ? null : total + 1));
  };

  /**
   * Ranura `detalle-reporte.gestion`: el módulo de gestión cambia el estado y
   * avisa aquí con el reporte actualizado. El seguimiento se vuelve a leer
   * para mostrar el movimiento nuevo.
   */
  readonly alCambiarEstado = (actualizado: Report): void => {
    this.reporte.set(actualizado);
    void this.cargarHistorial(actualizado.id);
  };

  constructor() {
    addIcons({
      businessOutline,
      checkmarkCircleOutline,
      checkmarkDoneOutline,
      imageOutline,
      peopleOutline,
      refreshOutline,
      timeOutline,
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

    // Se consulta aunque el módulo de confianza llene la ranura: si su pieza no
    // llega a descargarse (sin red), el bloque simple de respaldo ya sabe qué mostrar.
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

    void this.cargarHistorial(reporte.id);
  }

  /**
   * v2-D8 · Más reciente arriba. Antes, tras un cambio de estado se leía dos
   * veces y la segunda lectura dejaba el orden antiguo.
   */
  private async cargarHistorial(reportId: string): Promise<void> {
    const historial = await this.routingService.getStatusHistory(reportId).catch(() => null);
    if (this.reporte()?.id === reportId) {
      this.historial.set(historial === null ? null : [...historial].reverse());
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
    this.estadoConfirmacion.set('cargando');
    this.historial.set([]);
  }

  private async toast(
    message: string,
    color: 'success' | 'warning',
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
