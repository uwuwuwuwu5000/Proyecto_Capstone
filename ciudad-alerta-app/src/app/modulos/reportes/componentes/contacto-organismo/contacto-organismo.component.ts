import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { callOutline, locationOutline, mailOutline } from 'ionicons/icons';
import { enlaceCorreo, etiquetaCategoria } from '@ciudad-alerta/comun';

import { Report } from '../../../../models/report.model';
import { ContactoOrganismo, ContactoOrganismoService } from '../../datos/contacto-organismo.service';

/**
 * «Contactar al organismo» en el detalle de un reporte: llamar o escribir a
 * quien lo atiende, con el teléfono y el correo del operador asignado. El
 * correo ya trae el asunto y el código del reporte.
 */
@Component({
  selector: 'app-contacto-organismo',
  standalone: true,
  imports: [IonIcon],
  template: `
    <section class="contacto" aria-labelledby="titulo-contacto">
      <h2 id="titulo-contacto">Contactar al organismo</h2>

      @switch (estado()) {
        @case ('cargando') {
          <p class="nota">Buscando cómo contactar a {{ organismo() }}…</p>
        }
        @case ('sin-operador') {
          <p class="nota">
            {{ organismo() }} todavía no tiene a alguien asignado a este reporte. Cuando lo tenga, aquí
            verás cómo contactarlo; mientras, sigue el estado en esta pantalla y en tus avisos.
          </p>
        }
        @case ('error') {
          <p class="nota">No pudimos cargar los datos de contacto. Revisa tu conexión.</p>
        }
        @default {
          @if (contacto(); as c) {
            @if (c.telefono || c.correo) {
              <div class="contacto__acciones">
                @if (c.telefono) {
                  <a class="boton" [href]="c.telefono">
                    <ion-icon name="call-outline" aria-hidden="true"></ion-icon>
                    Llamar
                    <span class="boton__detalle">{{ c.telefonoVisible }}</span>
                  </a>
                }
                @if (c.correo) {
                  <a class="boton" [href]="correo(c)">
                    <ion-icon name="mail-outline" aria-hidden="true"></ion-icon>
                    Escribir
                    <span class="boton__detalle">{{ c.correo }}</span>
                  </a>
                }
              </div>
            } @else {
              <p class="nota">{{ organismo() }} aún no publicó un teléfono ni un correo.</p>
            }
            @if (c.direccion) {
              <p class="nota">
                <ion-icon name="location-outline" aria-hidden="true"></ion-icon>
                Atención presencial: {{ c.direccion }}
              </p>
            }
          }
        }
      }
    </section>
  `,
  styles: `
    :host {
      display: block;
    }
    .contacto {
      display: flex;
      flex-direction: column;
      gap: 0.6rem;
    }
    h2 {
      margin: 0;
      font-size: 1rem;
      font-weight: 700;
    }
    .nota {
      display: flex;
      gap: 0.35rem;
      margin: 0;
      font-size: 0.84rem;
      line-height: 1.5;
      color: var(--ca-muted);
    }
    .contacto__acciones {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0.5rem;
    }
    .boton {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.2rem;
      padding: 0.7rem 0.5rem;
      border: 1px solid var(--ca-line);
      border-radius: 10px;
      background: var(--ca-surface);
      color: var(--ca-ink);
      font-weight: 600;
      font-size: 0.9rem;
      text-decoration: none;
      text-align: center;
    }
    .boton ion-icon {
      font-size: 1.3rem;
      color: var(--ca-signal);
    }
    .boton__detalle {
      max-width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: 0.74rem;
      font-weight: 400;
      color: var(--ca-muted);
    }
  `,
})
export class ContactoOrganismoComponent {
  private readonly servicio = inject(ContactoOrganismoService);

  readonly reporte = input.required<Report>();

  protected readonly contacto = signal<ContactoOrganismo | null>(null);
  protected readonly estado = signal<'cargando' | 'listo' | 'sin-operador' | 'error'>('cargando');
  protected readonly organismo = computed(() => this.reporte().organismo?.nombre ?? 'El organismo');

  constructor() {
    addIcons({ callOutline, locationOutline, mailOutline });

    effect(() => {
      const operadorId = this.reporte().operadorId ?? null;
      void this.cargar(operadorId);
    });
  }

  protected correo(c: ContactoOrganismo): string {
    return enlaceCorreo(c.correo!, this.reporte(), etiquetaCategoria);
  }

  private async cargar(operadorId: string | null): Promise<void> {
    if (!operadorId) {
      this.estado.set('sin-operador');
      return;
    }
    this.estado.set('cargando');
    try {
      const contacto = await this.servicio.deOperador(operadorId);
      this.contacto.set(contacto);
      this.estado.set(contacto ? 'listo' : 'sin-operador');
    } catch {
      this.estado.set('error');
    }
  }
}
