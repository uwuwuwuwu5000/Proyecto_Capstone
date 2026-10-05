import { DOCUMENT } from '@angular/common';
import { Injectable, inject, signal } from '@angular/core';

export type Tema = 'oscuro' | 'claro';

/** Clave con la que se recuerda la elección entre sesiones. */
const CLAVE_ALMACENAMIENTO = 'ciudad-alerta.tema';

/** Color de la barra del sistema en cada tema, para la etiqueta theme-color. */
const COLOR_BARRA: Readonly<Record<Tema, string>> = {
  oscuro: '#111827',
  claro: '#f8fafc',
};

/**
 * Tema visual de la aplicación.
 *
 * El tema se aplica con una clase en <html>, y todas las hojas de estilo leen
 * variables CSS que cambian de valor según esa clase. Ningún componente
 * necesita saber qué tema está activo.
 *
 * La preferencia se guarda en localStorage, que dentro de la WebView de
 * Capacitor persiste entre aperturas de la app. Si el usuario nunca eligió, se
 * respeta la preferencia del sistema operativo.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly documento = inject(DOCUMENT);

  readonly tema = signal<Tema>(this.leerPreferencia());

  constructor() {
    this.aplicar(this.tema(), false);
  }

  alternar(): void {
    this.establecer(this.tema() === 'oscuro' ? 'claro' : 'oscuro');
  }

  establecer(tema: Tema): void {
    this.tema.set(tema);
    this.aplicar(tema, true);

    try {
      localStorage.setItem(CLAVE_ALMACENAMIENTO, tema);
    } catch {
      // Navegación privada o almacenamiento lleno: el tema funciona igual
      // durante la sesión, solo que no se recordará.
    }
  }

  private leerPreferencia(): Tema {
    try {
      const guardado = localStorage.getItem(CLAVE_ALMACENAMIENTO);

      if (guardado === 'oscuro' || guardado === 'claro') {
        return guardado;
      }
    } catch {
      // Sin acceso al almacenamiento se usa la preferencia del sistema.
    }

    const prefiereClaro =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-color-scheme: light)').matches;

    return prefiereClaro ? 'claro' : 'oscuro';
  }

  private aplicar(tema: Tema, animar: boolean): void {
    const raiz = this.documento.documentElement;

    // La transición solo se activa al alternar: al arrancar la app no debe
    // verse un fundido desde el tema equivocado.
    if (animar) {
      raiz.classList.add('tema-transicion');
      setTimeout(() => raiz.classList.remove('tema-transicion'), 300);
    }

    raiz.classList.toggle('tema-claro', tema === 'claro');

    const meta = this.documento.querySelector('meta[name="theme-color"]');
    meta?.setAttribute('content', COLOR_BARRA[tema]);
  }
}
