import { Component, Type, input } from '@angular/core';

import { EntradaModulo, ModuloApp } from '../app/nucleo/modulos';

/**
 * Módulos ficticios para probar el núcleo (registro, ModulosService,
 * ranuras) sin depender de los módulos reales.
 */

/** Pieza mínima para una ranura: muestra el texto que recibe. */
@Component({
  selector: 'app-pieza-de-prueba',
  standalone: true,
  template: `<span class="pieza">{{ etiqueta() }}</span>`,
})
export class PiezaDePruebaComponent {
  readonly etiqueta = input('pieza');
}

/** Un módulo con lo mínimo, más lo que se le indique. */
export function moduloDePrueba(id: string, extra: Partial<ModuloApp> = {}): ModuloApp {
  return { id, nombre: `Módulo ${id}`, descripcion: `Módulo de prueba ${id}.`, ...extra };
}

export function entrada(modulo: ModuloApp, activo = true): EntradaModulo {
  return { modulo, activo };
}

/** Cargador de ranura que entrega un componente ya disponible. */
export const cargarPieza = (componente: Type<unknown> = PiezaDePruebaComponent) => () =>
  Promise.resolve(componente);
