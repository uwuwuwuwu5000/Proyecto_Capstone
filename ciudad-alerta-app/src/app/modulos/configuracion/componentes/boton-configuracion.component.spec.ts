import { TestBed } from '@angular/core/testing';

import { BotonConfiguracionComponent } from './boton-configuracion.component';
import { usarEntornoDePrueba } from '../../../../testing';

usarEntornoDePrueba();

describe('BotonConfiguracionComponent (ranura cabecera.acciones)', () => {
  it('es un botón con nombre accesible que abre Configuración', () => {
    const fixture = TestBed.createComponent(BotonConfiguracionComponent);
    fixture.detectChanges();
    const boton = (fixture.nativeElement as HTMLElement).querySelector('ion-button')!;

    expect(boton.getAttribute('aria-label')).toBe('Configuración');
    expect(boton.querySelector('ion-icon')?.getAttribute('name')).toBe('settings-outline');
  });
});
