import { TestBed } from '@angular/core/testing';
import { afterEach, vi } from 'vitest';

import { ArranqueService } from './arranque';
import { usarEntornoDePrueba } from '../../../testing';

usarEntornoDePrueba();

describe('ArranqueService', () => {
  afterEach(() => {
    document.getElementById('arranque')?.remove();
    vi.useRealTimers();
  });

  it('quita la pantalla de arranque con un fundido, una sola vez', () => {
    vi.useFakeTimers();
    const arranque = document.createElement('div');
    arranque.id = 'arranque';
    document.body.appendChild(arranque);
    const servicio = TestBed.inject(ArranqueService);

    servicio.terminar();
    expect(arranque.classList.contains('arranque--fuera')).toBe(true);
    expect(document.getElementById('arranque')).not.toBeNull();

    vi.advanceTimersByTime(350);
    expect(document.getElementById('arranque')).toBeNull();

    expect(() => servicio.terminar()).not.toThrow();
  });

  it('sin pantalla de arranque (pruebas, navegador) no falla', () => {
    expect(() => TestBed.inject(ArranqueService).terminar()).not.toThrow();
  });
});
