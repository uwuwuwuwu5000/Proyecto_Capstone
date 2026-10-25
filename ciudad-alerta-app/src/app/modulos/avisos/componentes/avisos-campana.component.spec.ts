import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { AvisosService } from '../datos/avisos.service';
import { AvisosCampanaComponent } from './avisos-campana.component';
import { usarEntornoDePrueba } from '../../../../testing';

usarEntornoDePrueba();

describe('AvisosCampanaComponent', () => {
  const noVistos = signal(0);

  function montar(total: number) {
    noVistos.set(total);
    TestBed.configureTestingModule({ providers: [{ provide: AvisosService, useValue: { noVistos } }] });
    const fixture = TestBed.createComponent(AvisosCampanaComponent);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('sin avisos no muestra número, y lo dice al lector de pantalla', () => {
    const campana = montar(0);
    expect(campana.querySelector('ion-badge')).toBeNull();
    expect(campana.querySelector('[aria-label]')?.getAttribute('aria-label')).toBe('Avisos, ninguno sin ver');
  });

  it('con avisos muestra cuántos', () => {
    expect(montar(3).querySelector('ion-badge')?.textContent?.trim()).toBe('3');
  });

  it('desde 10 muestra «9+», pero el lector de pantalla oye el total', () => {
    const muchos = montar(14);
    expect(muchos.querySelector('ion-badge')?.textContent?.trim()).toBe('9+');
    expect(muchos.querySelector('[aria-label]')?.getAttribute('aria-label')).toBe('Avisos, 14 sin ver');
  });
});
