import { Component, effect, inject, input, signal } from '@angular/core';
import { addIcons } from 'ionicons';
import { addCircleOutline, documentTextOutline } from 'ionicons/icons';

import { TarjetaResumenComponent } from '../../../compartido/tarjeta-resumen';
import { UserProfile } from '../../../models/user-profile.model';
import { ReportQueryService } from '../../../services/report-query.service';
import { ResumenMisReportes, resumenDeMisReportes, textoConteos, textoUltimo } from '../resumen';
import { RUTAS_REPORTES } from '../rutas';

/** Se leen los más recientes: alcanza para el resumen y cuesta poco. */
const REPORTES_LEIDOS = 50;

/**
 * «Tus reportes» en el inicio (ranura `inicio.resumen`): cuántos siguen en
 * curso, cuántos se resolvieron y el último movimiento. Lleva a Mis reportes.
 * Sin reportes, invita a crear el primero. Los operadores no la ven: no
 * reportan.
 */
@Component({
  selector: 'app-resumen-reportes',
  standalone: true,
  imports: [TarjetaResumenComponent],
  template: `
    @if (resumen(); as r) {
      @if (r.total === 0) {
        <app-tarjeta-resumen
          icono="add-circle-outline"
          titulo="Aún no has reportado nada"
          detalle="Si ves un problema en tu barrio, repórtalo con foto y ubicación."
          [enlace]="rutas.crear"
        />
      } @else {
        <app-tarjeta-resumen
          icono="document-text-outline"
          titulo="Tus reportes"
          [detalle]="conteos(r)"
          [nota]="ultimo(r)"
          [enlace]="rutas.mios"
        />
      }
    }
  `,
})
export class ResumenReportesComponent {
  private readonly queryService = inject(ReportQueryService);

  /** Entrada de la ranura; al volver al inicio llega de nuevo y se relee. */
  readonly perfil = input<UserProfile | null>(null);

  protected readonly rutas = RUTAS_REPORTES;
  protected readonly conteos = textoConteos;
  protected readonly ultimo = textoUltimo;
  /** null mientras carga, si falla o si no corresponde mostrarla. */
  protected readonly resumen = signal<ResumenMisReportes | null>(null);

  constructor() {
    addIcons({ addCircleOutline, documentTextOutline });

    effect(() => {
      const perfil = this.perfil();

      if (!perfil || perfil.role === 'operador') {
        this.resumen.set(null);
        return;
      }

      void this.cargar();
    });
  }

  private async cargar(): Promise<void> {
    try {
      const { reportes, cursor } = await this.queryService.getMyReports(REPORTES_LEIDOS);
      this.resumen.set(resumenDeMisReportes(reportes, cursor !== null));
    } catch {
      // Sin red el inicio sigue igual, solo sin esta tarjeta.
      this.resumen.set(null);
    }
  }
}
