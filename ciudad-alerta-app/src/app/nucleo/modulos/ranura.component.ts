import { NgComponentOutlet } from '@angular/common';
import { Component, DestroyRef, Injector, Type, afterNextRender, effect, inject, input, signal } from '@angular/core';

import { EsperaDePantalla } from '../carga/espera-de-pantalla';
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

  private readonly injector = inject(Injector);
  /**
   * Si la pantalla espera a tener todo (EsperaDePantalla), la ranura cuenta
   * como pendiente mientras descarga sus piezas. Avisa que terminó después de
   * dibujarlas, cuando cada pieza ya se registró con lo suyo.
   */
  private readonly carga = inject(EsperaDePantalla, { optional: true })?.registrar('ranura');

  /**
   * La pantalla puede cerrarse antes de que lleguen las piezas (al volver
   * atrás enseguida, o al terminar una prueba). Entonces no se dibuja nada:
   * su injector ya no existe y afterNextRender fallaría (NG0205).
   */
  private destruida = false;

  constructor() {
    inject(DestroyRef).onDestroy(() => (this.destruida = true));

    effect(() => {
      const nombre = this.nombre();
      this.componentes.set(null);
      this.carga?.pendiente();

      const mostrar = (lista: Type<unknown>[]): void => {
        if (this.destruida || this.nombre() !== nombre) return;
        this.componentes.set(lista);
        afterNextRender(() => this.carga?.listo(), { injector: this.injector });
      };

      // Dos argumentos, no .catch(): un error al mostrar no debe volver a
      // intentar mostrar la lista vacía.
      this.modulos.componentesDeRanura(nombre).then(mostrar, () => mostrar([]));
    });
  }
}
