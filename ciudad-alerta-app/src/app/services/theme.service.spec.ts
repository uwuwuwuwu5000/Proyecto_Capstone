import { DOCUMENT } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { afterEach, vi } from 'vitest';

import { ThemeService } from './theme.service';
import { usarEntornoDePrueba } from '../../testing';

usarEntornoDePrueba();

const CLAVE = 'ciudad-alerta.tema';

describe('ThemeService', () => {
  let raiz: HTMLElement;

  function crear(preferenciaSistema: 'light' | 'dark' = 'dark'): ThemeService {
    vi.spyOn(window, 'matchMedia').mockImplementation(
      (consulta: string) => ({ matches: consulta.includes(preferenciaSistema), media: consulta }) as MediaQueryList,
    );
    raiz = TestBed.inject(DOCUMENT).documentElement;
    return TestBed.inject(ThemeService);
  }

  afterEach(() => {
    localStorage.removeItem(CLAVE);
    document.documentElement.classList.remove('tema-claro', 'tema-transicion');
    vi.restoreAllMocks();
  });

  it('sin elección guardada sigue al teléfono', () => {
    expect(crear('light').tema()).toBe('claro');
    expect(raiz.classList.contains('tema-claro')).toBe(true);
  });

  it('con el teléfono en oscuro empieza oscuro', () => {
    expect(crear('dark').tema()).toBe('oscuro');
    expect(raiz.classList.contains('tema-claro')).toBe(false);
  });

  it('lo elegido en la app gana sobre el teléfono y se recuerda', () => {
    localStorage.setItem(CLAVE, 'oscuro');
    const tema = crear('light');
    expect(tema.tema()).toBe('oscuro');

    tema.alternar();

    expect(tema.tema()).toBe('claro');
    expect(raiz.classList.contains('tema-claro')).toBe(true);
    expect(localStorage.getItem(CLAVE)).toBe('claro');
  });

  it('un valor guardado inválido se ignora', () => {
    localStorage.setItem(CLAVE, 'morado');
    expect(crear('dark').tema()).toBe('oscuro');
  });

  it('cambia el color de la barra del sistema', () => {
    const meta = document.createElement('meta');
    meta.name = 'theme-color';
    document.head.appendChild(meta);

    crear('dark').establecer('claro');

    expect(meta.getAttribute('content')).toBe('#f8fafc');
    meta.remove();
  });

  it('sin almacenamiento disponible, cambia igual durante la sesión', () => {
    const tema = crear('dark');
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('bloqueado', 'SecurityError');
    });

    expect(() => tema.establecer('claro')).not.toThrow();
    expect(tema.tema()).toBe('claro');
  });
});
