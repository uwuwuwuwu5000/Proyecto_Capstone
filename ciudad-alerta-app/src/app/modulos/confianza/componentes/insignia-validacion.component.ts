import { Component, computed, input } from '@angular/core';

import { Report } from '../../../models/report.model';
import { porcentajeDeValidacion, validacionCompleta } from '@ciudad-alerta/comun';

/**
 * A5 · Estado de validación en una tarjeta de reporte: «Validado», el
 * porcentaje o el veredicto. Llena la ranura `tarjeta-reporte.insignias`.
 * Los reportes sin `validacion` no muestran nada (A5.4).
 */
@Component({
  selector: 'app-insignia-validacion',
  standalone: true,
  template: `
    @if (texto(); as t) {
      <span class="insignia" [class.insignia--fuerte]="fuerte()">{{ t }}</span>
    }
  `,
  styles: `
    .insignia {
      display: inline-block;
      margin-top: 0.2rem;
      padding: 0.05rem 0.45rem;
      border: 1px solid var(--ca-line);
      border-radius: 999px;
      font-size: 0.7rem;
      color: var(--ca-muted);
    }

    .insignia--fuerte {
      border-color: var(--ca-signal);
      color: var(--ca-signal);
      font-weight: 700;
    }
  `,
})
export class InsigniaValidacionComponent {
  readonly reporte = input.required<Report>();

  private readonly validacion = computed(() => validacionCompleta(this.reporte().validacion));

  /** Con marca de texto ✓, no solo de color. */
  protected readonly texto = computed(() => {
    const v = this.validacion();

    if (v.veredicto === 'real') return '✓ Verificado como real';
    if (v.veredicto === 'falso') return 'Marcado como falso';
    if (v.validado) return '✓ Validado por la comunidad';

    const porcentaje = porcentajeDeValidacion(this.reporte().validacion);
    return porcentaje > 0 ? `Verificación ${porcentaje} %` : null;
  });

  protected readonly fuerte = computed(
    () => this.validacion().validado || this.validacion().veredicto === 'real',
  );
}
