import { Component, input } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { PiezaDePruebaComponent, entrada, moduloDePrueba } from '../../../testing/modulos-de-prueba';
import { EsperaDePantalla } from '../carga/espera-de-pantalla';
import { EntradaModulo } from './modulo.model';
import { CONFIGURACION_MODULOS } from './modulos.service';
import { RanuraComponent } from './ranura.component';
import { NombreRanura, RANURAS } from './ranuras';
import { usarEntornoDePrueba } from '../../../testing';

@Component({
  standalone: true,
  imports: [RanuraComponent],
  template: `
    <app-ranura [nombre]="nombre()" [entradas]="{ etiqueta: etiqueta() }">
      <p class="respaldo">contenido por defecto</p>
    </app-ranura>
  `,
})
class PantallaDePruebaComponent {
  readonly nombre = input<NombreRanura>(RANURAS.inicioResumen);
  readonly etiqueta = input('hola');
}

/**
 * Toda pieza de una ranura debe declarar un input por cada entrada de la
 * ranura, aunque no la use (contrato de ranuras.ts): NgComponentOutlet falla
 * con NG0303 si recibe una entrada que el componente no tiene.
 */
@Component({
  selector: 'app-otra-pieza',
  standalone: true,
  template: `<span class="otra">otra</span>`,
})
class OtraPiezaComponent {
  readonly etiqueta = input('');
}

usarEntornoDePrueba();

describe('RanuraComponent', () => {
  async function pantalla(config: EntradaModulo[], etiqueta = 'hola'): Promise<HTMLElement> {
    TestBed.configureTestingModule({ providers: [{ provide: CONFIGURACION_MODULOS, useValue: config }] });
    const fixture = TestBed.createComponent(PantallaDePruebaComponent);
    fixture.componentRef.setInput('etiqueta', etiqueta);
    fixture.detectChanges();
    // La ranura descarga sus piezas con una promesa: se deja que termine y se
    // vuelve a dibujar.
    await new Promise((listo) => setTimeout(listo));
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('sin módulos que aporten, muestra el contenido por defecto de la pantalla', async () => {
    const html = await pantalla([entrada(moduloDePrueba('a'))]);
    expect(html.querySelector('.respaldo')?.textContent).toBe('contenido por defecto');
  });

  it('con un aporte, lo muestra con las entradas de la pantalla y oculta el respaldo', async () => {
    const html = await pantalla(
      [
        entrada(
          moduloDePrueba('a', {
            ranuras: [{ ranura: RANURAS.inicioResumen, cargar: () => Promise.resolve(PiezaDePruebaComponent) }],
          }),
        ),
      ],
      'nivel 3',
    );
    expect(html.querySelector('.pieza')?.textContent).toBe('nivel 3');
    expect(html.querySelector('.respaldo')).toBeNull();
  });

  it('varios aportes aparecen en su orden; los de módulos apagados, no', async () => {
    const html = await pantalla([
      entrada(moduloDePrueba('a', { ranuras: [{ ranura: RANURAS.inicioResumen, orden: 2, cargar: () => Promise.resolve(OtraPiezaComponent) }] })),
      entrada(moduloDePrueba('b', { ranuras: [{ ranura: RANURAS.inicioResumen, orden: 1, cargar: () => Promise.resolve(PiezaDePruebaComponent) }] })),
      entrada(moduloDePrueba('c', { ranuras: [{ ranura: RANURAS.inicioResumen, cargar: () => Promise.resolve(OtraPiezaComponent) }] }), false),
    ]);
    const piezas = [...html.querySelectorAll('.pieza, .otra')].map((e) => e.className);
    expect(piezas).toEqual(['pieza', 'otra']);
  });

  it('si la pieza no se puede descargar (sin red), queda el contenido por defecto', async () => {
    const html = await pantalla([
      entrada(moduloDePrueba('a', { ranuras: [{ ranura: RANURAS.inicioResumen, cargar: () => Promise.reject(new Error('sin red')) }] })),
    ]);
    expect(html.querySelector('.respaldo')).not.toBeNull();
  });

  it('si la pantalla espera, la ranura cuenta como pendiente hasta dibujar sus piezas', async () => {
    let descargar: (pieza: typeof PiezaDePruebaComponent) => void = () => undefined;
    const config = [
      entrada(
        moduloDePrueba('a', {
          ranuras: [
            {
              ranura: RANURAS.inicioResumen,
              cargar: () => new Promise<typeof PiezaDePruebaComponent>((resolver) => (descargar = resolver)),
            },
          ],
        }),
      ),
    ];
    TestBed.configureTestingModule({
      providers: [{ provide: CONFIGURACION_MODULOS, useValue: config }, EsperaDePantalla],
    });
    const espera = TestBed.inject(EsperaDePantalla);
    const fixture = TestBed.createComponent(PantallaDePruebaComponent);
    fixture.detectChanges();

    expect(espera.faltan()).toEqual(['ranura']);

    descargar(PiezaDePruebaComponent);
    await new Promise((listo) => setTimeout(listo));
    fixture.detectChanges();
    await fixture.whenStable();

    expect(espera.lista()).toBe(true);
    expect((fixture.nativeElement as HTMLElement).querySelector('.pieza')).not.toBeNull();
    espera.ngOnDestroy();
  });
});
