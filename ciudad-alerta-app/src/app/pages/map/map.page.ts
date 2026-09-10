import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import {
  IonBackButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonSelect,
  IonSelectOption,
  IonTitle,
  IonToolbar,
  ToastController,
} from '@ionic/angular';

import { MapMarker, MapViewComponent } from '../../components/map-view/map-view.component';
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
  ],
})
export class MapPage {
  private readonly queryService = inject(ReportQueryService);
  private readonly geolocationService = inject(GeolocationService);
  private readonly toastCtrl = inject(ToastController);
  private readonly router = inject(Router);

  readonly categorias = REPORT_CATEGORIES;
  readonly estados = Object.entries(ETIQUETAS_ESTADO) as [ReportStatus, string][];

  readonly centro = signal<GeoPoint | null>(null);
  readonly resultados = signal<NearbyReport[]>([]);
  readonly cargando = signal(false);
  readonly filtros = signal<FiltrosMapa>({ categoria: 'todas', estado: 'todos' });

  /** Radio de la vista del mapa, en metros. */
  private readonly radio = 2000;

  readonly marcadores = computed<MapMarker[]>(() =>
    this.resultados().map(({ report }) => ({
      id: report.id,
      lat: report.ubicacion.lat,
      lng: report.ubicacion.lng,
      color: COLORES_ESTADO[report.estado],
      titulo: `${report.descripcion.slice(0, 60)} · ${ETIQUETAS_ESTADO[report.estado]}`,
    })),
  );

  readonly sinResultados = computed(
    () => !this.cargando() && this.centro() !== null && this.resultados().length === 0,
  );

  async ionViewWillEnter(): Promise<void> {
    if (!this.centro()) {
      await this.ubicarYcargar();
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

  private async ubicarYcargar(): Promise<void> {
    try {
      this.centro.set(await this.geolocationService.getCurrentPosition());
      await this.cargar();
    } catch (error) {
      const mensaje =
        error instanceof LocationError
          ? error.message
          : 'No pudimos obtener tu ubicación para centrar el mapa.';
      await this.toast(mensaje);
    }
  }

  private async cargar(): Promise<void> {
    const centro = this.centro();

    if (!centro) {
      return;
    }

    this.cargando.set(true);

    try {
      this.resultados.set(
        await this.queryService.findNearby(centro, this.radio, this.filtros()),
      );
    } catch {
      this.resultados.set([]);
      await this.toast('No se pudieron cargar las incidencias del sector.');
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
