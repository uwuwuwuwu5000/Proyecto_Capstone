import { TestBed } from '@angular/core/testing';

import { AvisoEmergenciaComponent } from './aviso-emergencia.component';
import { usarEntornoDePrueba } from '../../../../../testing';

usarEntornoDePrueba();

describe('AvisoEmergenciaComponent', () => {
  function montar(categoria: string): HTMLElement {
    const fixture = TestBed.createComponent(AvisoEmergenciaComponent);
    fixture.componentRef.setInput('categoria', categoria);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('en una categoría de riesgo ofrece llamar a 133, 132 y 131', () => {
    const html = montar('arbol_peligroso');
    expect(html.textContent).toContain('¿Hay peligro ahora?');
    expect([...html.querySelectorAll('a')].map((a) => a.getAttribute('href'))).toEqual(['tel:133', 'tel:132', 'tel:131']);
  });

  it('en las demás no muestra nada', () => {
    expect(montar('microbasural').textContent?.trim()).toBe('');
  });
});
