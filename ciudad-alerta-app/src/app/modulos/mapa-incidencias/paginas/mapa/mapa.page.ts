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
import { locateOutline, refreshOutline, searchOutline } from 'ionicons/icons';
import { distanceBetween } from 'geofire-common';

import { AvisosCampanaComponent } from '../../../../components/avisos-campana/avisos-campana.component';
import { AreaMapa, MapMarker, MapViewComponent } from '../../../../compartido/mapa';
import {
  COLORES_ESTADO,
  ETIQUETAS_ESTADO,
  GeoPoint,
  NearbyReport,
  REPORT_CATEGORIES,
  ReportCategory,
  ReportStatus,
} from '../../../../models/report.model';
import { ModulosService } from '../../../../nucleo/modulos';
import { AuthService } from '../../../../services/auth.service';
import { GeolocationService, LocationError } from '../../../../services/geolocation.service';
import { HistorialService } from '../../../../services/historial.service';
import { FiltrosMapa, ReportQueryService } from '../../../../services/report-query.service';
import { PARAMETROS_MAPA } from '../../parametros';

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

/** Zona consultada a Firestore: lo que está en pantalla salió de aquí. */
interface Busqueda {
  centro: { lat: number; lng: number };
  radioMetros: number;
  /** La zona visible era más grande que el radio máximo y se recortó. */
  recortada: boolean;
}

/**
 * HU-25 · Mapa de incidencias con filtros por categoría y estado.
 *
 * Feedback Sprint 5 · Antes solo mostraba 2 km alrededor del usuario y
 * terminaba siendo lo mismo que "Cerca de mí". Ahora parte en la ubicación del
 * usuario, pero al mover o alejar el mapa aparece «Buscar en esta zona», que
 * consulta lo que está a la vista. La búsqueda es a pedido, no automática,
 * para no gastar lecturas de Firestore con cada arrastre.
 */
@Component({
  selector: 'app-mapa-incidencias',
  standalone: true,
  templateUrl: './mapa.page.html',
  styleUrls: ['./mapa.page.scss'],
  imports: [
    AvisosCampanaComponent,
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
export class MapaPage {
  private readonly queryService = inject(ReportQueryService);
  private readonly geolocationService = inject(GeolocationService);
  private readonly historialService = inject(HistorialService);
  private readonly authService = inject(AuthService);
  private readonly modulos = inject(ModulosService);
  private readonly router = inject(Router);

  readonly categorias = REPORT_CATEGORIES;
  readonly estados = Object.entries(ETIQUETAS_ESTADO) as [ReportStatus, string][];
  readonly radioMaximoKm = PARAMETROS_MAPA.radioMaximoMetros / 1000;

  /** Posición del usuario: marca su punto en el mapa y es la primera zona. */
  readonly ubicacion = signal<GeoPoint | null>(null);
  readonly resultados = signal<NearbyReport[]>([]);
  readonly estado = signal<EstadoVista>('sin_ubicacion');
  readonly mensajeError = signal<string | null>(null);
  readonly filtros = signal<FiltrosMapa>({ categoria: 'todas', estado: 'todos' });

  readonly busqueda = signal<Busqueda | null>(null);
  private readonly areaVisible = signal<AreaMapa | null>(null);

  /** El usuario movió o alejó el mapa fuera de lo que ya se consultó. */
  readonly hayZonaNueva = computed(() => {
    const area = this.areaVisible();
    const busqueda = this.busqueda();

    if (!area || !busqueda || this.estado() === 'cargando') {
      return false;
    }

    const desplazamiento =
      distanceBetween(
        [area.centro.lat, area.centro.lng],
        [busqueda.centro.lat, busqueda.centro.lng],
      ) * 1000;

    const seMovio = desplazamiento > busqueda.radioMetros * PARAMETROS_MAPA.umbralDesplazamiento;
    const seAlejo =
      area.radioMetros > busqueda.radioMetros * PARAMETROS_MAPA.umbralAlejamiento &&
      busqueda.radioMetros < PARAMETROS_MAPA.radioMaximoMetros;

    return seMovio || seAlejo;
  });

  /** uid de la sesión cuyos datos están en pantalla (BUG 32). */
  private uidCargado: string | null = null;

  readonly marcadores = computed<MapMarker[]>(() => {
    // Opcional: sin el módulo de confianza no hay reportes destacados.
    const destacarValidados = this.modulos.activo('confianza');

    return this.resultados().map(({ report }) => {
      const destacado = destacarValidados && report.validacion?.validado === true;

      return {
        id: report.id,
        lat: report.ubicacion.lat,
        lng: report.ubicacion.lng,
        color: COLORES_ESTADO[report.estado],
        destacado,
        titulo:
          `${report.descripcion.slice(0, 60)} · ${ETIQUETAS_ESTADO[report.estado]}` +
          (destacado ? ' · Validado por la comunidad' : ''),
      };
    });
  });

  /**
   * Carga la línea de tiempo de un reporte cuando el usuario pulsa "Ver
   * historial de estados" en el popup. El reporte ya está en memoria desde la
   * búsqueda; solo se lee su historial, y solo en ese momento.
   */
  readonly cargadorHistorial = (reportId: string) => {
    const reporte = this.resultados().find((item) => item.report.id === reportId)?.report;

    if (!reporte) {
      return Promise.reject(new Error('Reporte no encontrado en la vista actual.'));
    }

    return this.historialService.lineaDeTiempo(reporte);
  };

  constructor() {
    addIcons({ locateOutline, refreshOutline, searchOutline });
  }

  /**
   * BUG 32 · Al cerrar sesión e ingresar con otra cuenta, Ionic reutiliza la
   * página y la posición y los reportes de la sesión anterior seguían visibles.
   */
  async ionViewWillEnter(): Promise<void> {
    const uidActual = this.authService.user?.uid ?? null;

    if (uidActual !== this.uidCargado) {
      this.ubicacion.set(null);
      this.resultados.set([]);
      this.busqueda.set(null);
      this.areaVisible.set(null);
      this.estado.set('sin_ubicacion');
      this.uidCargado = uidActual;
    }

    if (!this.ubicacion()) {
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

  alCambiarArea(area: AreaMapa): void {
    this.areaVisible.set(area);
  }

  /** «Buscar en esta zona»: consulta lo que está a la vista. */
  async buscarEnEstaZona(): Promise<void> {
    const area = this.areaVisible();

    if (!area) {
      return;
    }

    const { radioMinimoMetros, radioMaximoMetros } = PARAMETROS_MAPA;

    this.busqueda.set({
      centro: area.centro,
      radioMetros: Math.min(Math.max(area.radioMetros, radioMinimoMetros), radioMaximoMetros),
      recortada: area.radioMetros > radioMaximoMetros,
    });
    await this.cargar();
  }

  /** BUG 33 · Reintento explícito cuando falla la geolocalización. */
  async ubicar(): Promise<void> {
    this.estado.set('ubicando');
    this.mensajeError.set(null);

    try {
      const posicion = await this.geolocationService.getCurrentPosition();
      this.ubicacion.set(posicion);
      this.busqueda.set({
        centro: { lat: posicion.lat, lng: posicion.lng },
        radioMetros: PARAMETROS_MAPA.radioInicialMetros,
        recortada: false,
      });
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
    const busqueda = this.busqueda();

    if (!busqueda) {
      return;
    }

    this.estado.set('cargando');

    try {
      const centro: GeoPoint = { ...busqueda.centro, accuracy: 0 };
      this.resultados.set(
        await this.queryService.findNearby(centro, busqueda.radioMetros, this.filtros()),
      );
      this.estado.set('listo');
    } catch {
      this.resultados.set([]);
      this.estado.set('error_datos');
      this.mensajeError.set('No se pudieron cargar las incidencias de esta zona.');
    }
  }
}
