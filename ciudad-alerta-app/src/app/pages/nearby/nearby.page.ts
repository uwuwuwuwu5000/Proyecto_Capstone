import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import {
  IonBackButton,
  IonBadge,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonSegment,
  IonSegmentButton,
  IonSelect,
  IonSelectOption,
  IonTitle,
  IonToolbar,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { locateOutline, navigateOutline, refreshOutline } from 'ionicons/icons';

import { MapMarker, MapViewComponent } from '../../components/map-view/map-view.component';
import { AuthService } from '../../services/auth.service';
import { GeolocationService, LocationError } from '../../services/geolocation.service';
import { FiltrosMapa, ReportQueryService } from '../../services/report-query.service';
import {
  COLORES_ESTADO,
  ETIQUETAS_ESTADO,
  GeoPoint,
  NearbyReport,
  RADIOS_BUSQUEDA,
  REPORT_CATEGORIES,
  ReportCategory,
} from '../../models/report.model';

type EstadoVista =
  | 'sin_ubicacion'
  | 'ubicando'
  | 'error_ubicacion'
  | 'cargando'
  | 'listo'
  | 'error_datos';

/**
 * Reportes cercanos con radio seleccionable (500 m, 1, 2 o 5 km).
 *
 * Complementa al mapa: aquí la información se presenta como lista ordenada por
 * distancia, que es más cómoda para revisar en el teléfono.
 */
@Component({
  selector: 'app-nearby',
  standalone: true,
  templateUrl: './nearby.page.html',
  styleUrls: ['./nearby.page.scss'],
  imports: [
    MapViewComponent,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonBackButton,
    IonContent,
    IonSegment,
    IonSegmentButton,
    IonSelect,
    IonSelectOption,
    IonBadge,
    IonButton,
    IonIcon,
  ],
})
export class NearbyPage {
  private readonly queryService = inject(ReportQueryService);
  private readonly geolocationService = inject(GeolocationService);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  readonly radios = RADIOS_BUSQUEDA;
  readonly categorias = REPORT_CATEGORIES;
  readonly etiquetas = ETIQUETAS_ESTADO;
  readonly colores = COLORES_ESTADO;

  readonly centro = signal<GeoPoint | null>(null);
  readonly radio = signal<number>(500);
  readonly categoria = signal<ReportCategory | 'todas'>('todas');
  readonly resultados = signal<NearbyReport[]>([]);
  readonly estado = signal<EstadoVista>('sin_ubicacion');
  readonly mensajeError = signal<string | null>(null);

  private uidCargado: string | null = null;

  readonly marcadores = computed<MapMarker[]>(() =>
    this.resultados().map(({ report }) => ({
      id: report.id,
      lat: report.ubicacion.lat,
      lng: report.ubicacion.lng,
      color: COLORES_ESTADO[report.estado],
      titulo: report.descripcion.slice(0, 60),
    })),
  );

  constructor() {
    addIcons({ locateOutline, navigateOutline, refreshOutline });
  }

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

  etiquetaRadio(metros: number): string {
    return metros < 1000 ? `${metros} m` : `${metros / 1000} km`;
  }

  async cambiarRadio(valor: string | number | undefined): Promise<void> {
    this.radio.set(Number(valor ?? 500));
    await this.cargar();
  }

  async cambiarCategoria(valor: string | number | undefined): Promise<void> {
    this.categoria.set((valor ?? 'todas') as ReportCategory | 'todas');
    await this.cargar();
  }

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
          : 'No pudimos obtener tu ubicación.',
      );
    }
  }

  abrirDetalle(reportId: string): void {
    void this.router.navigate(['/report', reportId]);
  }

  /**
   * BUG 44 · La distancia se redondea a la decena: el GPS tiene un error de
   * varias decenas de metros y mostrar "37 m" sugiere una precisión que no existe.
   */
  formatearDistancia(metros: number): string {
    if (metros < 1000) {
      return `${Math.max(10, Math.round(metros / 10) * 10)} m aprox.`;
    }

    return `${(metros / 1000).toFixed(1)} km aprox.`;
  }

  async cargar(): Promise<void> {
    const centro = this.centro();

    if (!centro) {
      return;
    }

    this.estado.set('cargando');

    const filtros: FiltrosMapa = { categoria: this.categoria(), estado: 'todos' };

    try {
      this.resultados.set(
        await this.queryService.findNearby(centro, this.radio(), filtros),
      );
      this.estado.set('listo');
    } catch {
      this.resultados.set([]);
      this.estado.set('error_datos');
      this.mensajeError.set('No se pudieron cargar los reportes cercanos.');
    }
  }
}
