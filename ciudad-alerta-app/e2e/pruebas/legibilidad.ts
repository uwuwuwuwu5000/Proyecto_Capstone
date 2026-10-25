import { Page } from '@playwright/test';

/**
 * Revisa que lo que se ve en pantalla se pueda leer:
 *
 * - **Contraste** (WCAG AA): 4,5:1 para texto normal y 3:1 para texto grande
 *   (24 px, o 18,7 px en negrita). El fondo se calcula capa por capa bajo
 *   cada texto, atravesando el shadow DOM de Ionic. Si una capa es un
 *   degradado, se toma su color más desfavorable: así se habría detectado el
 *   login con letras claras sobre el degradado del tema claro.
 * - **Desborde**: nada se sale por el costado de la pantalla ni obliga a
 *   desplazarse de lado.
 *
 * Los textos deshabilitados, ocultos, transparentes o de mapas quedan fuera,
 * como en WCAG.
 */
export interface ProblemaDeLegibilidad {
  tipo: 'contraste' | 'desborde';
  texto: string;
  detalle: string;
}

export async function problemasDeLegibilidad(page: Page): Promise<ProblemaDeLegibilidad[]> {
  return page.evaluate(() => {
    type Rgba = [number, number, number, number];
    const problemas: { tipo: 'contraste' | 'desborde'; texto: string; detalle: string }[] = [];

    const lienzo = document.createElement('canvas').getContext('2d')!;
    /** Cualquier color CSS (rgb, color(srgb …), oklch, nombres) a RGBA 0–255. */
    function rgba(color: string): Rgba | null {
      const m = color.match(/rgba?\(([^)]+)\)/);
      if (m) {
        const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
        return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
      }
      lienzo.fillStyle = '#000';
      lienzo.fillStyle = color;
      lienzo.fillRect(0, 0, 1, 1);
      const d = lienzo.getImageData(0, 0, 1, 1).data;
      return [d[0], d[1], d[2], d[3] / 255];
    }
    function sobre(arriba: Rgba, abajo: Rgba): Rgba {
      const a = arriba[3];
      return [arriba[0] * a + abajo[0] * (1 - a), arriba[1] * a + abajo[1] * (1 - a), arriba[2] * a + abajo[2] * (1 - a), 1];
    }
    function luminancia([r, g, b]: Rgba): number {
      const c = [r, g, b].map((v) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    }
    function contraste(a: Rgba, b: Rgba): number {
      const [l1, l2] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
      return (l1 + 0.05) / (l2 + 0.05);
    }
    /** Colores de los degradados de una capa (background-image). */
    function coloresDeDegradado(imagen: string): Rgba[] {
      if (!imagen.includes('gradient(')) return [];
      return (imagen.match(/rgba?\([^)]+\)|color\([^)]+\)|oklch\([^)]+\)|#[0-9a-f]{3,8}/gi) ?? [])
        .map(rgba)
        .filter((c): c is Rgba => !!c && c[3] > 0);
    }

    /** Todas las capas en un punto, de arriba abajo, entrando a los shadow roots. */
    function capas(x: number, y: number): Element[] {
      const salida: Element[] = [];
      for (const el of document.elementsFromPoint(x, y)) {
        const sombra = (el as HTMLElement).shadowRoot;
        if (sombra) {
          for (const interno of sombra.elementsFromPoint(x, y)) {
            if (interno !== el && sombra.contains(interno) && !salida.includes(interno)) salida.push(interno);
          }
        }
        if (!salida.includes(el)) salida.push(el);
      }
      return salida;
    }

    /** Padre en el árbol que se pinta: un hijo de un componente cuelga de su <slot>. */
    function padre(n: Element): Element | null {
      return n.assignedSlot ?? n.parentElement ?? ((n.getRootNode() as ShadowRoot).host ?? null);
    }

    function opacidad(el: Element): number {
      let total = 1;
      for (let n: Element | null = el; n; n = padre(n)) total *= Number(getComputedStyle(n).opacity);
      return total;
    }

    function excluido(el: Element): boolean {
      return !!el.closest(
        '[disabled], [aria-disabled="true"], .leaflet-container, [aria-hidden="true"], ion-select-option, .sc-ion-input-md-h input::placeholder, ion-skeleton-text',
      );
    }

    const ancho = document.documentElement.clientWidth;
    if (document.documentElement.scrollWidth > ancho + 1) {
      problemas.push({ tipo: 'desborde', texto: '(página)', detalle: `la página mide ${document.documentElement.scrollWidth}px de ancho en una pantalla de ${ancho}px` });
    }

    const visibles = [...document.querySelectorAll('ion-router-outlet > .ion-page:not(.ion-page-hidden), ion-modal, ion-alert, ion-toast')];
    const raiz = visibles.length ? visibles : [document.body];

    const vistos = new Set<string>();
    for (const contenedor of raiz) {
      const recorrido = document.createTreeWalker(contenedor, NodeFilter.SHOW_TEXT);
      for (let nodo = recorrido.nextNode(); nodo; nodo = recorrido.nextNode()) {
        const texto = (nodo.textContent ?? '').replace(/\s+/g, ' ').trim();
        const el = nodo.parentElement;
        if (!texto || texto.length < 2 || !el || excluido(el)) continue;

        // Un texto dentro de un componente (ion-button, ion-segment-button) toma
        // el color de su <slot>, no el del componente.
        const slot = (nodo as Text).assignedSlot;
        const estilo = getComputedStyle(slot ?? el);
        if (estilo.visibility !== 'visible' || estilo.display === 'none' || Number(estilo.fontSize.replace('px', '')) < 6) continue;

        const rango = document.createRange();
        rango.selectNodeContents(nodo);
        const cajas = [...rango.getClientRects()].filter((c) => c.width > 1 && c.height > 1);
        if (!cajas.length) continue;
        const caja = cajas[0];
        // Fuera de la pantalla hacia abajo o arriba (se desplaza): no se revisa aquí.
        if (caja.bottom < 0 || caja.top > innerHeight) continue;

        const clave = `${texto}|${Math.round(caja.left)}|${Math.round(caja.top)}`;
        if (vistos.has(clave)) continue;
        vistos.add(clave);

        // Desborde lateral: el texto empieza o termina fuera de la pantalla y no
        // está dentro de algo que lo recorta (un título con «…») o que se
        // desplaza de lado a propósito, también dentro de un componente.
        const final = cajas.reduce((max, c) => Math.max(max, c.right), 0);
        let contenido = false;
        for (let n: Element | null = slot ?? el; n && n !== document.documentElement; n = padre(n)) {
          const en = getComputedStyle(n);
          const recorta = en.textOverflow === 'ellipsis' && en.overflowX !== 'visible';
          const franja = (en.overflowX === 'auto' || en.overflowX === 'scroll') && n.scrollWidth > n.clientWidth + 1;
          if (recorta || franja) contenido = true;
        }
        if (!contenido && (caja.left < -1 || final > ancho + 1)) {
          problemas.push({ tipo: 'desborde', texto, detalle: `se sale de la pantalla (de ${Math.round(caja.left)} a ${Math.round(final)}px, ancho ${ancho}px)` });
        }

        // Contraste en el centro de la primera línea.
        const x = Math.min(Math.max(caja.left + Math.min(caja.width, 40) / 2, 1), ancho - 1);
        const y = caja.top + caja.height / 2;
        if (y < 0 || y > innerHeight) continue;
        const pila = capas(x, y);
        const indice = pila.findIndex(
          (capa) => capa === el || capa.contains(el) || el.contains(capa) || !!el.shadowRoot?.contains(capa) || capa === slot,
        );
        if (indice < 0) continue; // tapado por otra cosa (un aviso, un menú): no se ve.

        const op = opacidad(el);
        const colorTexto = rgba(estilo.color);
        if (!colorTexto || colorTexto[3] * op < 0.05) continue;

        // Capas desde el propio elemento hacia abajo; las semitransparentes se acumulan.
        const pendientes: Rgba[] = [];
        let fondos: Rgba[] | null = null;
        for (const capa of pila.slice(indice)) {
          const ec = getComputedStyle(capa);
          const degradado = coloresDeDegradado(ec.backgroundImage);
          if (degradado.length) {
            fondos = degradado.map((c) => (c[3] < 1 ? sobre(c, [255, 255, 255, 1]) : c));
            break;
          }
          const color = rgba(ec.backgroundColor);
          if (color && color[3] > 0) {
            if (color[3] >= 1) {
              fondos = [color];
              break;
            }
            pendientes.push(color);
          }
        }
        fondos ??= [rgba(getComputedStyle(document.body).backgroundColor) ?? [255, 255, 255, 1]];
        if (fondos[0][3] < 1) fondos = [sobre(fondos[0], [255, 255, 255, 1])];

        const tamano = Number(estilo.fontSize.replace('px', ''));
        const grande = tamano >= 24 || (tamano >= 18.66 && Number(estilo.fontWeight) >= 700);
        const minimo = grande ? 3 : 4.5;

        let peor = Infinity;
        let peorFondo: Rgba = fondos[0];
        for (let fondo of fondos) {
          for (const capa of [...pendientes].reverse()) fondo = sobre(capa, fondo);
          const efectivo = sobre([colorTexto[0], colorTexto[1], colorTexto[2], colorTexto[3] * op], fondo);
          const ratio = contraste(efectivo, fondo);
          if (ratio < peor) {
            peor = ratio;
            peorFondo = fondo;
          }
        }
        if (peor < minimo) {
          const hex = (c: Rgba) => '#' + c.slice(0, 3).map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
          problemas.push({
            tipo: 'contraste',
            texto: texto.slice(0, 60),
            detalle: `contraste ${peor.toFixed(2)}:1 (mínimo ${minimo}:1) · texto ${hex(colorTexto)} sobre ${hex(peorFondo)} · ${tamano}px · <${el.tagName.toLowerCase()}${el.className ? ' class="' + String(el.className).slice(0, 60) + '"' : ''}>`,
          });
        }
      }
    }
    return problemas;
  });
}

/** Lista legible para el mensaje de error de una prueba. */
export function describir(problemas: ProblemaDeLegibilidad[]): string {
  return problemas.map((p) => `• [${p.tipo}] «${p.texto}»: ${p.detalle}`).join('\n');
}
