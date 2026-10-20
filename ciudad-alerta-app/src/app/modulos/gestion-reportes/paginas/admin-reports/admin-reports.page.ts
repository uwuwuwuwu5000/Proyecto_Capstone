import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { QueryDocumentSnapshot } from 'firebase/firestore';
import {
  IonBackButton,
  IonBadge,
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
import { imageOutline, refreshOutline } from 'ionicons/icons';

import { AuthService } from '../../../../services/auth.service';
import {
  FiltrosBandejaReportes,
  ReportQueryService,
} from '../../../../services/report-query.service';
import {
  COLORES_ESTADO,
  ETIQUETAS_ESTADO,
  REPORT_CATEGORIES,
  etiquetaCategoria,
  Report,
  ReportCategory,
  ReportStatus,
} from '../../../../models/report.model';
import { RanuraComponent } from '../../../../nucleo/modulos';

/**
 * Bandeja de gestión: todas las incidencias del sistema.
 *
 * El mapa y "Cerca de mí" muestran solo lo que rodea al usuario, y "Mis
 * reportes" solo lo propio. Un funcionario necesita ver la totalidad de los
 * reportes sin depender de dónde esté parado, y eso es lo que resuelve esta
 * pantalla.
 */
@Component({
  selector: 'app-admin-reports',
  standalone: true,
  templateUrl: './admin-reports.page.html',
  styleUrls: ['./admin-reports.page.scss'],
  imports: [
    RanuraComponent,
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
    IonBadge,
  ],
})
export class AdminReportsPage {
  private readonly queryService = inject(ReportQueryService);
  private readonly authService = inject(AuthService);

  /**
   * Un operador ve solo los reportes que tiene asignados, que son los únicos
   * cuyo estado puede cambiar. Un admin ve todos.
   */
  readonly operadorId = signal<string | null>(null);
  private readonly router = inject(Router);

  readonly categorias = REPORT_CATEGORIES;
  readonly nombreCategoria = etiquetaCategoria;
  readonly estados = Object.entries(ETIQUETAS_ESTADO) as [ReportStatus, string][];
  readonly etiquetas = ETIQUETAS_ESTADO;
  readonly colores = COLORES_ESTADO;

  readonly reportes = signal<Report[]>([]);
  readonly estado = signal<'cargando' | 'listo' | 'error'>('cargando');
  readonly hayMas = signal(false);
  readonly filtros = signal<FiltrosBandejaReportes>({
    categoria: 'todas',
    estado: 'todos',
    comuna: 'todas',
  });

  /**
   * Comunas vistas hasta ahora, para poblar el filtro. Se acumulan en vez de
   * recalcularse con cada página, así el selector no pierde opciones al
   * filtrar.
   */
  readonly comunasConocidas = signal<string[]>([]);

  private cursor: QueryDocumentSnapshot | null = null;

  constructor() {
    addIcons({ imageOutline, refreshOutline });
  }

  async ionViewWillEnter(): Promise<void> {
    const usuario = this.authService.user;
    const perfil = usuario
      ? await this.authService.getUserProfile(usuario.uid).catch(() => null)
      : null;

    this.operadorId.set(
      perfil?.role === 'operador' && perfil.operadorId ? perfil.operadorId : null,
    );

    await this.recargar();
  }

  async cambiarCategoria(valor: string | number | undefined): Promise<void> {
    this.filtros.update((actuales) => ({
      ...actuales,
      categoria: (valor ?? 'todas') as ReportCategory | 'todas',
    }));
    await this.recargar();
  }

  async cambiarEstado(valor: string | number | undefined): Promise<void> {
    this.filtros.update((actuales) => ({
      ...actuales,
      estado: (valor ?? 'todos') as ReportStatus | 'todos',
    }));
    await this.recargar();
  }

  async cambiarComuna(valor: string | number | undefined): Promise<void> {
    this.filtros.update((actuales) => ({
      ...actuales,
      comuna: (valor ?? 'todas') as string,
    }));
    await this.recargar();
  }

  async recargar(): Promise<void> {
    this.reportes.set([]);
    this.cursor = null;
    this.estado.set('cargando');
    await this.cargarPagina();
  }

  async cargarMas(): Promise<void> {
    await this.cargarPagina();
  }

  fecha(reporte: Report): string {
    return this.queryService.formatearFecha(reporte.createdAt);
  }

  abrir(reportId: string): void {
    void this.router.navigate(['/report', reportId]);
  }

  private async cargarPagina(): Promise<void> {
    const operador = this.operadorId();

    if (operador) {
      try {
        const asignados = await this.queryService.reportesDeOperador(operador);
        const { categoria, estado, comuna } = this.filtros();

        this.reportes.set(
          asignados.filter(
            (reporte) =>
              (categoria === 'todas' || reporte.categoria === categoria) &&
              (estado === 'todos' || reporte.estado === estado) &&
              (comuna === 'todas' || reporte.comuna === comuna),
          ),
        );
        this.comunasConocidas.set(
          [...new Set(asignados.map((r) => r.comuna).filter((c): c is string => !!c))].sort(),
        );
        this.hayMas.set(false);
        this.estado.set('listo');
      } catch {
        this.estado.set('error');
      }

      return;
    }

    try {
      const pagina = await this.queryService.todosLosReportes(
        this.filtros(),
        20,
        this.cursor,
      );

      this.reportes.update((actuales) => [...actuales, ...pagina.reportes]);

      const nuevas = pagina.reportes
        .map((reporte) => reporte.comuna)
        .filter((comuna): comuna is string => !!comuna);

      if (nuevas.length > 0) {
        this.comunasConocidas.update((actuales) =>
          [...new Set([...actuales, ...nuevas])].sort((a, b) => a.localeCompare(b, 'es')),
        );
      }
      this.cursor = pagina.cursor;
      this.hayMas.set(pagina.cursor !== null);
      this.estado.set('listo');
    } catch {
      this.estado.set('error');
    }
  }
}
