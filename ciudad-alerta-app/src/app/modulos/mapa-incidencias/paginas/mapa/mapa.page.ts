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
import { cajaDePuntos } from '@ciudad-alerta/comun';
import { addIcons } from 'ionicons';
import { locateOutline, refreshOutline } from 'ionicons/icons';

import { CajaMapa, MapMarker, MapViewComponent } from '../../../../compartido/mapa';
import {
  COLORES_ESTADO,
  ETIQUETAS_ESTADO,
  GeoPoint,
  REPORT_CATEGORIES,
  Report,
  ReportCategory,
  ReportStatus,
} from '../../../../models/report.model';
import { ModulosService, RanuraComponent } from '../../../../nucleo/modulos';
import { AuthService } from '../../../../services/auth.service';
import { GeolocationService, LocationError } from '../../../../services/geolocation.service';
import { HistorialService } from '../../../../services/historial.service';
import { Region, RegionesService } from '../../datos/regiones.service';
import { FiltrosMapa, ReportQueryService } from '../../../../services/report-query.service';
import { PARAMETROS_MAPA } from '../../parametros';

/**
 * Estados de la pantalla. Distinguirlos evita el mensaje engañoso de
 * "0 incidencias" cuando en realidad todavía no se sabe qué región mostrar
 * (BUG 35).
 */
type EstadoVista =
  | 'ubicando'
  | 'error_ubicacion'
  | 'sin_region'
  | 'cargando'
  | 'listo'
  | 'error_datos';

/** 'actual' = la región donde está el usuario; si no, el código de una región. */
type SeleccionRegion = 'actual' | string;

/**
 * HU-25 · Mapa de incidencias de una región completa.
 *
 * Feedback Sprint 5 y casos MS8/MS9: antes mostraba solo 2-3 km alrededor del
 * usuario, así que los reportes de Cerrillos o Estación Central no aparecían
 * para alguien en Maipú y el mapa repetía lo de "Cerca de mí". Ahora muestra
 * todas las incidencias de la región donde está el usuario, cada una en sus
 * propias coordenadas, y permite elegir cualquier otra región. Los reportes
 * en el mismo punto se agrupan en un círculo con el total (Supercluster, en el
 * mapa compartido) y se separan al acercarse.
 */
@Component({
  selector: 'app-mapa-incidencias',
  standalone: true,
  templateUrl: './mapa.page.html',
  styleUrls: ['./mapa.page.scss'],
  imports: [
    RanuraComponent,
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
  private readonly regionesService = inject(RegionesService);
  private readonly geolocationService = inject(GeolocationService);
  private readonly historialService = inject(HistorialService);
  private readonly authService = inject(AuthService);
  private readonly modulos = inject(ModulosService);
  private readonly router = inject(Router);

  readonly categorias = REPORT_CATEGORIES;
  readonly estados = Object.entries(ETIQUETAS_ESTADO) as [ReportStatus, string][];
  readonly maximo = PARAMETROS_MAPA.maximoPorRegion;

  readonly regiones = signal<Region[]>([]);
  /** Región donde está el usuario, según su ubicación. */
  readonly regionActual = signal<Region | null>(null);
  readonly seleccion = signal<SeleccionRegion>('actual');
  readonly ubicacion = signal<GeoPoint | null>(null);

  readonly resultados = signal<Report[]>([]);
  readonly hayMas = signal(false);
  readonly estado = signal<EstadoVista>('ubicando');
  readonly mensajeError = signal<string | null>(null);
  readonly filtros = signal<FiltrosMapa>({ categoria: 'todas', estado: 'todos' });

  /** La región que está en pantalla. */
  readonly region = computed<Region | null>(() => {
    const seleccion = this.seleccion();
    return seleccion === 'actual'
      ? this.regionActual()
      : (this.regiones().find((r) => r.codigo === seleccion) ?? null);
  });

  readonly marcadores = computed<MapMarker[]>(() => {
    // Opcional: sin el módulo de confianza no hay reportes destacados.
    const destacarValidados = this.modulos.activo('confianza');

    return this.resultados().map((report) => {
      const destacado = destacarValidados && report.validacion?.validado === true;

      return {
        id: report.id,
        lat: report.ubicacion.lat,
        lng: report.ubicacion.lng,
        color: COLORES_ESTADO[report.estado],
        destacado,
        titulo:
          `${report.descripcion.slice(0, 60)} · ${ETIQUETAS_ESTADO[report.estado]}` +
          (report.comuna ? ` · ${report.comuna}` : '') +
          (destacado ? ' · Validado por la comunidad' : ''),
      };
    });
  });

  /**
   * Lo que el mapa debe mostrar completo: todos los reportes encontrados, o
   * la región entera si no hay ninguno.
   */
  readonly encuadre = computed<CajaMapa | null>(() => {
    const marcadores = this.marcadores();

    if (marcadores.length === 0) {
      return this.region()?.caja ?? null;
    }

    return cajaDePuntos(marcadores);
  });

  /**
   * Carga la línea de tiempo de un reporte cuando el usuario pulsa "Ver
   * historial de estados" en el popup. El reporte ya está en memoria; solo se
   * lee su historial, y solo en ese momento.
   */
  readonly cargadorHistorial = (reportId: string) => {
    const reporte = this.resultados().find((item) => item.id === reportId);

    if (!reporte) {
      return Promise.reject(new Error('Reporte no encontrado en la vista actual.'));
    }

    return this.historialService.lineaDeTiempo(reporte);
  };

  /** uid de la sesión cuyos datos están en pantalla (BUG 32). */
  private uidCargado: string | null = null;

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
      this.ubicacion.set(null);
      this.regionActual.set(null);
      this.seleccion.set('actual');
      this.resultados.set([]);
      this.hayMas.set(false);
      this.estado.set('ubicando');
      this.uidCargado = uidActual;
    }

    if (this.regiones().length === 0) {
      try {
        this.regiones.set(await this.regionesService.todas());
      } catch {
        // Sin el catálogo solo se pierde el selector; la región propia sigue
        // funcionando si se puede detectar.
      }
    }

    // Al volver desde el detalle no se vuelve a consultar: una región puede
    // tener cientos de reportes. Para refrescar está el botón «Actualizar».
    if (!this.ubicacion() && this.estado() !== 'listo') {
      await this.ubicar();
    }
  }

  async cambiarRegion(valor: string | number | undefined): Promise<void> {
    const seleccion = String(valor ?? 'actual');
    this.seleccion.set(seleccion);

    if (seleccion === 'actual' && !this.regionActual()) {
      await this.ubicar();
      return;
    }

    await this.cargar();
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

  /** Ubica al usuario y deduce su región. BUG 33 · se puede reintentar. */
  async ubicar(): Promise<void> {
    this.estado.set('ubicando');
    this.mensajeError.set(null);

    try {
      const posicion = await this.geolocationService.getCurrentPosition();
      this.ubicacion.set(posicion);
      this.regionActual.set(await this.regionesService.regionDe(posicion));
    } catch (error) {
      this.estado.set('error_ubicacion');
      this.mensajeError.set(
        error instanceof LocationError
          ? `${error.message} Igual puedes elegir una región en la lista.`
          : 'No pudimos obtener tu ubicación. Igual puedes elegir una región en la lista.',
      );
      return;
    }

    if (!this.region()) {
      this.estado.set('sin_region');
      return;
    }

    await this.cargar();
  }

  async cargar(): Promise<void> {
    const region = this.region();

    if (!region) {
      return;
    }

    this.estado.set('cargando');

    try {
      const { reportes, hayMas } = await this.queryService.porRegion(region, this.filtros(), {
        maximo: PARAMETROS_MAPA.maximoPorRegion,
        incluirSinRegion: PARAMETROS_MAPA.incluirSinRegion,
      });
      this.resultados.set(reportes);
      this.hayMas.set(hayMas);
      this.estado.set('listo');
    } catch {
      this.resultados.set([]);
      this.hayMas.set(false);
      this.estado.set('error_datos');
      this.mensajeError.set(`No se pudieron cargar las incidencias de ${region.nombreCorto}.`);
    }
  }
}
