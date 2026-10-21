import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { addIcons } from 'ionicons';
import { albumsOutline, checkmarkDoneOutline } from 'ionicons/icons';

import { TarjetaResumenComponent } from '../../../compartido/tarjeta-resumen';
import { UserProfile } from '../../../models/user-profile.model';
import { ResumenGestion, ResumenGestionService } from '../datos/resumen-gestion.service';

/**
 * «Por atender» en el inicio de operadores y administradores (ranura
 * `inicio.resumen`): reportes abiertos, cuántos siguen sin revisar y cuántos
 * llegaron hoy. Lleva a la bandeja de gestión. Un ciudadano no la ve.
 */
@Component({
  selector: 'app-resumen-gestion',
  standalone: true,
  imports: [TarjetaResumenComponent],
  template: `
    @if (resumen(); as r) {
      <app-tarjeta-resumen
        [icono]="r.abiertos === 0 ? 'checkmark-done-outline' : 'albums-outline'"
        [titulo]="titulo()"
        [detalle]="detalle(r)"
        [nota]="r.nuevosHoy > 0 ? r.nuevosHoy + (r.nuevosHoy === 1 ? ' nuevo hoy' : ' nuevos hoy') : null"
        enlace="/admin-reports"
      />
    }
  `,
})
export class ResumenGestionComponent {
  private readonly servicio = inject(ResumenGestionService);

  /** Entrada de la ranura; al volver al inicio llega de nuevo y se relee. */
  readonly perfil = input<UserProfile | null>(null);

  protected readonly resumen = signal<ResumenGestion | null>(null);
  protected readonly titulo = computed(() =>
    this.perfil()?.role === 'operador' ? 'Por atender en tu organismo' : 'Por atender',
  );

  constructor() {
    addIcons({ albumsOutline, checkmarkDoneOutline });

    effect(() => {
      const perfil = this.perfil();
      void this.cargar(perfil);
    });
  }

  protected detalle(r: ResumenGestion): string {
    if (r.abiertos === 0) return 'Todo al día: no hay reportes abiertos';
    const abiertos = `${r.abiertos} ${r.abiertos === 1 ? 'abierto' : 'abiertos'}`;
    return r.sinRevisar > 0 ? `${abiertos} · ${r.sinRevisar} sin revisar` : abiertos;
  }

  private async cargar(perfil: UserProfile | null): Promise<void> {
    try {
      if (perfil?.role === 'admin') {
        this.resumen.set(await this.servicio.deAdministrador());
      } else if (perfil?.role === 'operador' && perfil.operadorId) {
        this.resumen.set(await this.servicio.deOperador(perfil.operadorId));
      } else {
        this.resumen.set(null);
      }
    } catch {
      // Sin red el inicio sigue igual, solo sin esta tarjeta.
      this.resumen.set(null);
    }
  }
}
