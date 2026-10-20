import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonProgressBar,
  IonTitle,
  IonToolbar,
} from '@ionic/angular';
import { Timestamp } from 'firebase/firestore';

import { Report } from '../../../../models/report.model';
import { AuthService } from '../../../../services/auth.service';
import { ReportQueryService } from '../../../../services/report-query.service';
import { ConfianzaService, CupoDelDia, EstadoConfianza } from '../../datos/confianza.service';
import { limiteDiario, pesoDeNivel, progresoDeNivel } from '../../dominio/calculos';
import { NIVELES, PARAMETROS_CONFIANZA } from '../../dominio/parametros';

/** Un veredicto sobre un reporte propio: lo que movió los puntos (A2.3). */
interface EventoPuntos {
  reportId: string;
  descripcion: string;
  veredicto: 'real' | 'falso';
  puntos: number;
  fecha: Date | null;
}

/** Cuántos reportes propios se revisan para armar el historial. */
const REPORTES_PARA_HISTORIAL = 50;

/** A2 · Nivel, puntos, historial y explicación del sistema (A11). */
@Component({
  selector: 'app-mi-nivel',
  standalone: true,
  templateUrl: './mi-nivel.page.html',
  styleUrls: ['./mi-nivel.page.scss'],
  imports: [
    RouterLink,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonBackButton,
    IonContent,
    IonProgressBar,
    IonButton,
  ],
})
export class MiNivelPage {
  private readonly confianza = inject(ConfianzaService);
  private readonly queryService = inject(ReportQueryService);
  private readonly authService = inject(AuthService);
  private readonly route = inject(ActivatedRoute);

  readonly niveles = NIVELES;
  readonly pesoDeNivel = pesoDeNivel;
  readonly limiteDiario = limiteDiario;
  readonly parametros = PARAMETROS_CONFIANZA;

  readonly cargando = signal(true);
  readonly error = signal(false);
  readonly estado = signal<EstadoConfianza | null>(null);
  readonly cupo = signal<CupoDelDia | null>(null);
  readonly historial = signal<EventoPuntos[] | null>(null);
  /** A2.4 · El nivel subió desde la última vez que se vio. */
  readonly subio = signal(false);

  readonly progreso = computed(() => {
    const estado = this.estado();
    return estado ? progresoDeNivel(estado.puntos) : null;
  });

  readonly horaReinicio = computed(() => {
    const cupo = this.cupo();
    return cupo
      ? new Date(cupo.reinicioMs).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })
      : '';
  });

  readonly correoVerificado = computed(() => this.authService.currentUser()?.emailVerified ?? false);

  async ionViewWillEnter(): Promise<void> {
    await this.cargar();
  }

  /** Llegando desde «¿Cómo funciona?», baja a la explicación. */
  ionViewDidEnter(): void {
    const destino = this.route.snapshot.fragment;
    if (destino) {
      document.getElementById(destino)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  async cargar(): Promise<void> {
    this.cargando.set(true);
    this.error.set(false);

    try {
      const estado = await this.confianza.miConfianza();
      this.estado.set(estado);

      if (this.confianza.subioDeNivel(estado.nivel)) {
        // El aviso se muestra en esta misma pantalla, en la tarjeta del nivel.
        this.subio.set(true);
      }

      // Cupo e historial fallan por su cuenta sin tapar el nivel.
      void this.confianza
        .miCupoDeHoy(estado.nivel)
        .then((cupo) => this.cupo.set(cupo))
        .catch(() => this.cupo.set(null));
      void this.cargarHistorial();
    } catch {
      this.error.set(true);
    } finally {
      this.cargando.set(false);
    }
  }

  private async cargarHistorial(): Promise<void> {
    try {
      const { reportes } = await this.queryService.getMyReports(REPORTES_PARA_HISTORIAL);
      this.historial.set(
        reportes
          .filter((r) => r.validacion?.veredicto === 'real' || r.validacion?.veredicto === 'falso')
          .map((r) => this.evento(r))
          .sort((a, b) => (b.fecha?.getTime() ?? 0) - (a.fecha?.getTime() ?? 0)),
      );
    } catch {
      this.historial.set(null);
    }
  }

  private evento(reporte: Report): EventoPuntos {
    const v = reporte.validacion!;
    const veredicto = v.veredicto as 'real' | 'falso';

    return {
      reportId: reporte.id,
      descripcion: reporte.descripcion.slice(0, 70),
      veredicto,
      // veredictoPuntos guarda lo que de verdad se aplicó (0 en el tope de 760).
      puntos:
        typeof v.veredictoPuntos === 'number'
          ? v.veredictoPuntos
          : veredicto === 'real'
            ? PARAMETROS_CONFIANZA.puntosPorReporteReal
            : PARAMETROS_CONFIANZA.puntosPorReporteFalso,
      fecha: v.veredictoAt instanceof Timestamp ? v.veredictoAt.toDate() : null,
    };
  }

  fecha(valor: Date | null): string {
    return valor
      ? valor.toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' })
      : 'Fecha no registrada';
  }
}
