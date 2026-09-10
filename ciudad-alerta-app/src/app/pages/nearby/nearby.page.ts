import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import {
  IonBackButton,
  IonBadge,
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
  ToastController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { locateOutline, navigateOutline } from 'ionicons/icons';

import { MapMarker, MapViewComponent } from '../../components/map-view/map-view.component';
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
    IonIcon,
  ],
})
export class NearbyPage {
  private readonly queryService = inject(ReportQueryService);
  private readonly geolocationService = inject(GeolocationService);
  private readonly toastCtrl = inject(ToastController);
  private readonly router = inject(Router);

  readonly radios = RADIOS_BUSQUEDA;
  readonly categorias = REPORT_CATEGORIES;
  readonly etiquetas = ETIQUETAS_ESTADO;
  readonly colores = COLORES_ESTADO;

  readonly centro = signal<GeoPoint | null>(null);
  readonly radio = signal<number>(500);
  readonly categoria = signal<ReportCategory | 'todas'>('todas');
  readonly resultados = signal<NearbyReport[]>([]);
  readonly cargando = signal(false);

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
    addIcons({ locateOutline, navigateOutline });
  }

  async ionViewWillEnter(): Promise<void> {
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
    try {
      this.centro.set(await this.geolocationService.getCurrentPosition());
      await this.cargar();
    } catch (error) {
      const mensaje =
        error instanceof LocationError
          ? error.message
          : 'No pudimos obtener tu ubicación.';
      await this.toast(mensaje);
    }
  }

  abrirDetalle(reportId: string): void {
    void this.router.navigate(['/report', reportId]);
  }

  formatearDistancia(metros: number): string {
    return metros < 1000 ? `${metros} m` : `${(metros / 1000).toFixed(1)} km`;
  }

  private async cargar(): Promise<void> {
    const centro = this.centro();

    if (!centro) {
      return;
    }

    this.cargando.set(true);

    const filtros: FiltrosMapa = { categoria: this.categoria(), estado: 'todos' };

    try {
      this.resultados.set(
        await this.queryService.findNearby(centro, this.radio(), filtros),
      );
    } catch {
      this.resultados.set([]);
      await this.toast('No se pudieron cargar los reportes cercanos.');
    } finally {
      this.cargando.set(false);
    }
  }

  private async toast(message: string): Promise<void> {
    const toast = await this.toastCtrl.create({
      message,
      duration: 3000,
      color: 'warning',
      position: 'bottom',
      buttons: [{ text: 'Cerrar', role: 'cancel' }],
    });
    await toast.present();
  }
}
