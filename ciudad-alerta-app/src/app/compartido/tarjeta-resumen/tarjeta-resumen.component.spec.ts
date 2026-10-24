import { TestBed } from '@angular/core/testing';

import { usarEntornoDePrueba } from '../../../testing';
import { TarjetaResumenComponent } from './tarjeta-resumen.component';

usarEntornoDePrueba();

describe('TarjetaResumenComponent', () => {
  function crear(entradas: Record<string, unknown>): HTMLElement {
    const fixture = TestBed.createComponent(TarjetaResumenComponent);
    for (const [nombre, valor] of Object.entries(entradas)) fixture.componentRef.setInput(nombre, valor);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('muestra título, detalle y nota, y enlaza a la pantalla', () => {
    const html = crear({
      icono: 'document-text-outline',
      titulo: 'Tus reportes',
      detalle: '2 en curso',
      nota: 'hace 2 h',
      enlace: '/my-reports',
    });

    expect(html.querySelector('strong')?.textContent).toBe('Tus reportes');
    expect(html.querySelector('.tarjeta__detalle')?.textContent).toBe('2 en curso');
    expect(html.querySelector('.tarjeta__nota')?.textContent).toBe('hace 2 h');
    expect(html.querySelector('a')?.getAttribute('href')).toBe('/my-reports');
  });

  it('sin detalle ni nota, no deja líneas vacías', () => {
    const html = crear({ icono: 'document-text-outline', titulo: 'Solo título', enlace: '/x' });
    expect(html.querySelector('.tarjeta__detalle')).toBeNull();
    expect(html.querySelector('.tarjeta__nota')).toBeNull();
  });
});
