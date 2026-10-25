import { TestBed } from '@angular/core/testing';
import { afterEach } from 'vitest';

import { ThemeService } from '../../services/theme.service';
import { ThemeToggleComponent } from './theme-toggle.component';
import { usarEntornoDePrueba } from '../../../testing';

usarEntornoDePrueba();

describe('ThemeToggleComponent', () => {
  afterEach(() => {
    localStorage.removeItem('ciudad-alerta.tema');
    document.documentElement.classList.remove('tema-claro', 'tema-transicion');
  });

  it('dice a qué tema cambia y cambia al tocarlo', () => {
    localStorage.setItem('ciudad-alerta.tema', 'oscuro');
    const fixture = TestBed.createComponent(ThemeToggleComponent);
    fixture.detectChanges();
    const boton = fixture.nativeElement.querySelector('ion-button') as HTMLElement;

    expect(boton.getAttribute('aria-label')).toBe('Cambiar a tema claro');

    boton.click();
    fixture.detectChanges();

    expect(TestBed.inject(ThemeService).tema()).toBe('claro');
    expect(boton.getAttribute('aria-label')).toBe('Cambiar a tema oscuro');
  });
});
