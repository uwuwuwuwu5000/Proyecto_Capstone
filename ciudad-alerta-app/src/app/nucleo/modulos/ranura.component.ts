import { NgComponentOutlet } from '@angular/common';
import { Component, Type, effect, inject, input, signal } from '@angular/core';

import { ModulosService } from './modulos.service';
import { NombreRanura } from './ranuras';

/**
 * Lugar de una pantalla que llenan otros módulos.
 *
 *   <app-ranura nombre="tarjeta-reporte.insignias" [entradas]="{ reporte: item }" />
 *
 * Si ningún módulo activo aporta a la ranura, muestra lo que la pantalla puso
 * dentro de la etiqueta. Las entradas de cada ranura están en `ranuras.ts`.
 */
@Component({
  selector: 'app-ranura',
  standalone: true,
  imports: [NgComponentOutlet],
  template: `
    @if (componentes(); as lista) {
      @for (componente of lista; track $index) {
        <ng-container *ngComponentOutlet="componente; inputs: entradas()" />
      } @empty {
        <ng-content />
      }
    }
  `,
  styles: `
    :host {
      display: contents;
    }
  `,
})
export class RanuraComponent {
  private readonly modulos = inject(ModulosService);

  readonly nombre = input.required<NombreRanura>();
  readonly entradas = input<Record<string, unknown>>({});

  /** null mientras se descargan; lista vacía si nadie aporta. */
  protected readonly componentes = signal<Type<unknown>[] | null>(null);

  constructor() {
    effect(() => {
      const nombre = this.nombre();
      this.componentes.set(null);

      this.modulos
        .componentesDeRanura(nombre)
        .then((lista) => {
          if (this.nombre() === nombre) this.componentes.set(lista);
        })
        .catch(() => {
          if (this.nombre() === nombre) this.componentes.set([]);
        });
    });
  }
}
