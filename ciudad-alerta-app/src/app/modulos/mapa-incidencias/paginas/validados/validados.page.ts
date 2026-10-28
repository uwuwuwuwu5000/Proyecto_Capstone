import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonTitle,
  IonToolbar,
} from '@ionic/angular';
import { cajaDePuntos, etiquetaCategoria } from '@ciudad-alerta/comun';
import { addIcons } from 'ionicons';
import { refreshOutline } from 'ionicons/icons';

import { RUTAS_REPORTES } from '../../../reportes';
import { CajaMapa, MapMarker, MapViewComponent } from '../../../../compartido/mapa';
import { COLORES_ESTADO, ETIQUETAS_ESTADO, Report } from '../../../../models/report.model';
import { esCuentaDeOrganismo } from '../../../../models/user-profile.model';
import { RanuraComponent } from '../../../../nucleo/modulos';
import { UltimaCarga } from '../../../../nucleo/carga';
import { AuthService } from '../../../../services/auth.service';
import { HistorialService } from '../../../../services/historial.service';
import { ReportQueryService } from '../../../../services/report-query.service';
import { RoutingService } from '../../../../services/routing.service';
import { PARAMETROS_MAPA } from '../../parametros';

type EstadoVista = 'cargando' | 'listo' | 'error' | 'sin_organismo';

/**
 * 1.2 · El mapa de una cuenta de organismo (role 'organismo').
 *
 * Muestra solo los reportes de su organismo que la comunidad ya validó
 * (`validacion.validado`): es lo que el sistema de confianza «envía» a la
 * municipalidad. Las reglas de Firestore no le dejan leer nada más, así que
 * esta pantalla no tiene filtros de región ni de estado que pudieran pedir
 * reportes sin validar. Cada marcador, y cada fila de la lista, abre el
 * detalle en modo lectura.
 */
@Component({
  selector: 'app-reportes-validados',
  standalone: true,
  templateUrl: './validados.page.html',
  styleUrls: ['./validados.page.scss'],
  imports: [
    RanuraComponent,
    MapViewComponent,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonBackButton,
    IonContent,
    IonButton,
    IonIcon,
  ],
})
export class ValidadosPage {
  private readonly cargas = new UltimaCarga();
  private readonly queryService = inject(ReportQueryService);
  private readonly routingService = inject(RoutingService);
  private readonly historialService = inject(HistorialService);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  readonly maximo = PARAMETROS_MAPA.maximoPorRegion;
  readonly estado = signal<EstadoVista>('cargando');
  /** Nombre del organismo de la cuenta («Municipalidad de Maipú»). */
  readonly organismo = signal<string | null>(null);
  readonly resultados = signal<Report[]>([]);
  readonly hayMas = signal(false);

  readonly marcadores = computed<MapMarker[]>(() =>
    this.resultados().map((report) => ({
      id: report.id,
      lat: report.ubicacion.lat,
      lng: report.ubicacion.lng,
      color: COLORES_ESTADO[report.estado],
      // Todos están validados: se ven destacados, como en el mapa general.
      destacado: true,
      titulo:
        `${report.descripcion.slice(0, 60)} · ${ETIQUETAS_ESTADO[report.estado]}` +
        (report.comuna ? ` · ${report.comuna}` : ''),
    })),
  );

  /** El mapa muestra todos los reportes; sin ninguno, la vista por defecto. */
  readonly encuadre = computed<CajaMapa | null>(() => {
    const marcadores = this.marcadores();
    return marcadores.length ? cajaDePuntos(marcadores) : null;
  });

  /** Historial de estados del popup, leído solo cuando se pide. */
  readonly cargadorHistorial = (reportId: string) => {
    const reporte = this.resultados().find((item) => item.id === reportId);
    return reporte ? this.historialService.lineaDeTiempo(reporte) : Promise.reject(new Error('Reporte no encontrado.'));
  };

  /** uid cuyos datos están en pantalla: al cambiar de cuenta no quedan los de la anterior. */
  private uidCargado: string | null = null;

  constructor() {
    addIcons({ refreshOutline });
  }

  async ionViewWillEnter(): Promise<void> {
    const uid = this.authService.user?.uid ?? null;

    if (uid !== this.uidCargado) {
      this.uidCargado = uid;
      this.resultados.set([]);
      this.hayMas.set(false);
      this.organismo.set(null);
      this.estado.set('cargando');
    }

    // Al volver desde el detalle no se vuelve a consultar: para eso está «Actualizar».
    if (this.estado() !== 'listo') {
      await this.cargar();
    }
  }

  async cargar(): Promise<void> {
    const vigente = this.cargas.nueva();
    const usuario = this.authService.user;
    this.estado.set('cargando');

    try {
      const perfil = usuario ? await this.authService.getUserProfile(usuario.uid) : null;
      if (!vigente()) return;

      const organismoId = perfil?.organismoId;
      if (!perfil || !esCuentaDeOrganismo(perfil.role) || !organismoId) {
        this.estado.set('sin_organismo');
        return;
      }

      const [nombre, { reportes, hayMas }] = await Promise.all([
        this.routingService.nombreDeOrganismo(organismoId),
        this.queryService.validadosDeOrganismo(organismoId, this.maximo),
      ]);
      if (!vigente()) return;

      this.organismo.set(nombre);
      this.resultados.set(reportes);
      this.hayMas.set(hayMas);
      this.estado.set('listo');
    } catch {
      if (!vigente()) return;
      this.resultados.set([]);
      this.hayMas.set(false);
      this.estado.set('error');
    }
  }

  abrirDetalle(reportId: string): void {
    void this.router.navigate(RUTAS_REPORTES.detalle(reportId));
  }

  categoria(report: Report): string {
    return etiquetaCategoria(report.categoria);
  }

  etiquetaEstado(report: Report): string {
    return ETIQUETAS_ESTADO[report.estado];
  }

  fecha(report: Report): string {
    return this.queryService.formatearFecha(report.createdAt);
  }
}
