import { Component, computed, input } from '@angular/core';

import { VERSION_APP } from '../../../environments/version';

/**
 * Pie con la versión instalada y, opcionalmente, el aviso de versión de prueba.
 *
 * La versión la escribe scripts/apk-demo.mjs en cada build del APK. Sirve para
 * que un tester diga exactamente qué versión tiene cuando reporta un error, y
 * para que el equipo confirme que la actualización se instaló.
 *
 * Uso:
 *   <app-version-demo [conAviso]="true" />   en login (aviso completo)
 *   <app-version-demo />                      en inicio (solo la versión)
 */
@Component({
  selector: 'app-version-demo',
  standalone: true,
  template: `
    @if (conAviso() && version.demo) {
      <p class="aviso" role="note">
        <strong>Versión de prueba.</strong>
        Los reportes que envíes los ve el equipo de Ciudad Alerta y no llegan
        todavía a ninguna municipalidad. Los datos pueden borrarse al terminar
        la prueba.
      </p>
    }
    <p class="version">{{ texto() }}</p>
  `,
  styles: `
    :host {
      display: block;
      margin-top: 24px;
      text-align: center;
    }
    .aviso {
      margin: 0 auto 8px;
      max-width: 34rem;
      padding: 10px 12px;
      border-radius: 8px;
      font-size: 0.85rem;
      line-height: 1.4;
      color: var(--ion-color-step-800, var(--ion-text-color));
      background: var(--ion-color-step-50, rgba(127, 127, 127, 0.08));
      text-align: left;
    }
    .version {
      margin: 0;
      font-size: 0.75rem;
      color: var(--ion-color-medium);
      font-variant-numeric: tabular-nums;
    }
  `,
})
export class VersionDemoComponent {
  /** Muestra el aviso de versión de prueba sobre el número de versión. */
  readonly conAviso = input(false);

  protected readonly version = VERSION_APP;

  protected readonly texto = computed(() => {
    const v = this.version;
    if (!v.codigo) return 'Ciudad Alerta · versión de desarrollo';
    const fecha = v.fecha
      ? new Date(v.fecha).toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' })
      : '';
    return `Ciudad Alerta ${v.demo ? 'demo ' : ''}${v.nombre} (${v.codigo})${fecha ? ' · ' + fecha : ''}`;
  });
}
