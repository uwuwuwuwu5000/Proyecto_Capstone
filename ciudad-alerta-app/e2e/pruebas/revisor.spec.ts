import { expect, test } from '@playwright/test';

import { controlesSinNombre } from './accesibilidad';
import { problemasDeLegibilidad } from './legibilidad';

/**
 * Pruebas del revisor de legibilidad, sin la app: si el revisor no detectara
 * estos casos, las pruebas de pantallas pasarían aunque hubiera problemas.
 */
test.describe('revisor de legibilidad', () => {
  test('detecta letras claras sobre un degradado que termina claro (el error del login)', async ({ page }) => {
    await page.setContent(`
      <body style="margin:0;background:#fff">
        <div style="height:600px;background:linear-gradient(180deg,#111827 0%,#e8eef4 100%);padding:20px">
          <p style="color:#a5b4c3;font-size:16px">Tu correo se usa solo para identificarte</p>
        </div>
      </body>`);
    const problemas = await problemasDeLegibilidad(page);
    expect(problemas.map((p) => p.tipo)).toContain('contraste');
    expect(problemas[0].texto).toContain('Tu correo');
  });

  test('acepta texto oscuro sobre fondo claro y texto claro sobre fondo oscuro', async ({ page }) => {
    await page.setContent(`
      <body style="margin:0;background:#f8fafc">
        <p style="color:#111827;font-size:16px">Texto oscuro sobre claro</p>
        <div style="background:#111827;padding:8px"><p style="color:#f8fafc">Texto claro sobre oscuro</p></div>
      </body>`);
    expect(await problemasDeLegibilidad(page)).toEqual([]);
  });

  test('suma las capas semitransparentes y la opacidad del texto', async ({ page }) => {
    await page.setContent(`
      <body style="margin:0;background:#111827">
        <div style="background:rgba(255,255,255,0.9);padding:8px">
          <p style="color:#f8fafc">Claro sobre un velo casi blanco</p>
        </div>
        <p style="color:#f8fafc;opacity:0.2">Casi invisible</p>
      </body>`);
    const textos = (await problemasDeLegibilidad(page)).map((p) => p.texto);
    expect(textos).toEqual(expect.arrayContaining(['Claro sobre un velo casi blanco', 'Casi invisible']));
  });

  test('entra al shadow DOM (como ion-button) para encontrar el fondo', async ({ page }) => {
    await page.setContent(`
      <body style="margin:0;background:#fff">
        <mi-boton>Entrar</mi-boton>
        <script>
          customElements.define('mi-boton', class extends HTMLElement {
            connectedCallback() {
              this.attachShadow({ mode: 'open' }).innerHTML =
                '<button style="background:#1ca9c9;color:inherit;border:0;padding:12px;font-size:16px"><slot></slot></button>';
              this.style.color = '#ffffff';
            }
          });
        </script>
      </body>`);
    // Blanco sobre el cian de la marca: 2,6:1, insuficiente.
    const problemas = await problemasDeLegibilidad(page);
    expect(problemas.map((p) => p.texto)).toContain('Entrar');
  });

  test('ignora lo deshabilitado y lo oculto a los lectores de pantalla', async ({ page }) => {
    await page.setContent(`
      <body style="margin:0;background:#fff">
        <button disabled style="color:#ddd;background:#fff">Deshabilitado</button>
        <span aria-hidden="true" style="color:#eee">Decorativo</span>
      </body>`);
    expect(await problemasDeLegibilidad(page)).toEqual([]);
  });

  test('detecta texto que se sale de la pantalla y una página más ancha que el teléfono', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 640 });
    await page.setContent(`
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <body style="margin:0;background:#fff">
        <p style="white-space:nowrap;color:#111;font-size:16px">Una frase muy larga que no se corta y sigue de largo más allá del borde derecho</p>
      </body>`);
    const tipos = (await problemasDeLegibilidad(page)).map((p) => p.tipo);
    expect(tipos).toContain('desborde');
  });

  test('no marca como desborde lo que está en una franja que se desplaza de lado', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 640 });
    await page.setContent(`
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <body style="margin:0;background:#fff">
        <div style="overflow-x:auto;white-space:nowrap;width:360px"><span style="color:#111">Opción uno</span> ${'<span style="display:inline-block;width:150px;color:#111">Otra opción</span>'.repeat(5)}</div>
      </body>`);
    expect(await problemasDeLegibilidad(page)).toEqual([]);
  });

  test('acepta un título recortado con «…» dentro de un componente, como ion-title', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 640 });
    await page.setContent(`
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <body style="margin:0;background:#fff;color:#111">
        <mi-titulo>Un título larguísimo que no cabe en la barra de arriba del teléfono</mi-titulo>
        <script>
          customElements.define('mi-titulo', class extends HTMLElement {
            connectedCallback() {
              this.attachShadow({ mode: 'open' }).innerHTML =
                '<div style="width:300px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis"><slot></slot></div>';
            }
          });
        </script>
      </body>`);
    expect(await problemasDeLegibilidad(page)).toEqual([]);
  });

  test('detecta texto cortado por el borde de una tarjeta (sin «…»)', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 640 });
    await page.setContent(`
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <body style="margin:0;background:#fff;color:#111">
        <div style="width:340px;overflow:hidden"><p style="white-space:nowrap">Texto que sigue de largo y queda cortado por el borde de la tarjeta</p></div>
      </body>`);
    expect((await problemasDeLegibilidad(page)).map((p) => p.tipo)).toContain('desborde');
  });
});

test.describe('revisor de nombres accesibles', () => {
  test('encuentra un botón de solo ícono sin nombre y un campo sin etiqueta', async ({ page }) => {
    await page.setContent(`
      <main>
        <button><svg width="16" height="16" aria-hidden="true"></svg></button>
        <input type="text" />
        <a href="/x"><svg width="16" height="16" aria-hidden="true"></svg></a>
      </main>`);
    expect(await controlesSinNombre(page.locator('main'))).toEqual(['- button', '- textbox', '- link:']);
  });

  test('acepta nombres por texto, aria-label o etiqueta', async ({ page }) => {
    await page.setContent(`
      <main>
        <button>Enviar</button>
        <button aria-label="Volver"><svg width="16" height="16" aria-hidden="true"></svg></button>
        <label>Correo <input type="email" /></label>
        <a href="/x">Mis reportes</a>
      </main>`);
    expect(await controlesSinNombre(page.locator('main'))).toEqual([]);
  });
});
