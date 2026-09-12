import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import {
  IonBackButton,
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
import { locateOutline, refreshOutline } from 'ionicons/icons';

import { MapMarker, MapViewComponent } from '../../components/map-view/map-view.component';
import { AuthService } from '../../services/auth.service';
import { GeolocationService, LocationError } from '../../services/geolocation.service';
import { FiltrosMapa, ReportQueryService } from '../../services/report-query.service';
import {
  COLORES_ESTADO,
  ETIQUETAS_ESTADO,
  GeoPoint,
  NearbyReport,
  REPORT_CATEGORIES,
  ReportCategory,
  ReportStatus,
} from '../../models/report.model';

/**
 * Estados posibles de la pantalla. Distinguirlos evita el mensaje engañoso de
 * "0 incidencias" cuando en realidad todavía no hay ubicación (BUG 35).
 */
type EstadoVista =
  | 'sin_ubicacion'
  | 'ubicando'
  | 'error_ubicacion'
  | 'cargando'
  | 'listo'
  | 'error_datos';

/** HU-25 · Mapa de incidencias urbanas con filtros por categoría y estado. */
@Component({
  selector: 'app-map',
  standalone: true,
  templateUrl: './map.page.html',
  styleUrls: ['./map.page.scss'],
  imports: [
    MapViewComponent,
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
  ],
})
export class MapPage {
  private readonly queryService = inject(ReportQueryService);
  private readonly geolocationService = inject(GeolocationService);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  readonly categorias = REPORT_CATEGORIES;
  readonly estados = Object.entries(ETIQUETAS_ESTADO) as [ReportStatus, string][];

  readonly centro = signal<GeoPoint | null>(null);
  readonly resultados = signal<NearbyReport[]>([]);
  readonly estado = signal<EstadoVista>('sin_ubicacion');
  readonly mensajeError = signal<string | null>(null);
  readonly filtros = signal<FiltrosMapa>({ categoria: 'todas', estado: 'todos' });

  /** Radio de la vista del mapa, en metros. */
  private readonly radio = 2000;

  /** uid de la sesión cuyos datos están en pantalla (BUG 32). */
  private uidCargado: string | null = null;

  readonly marcadores = computed<MapMarker[]>(() =>
    this.resultados().map(({ report }) => ({
      id: report.id,
      lat: report.ubicacion.lat,
      lng: report.ubicacion.lng,
      color: COLORES_ESTADO[report.estado],
      titulo: `${report.descripcion.slice(0, 60)} · ${ETIQUETAS_ESTADO[report.estado]}`,
    })),
  );

  constructor() {
    addIcons({ locateOutline, refreshOutline });
  }

  /**
   * BUG 32 · Al cerrar sesión e ingresar con otra cuenta, Ionic reutiliza la
   * página y la posición y los reportes de la sesión anterior seguían visibles.
   */
  async ionViewWillEnter(): Promise<void> {
    const uidActual = this.authService.user?.uid ?? null;

    if (uidActual !== this.uidCargado) {
      this.centro.set(null);
      this.resultados.set([]);
      this.estado.set('sin_ubicacion');
      this.uidCargado = uidActual;
    }

    if (!this.centro()) {
      await this.ubicar();
    }
  }

  async cambiarCategoria(valor: string | number | undefined): Promise<void> {
    this.filtros.update((actuales) => ({
      ...actuales,
      categoria: (valor ?? 'todas') as ReportCategory | 'todas',
    }));
    await this.cargar();
  }

  async cambiarEstado(valor: string | number | undefined): Promise<void> {
    this.filtros.update((actuales) => ({
      ...actuales,
      estado: (valor ?? 'todos') as ReportStatus | 'todos',
    }));
    await this.cargar();
  }

  abrirDetalle(reportId: string): void {
    void this.router.navigate(['/report', reportId]);
  }

  /** BUG 33 · Reintento explícito cuando falla la geolocalización. */
  async ubicar(): Promise<void> {
    this.estado.set('ubicando');
    this.mensajeError.set(null);

    try {
      this.centro.set(await this.geolocationService.getCurrentPosition());
      await this.cargar();
    } catch (error) {
      this.estado.set('error_ubicacion');
      this.mensajeError.set(
        error instanceof LocationError
          ? error.message
          : 'No pudimos obtener tu ubicación para centrar el mapa.',
      );
    }
  }

  async cargar(): Promise<void> {
    const centro = this.centro();

    if (!centro) {
      return;
    }

    this.estado.set('cargando');

    try {
      this.resultados.set(
        await this.queryService.findNearby(centro, this.radio, this.filtros()),
      );
      this.estado.set('listo');
    } catch {
      this.resultados.set([]);
      this.estado.set('error_datos');
      this.mensajeError.set('No se pudieron cargar las incidencias del sector.');
    }
  }
}
