import { Page, TestInfo, expect, test as base } from '@playwright/test';
import { existsSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';

import { ProblemaDeLegibilidad, problemasDeLegibilidad } from './legibilidad';

export type Cuenta = 'ana' | 'luis' | 'op' | 'admin' | 'antigua' | 'nueva' | 'orgmaipu' | null;

export interface Apertura {
  /** Con quién empieza la sesión (null: sin sesión). */
  como?: Cuenta;
  tema?: 'oscuro' | 'claro';
  texto?: 'normal' | 'grande' | 'muy-grande';
  /** Ya vio la bienvenida (por defecto sí, para ir directo al inicio). */
  bienvenidaVista?: boolean;
  escenario?: { privacidadCaida?: boolean; conValidados?: boolean };
}

/** PNG transparente de 1×1 para los mosaicos del mapa (sin internet en las pruebas). */
const MOSAICO = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');

/**
 * Prepara el navegador antes de abrir la app: sesión, tema, tamaño del texto,
 * sin animaciones, y sin salir a internet (los mosaicos del mapa se
 * reemplazan; cualquier otra petición externa se corta).
 */
export async function preparar(page: Page, a: Apertura = {}): Promise<void> {
  await page.addInitScript((op) => {
    // Solo en la app (no en about:blank) y la primera vez en esta pestaña:
    // una recarga conserva lo que la app guardó.
    if (!location.protocol.startsWith('http') || sessionStorage.getItem('e2e.preparado')) return;
    sessionStorage.setItem('e2e.preparado', '1');
    if (op.como) localStorage.setItem('e2e.sesionInicial', op.como);
    localStorage.setItem('ciudad-alerta.tema', op.tema ?? 'oscuro');
    localStorage.setItem('ciudad-alerta.preferencias', JSON.stringify({ texto: op.texto ?? 'normal', animaciones: 'no' }));
    if (op.bienvenidaVista !== false) localStorage.setItem('ca.bienvenida.vista', '1');
    if (op.escenario) localStorage.setItem('e2e.escenario', JSON.stringify(op.escenario));
  }, a);

  await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, (ruta) =>
    /tile\.openstreetmap|basemaps|tiles?\./.test(ruta.request().url())
      ? ruta.fulfill({ status: 200, contentType: 'image/png', body: MOSAICO })
      : ruta.abort(),
  );
}

/** Abre una ruta de la app y espera a que la pantalla de arranque se haya ido. */
export async function abrir(page: Page, ruta: string, a: Apertura = {}): Promise<void> {
  await preparar(page, a);
  await page.goto(ruta);
  await esperarPantalla(page);
}

/** Espera a que la pantalla de arranque se vaya y la vista activa termine de cargar. */
export async function esperarPantalla(page: Page): Promise<void> {
  await expect(page.locator('#arranque')).toHaveCount(0, { timeout: 15_000 });
  await page.waitForLoadState('networkidle');
  // Textos de carga habituales: «Cargando…», «Comprobando…», «Preparando…».
  await expect(page.locator('ion-router-outlet > .ion-page:not(.ion-page-hidden)').getByText(/^(Cargando|Preparando|Comprobando)/)).toHaveCount(0, {
    timeout: 10_000,
  });
}

/** La página visible (Ionic deja las anteriores ocultas en el DOM). */
export function vista(page: Page) {
  return page.locator('ion-router-outlet > .ion-page:not(.ion-page-hidden)').last();
}

const COMPILADO = resolve(__dirname, '..', '.compilado');
const ASSETS = resolve(__dirname, '..', '..', 'src', 'assets');

/**
 * Corta la señal como en el teléfono: la red se cae, pero el código de la
 * app sigue a mano porque viene dentro del APK. Las pantallas que aún no se
 * habían abierto cargan igual (desde el disco, como servidor.mjs).
 *
 * Para la versión web, donde sin señal tampoco llega el código, basta con
 * `context.setOffline(true)`.
 */
export async function sinSenal(page: Page): Promise<void> {
  await page.route(/^http:\/\/127\.0\.0\.1:\d+\//, async (ruta) => {
    const camino = decodeURIComponent(new URL(ruta.request().url()).pathname);
    const enAssets = camino.startsWith('/assets/');
    const carpeta = enAssets ? ASSETS : COMPILADO;
    let destino = normalize(join(carpeta, enAssets ? camino.slice('/assets/'.length) : camino.slice(1)));
    if (!destino.startsWith(carpeta) || !existsSync(destino) || !statSync(destino).isFile()) {
      if (extname(camino)) return ruta.fulfill({ status: 404 });
      destino = join(COMPILADO, 'index.html');
    }
    return ruta.fulfill({ path: destino });
  });
  await page.context().setOffline(true);
}

/** Vuelve la señal (y el código se sigue sirviendo normalmente). */
export async function conSenal(page: Page): Promise<void> {
  await page.context().setOffline(false);
  await page.unroute(/^http:\/\/127\.0\.0\.1:\d+\//);
}

/** El aviso flotante (toast) que dice `texto`. */
export function aviso(page: Page, texto: string | RegExp) {
  return page.locator('ion-toast').getByText(texto);
}

/**
 * Responde un diálogo de Ionic (ion-alert): escribe en su campo, si se pide, y
 * pulsa el botón. Espera a que el diálogo se cierre, salvo que el botón lo
 * deje abierto a propósito (por ejemplo, una contraseña vacía).
 */
export async function responderDialogo(page: Page, boton: string, escribir?: string, opciones: { quedaAbierto?: boolean } = {}): Promise<void> {
  const dialogo = page.locator('ion-alert').last();
  await expect(dialogo).toBeVisible();
  if (escribir !== undefined) await dialogo.locator('input, textarea').first().fill(escribir);
  await dialogo.locator('button.alert-button', { hasText: boton }).click();
  if (!opciones.quedaAbierto) await expect(page.locator('ion-alert')).toHaveCount(0);
}

/** Elige una opción de un ion-select con `interface="action-sheet"`. */
export async function elegir(page: Page, selector: ReturnType<Page['locator']>, opcion: string): Promise<void> {
  await selector.click();
  const hoja = page.locator('ion-action-sheet');
  await hoja.locator('button', { hasText: opcion }).click();
  await expect(hoja).toHaveCount(0);
}

/** Lo que la maqueta tiene guardado (cuentas, reportes, tickets…). */
export async function datos(page: Page): Promise<import('../maqueta/base').Base> {
  return page.evaluate(() => (globalThis as unknown as { __e2e: { base: () => import('../maqueta/base').Base } }).__e2e.base());
}

/** Entra con correo y contraseña desde la pantalla de inicio de sesión. */
export async function entrar(page: Page, correo: string, contrasena = 'secreta1'): Promise<void> {
  const formulario = vista(page);
  await formulario.getByLabel('Correo').fill(correo);
  await formulario.getByLabel('Contraseña', { exact: true }).fill(contrasena);
  await formulario.locator('ion-button[type="submit"]', { hasText: 'Entrar' }).click();
}

/** Cierra la sesión con el botón «Cerrar sesión» de la pantalla actual. */
export async function salir(page: Page): Promise<void> {
  await vista(page).locator('app-cerrar-sesion ion-button').click();
  await responderDialogo(page, 'Cerrar sesión');
  await expect(page).toHaveURL(/\/login$/);
  await esperarPantalla(page);
}

/**
 * Prueba con vigilancia de la consola: cualquier error de JavaScript, error en
 * consola o aviso de Angular (NG0…) hace fallar la prueba al terminar.
 */
export const test = base.extend<{ consola: string[] }>({
  consola: [
    async ({ page }, usar, info: TestInfo) => {
      const problemas: string[] = [];
      page.on('pageerror', (error) => problemas.push(`Error de JavaScript: ${error.message}`));
      page.on('console', (mensaje) => {
        const texto = mensaje.text();
        if (mensaje.type() === 'error' && !/Failed to load resource|ERR_FAILED|net::ERR/.test(texto)) {
          problemas.push(`console.error: ${texto.slice(0, 300)}`);
        }
        if (/NG0\d{3}/.test(texto)) problemas.push(`Angular: ${texto.slice(0, 300)}`);
      });
      await usar(problemas);
      if (problemas.length) {
        await info.attach('consola', { body: problemas.join('\n'), contentType: 'text/plain' });
      }
      expect(problemas, 'La consola debe quedar sin errores').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

/** Lo que se usa de <ion-content> (sin depender de los tipos de Ionic en Node). */
interface ContenidoIonic extends HTMLElement {
  getScrollElement(): Promise<HTMLElement>;
  scrollToPoint(x: number, y: number, duracion: number): Promise<void>;
  scrollToTop(duracion: number): Promise<void>;
}

/**
 * Revisa la legibilidad de toda la pantalla, no solo de lo que se ve al
 * abrirla: baja por el contenido de a 80 % del alto y revisa cada tramo.
 */
export async function revisarTodaLaPantalla(page: Page): Promise<ProblemaDeLegibilidad[]> {
  const contenido = vista(page).locator('ion-content').first();
  const medidas = (await contenido.count())
    ? await contenido.evaluate(async (el) => {
        const scroll = await (el as ContenidoIonic).getScrollElement();
        return { total: scroll.scrollHeight, visible: scroll.clientHeight };
      })
    : { total: 0, visible: 1 };

  const encontrados = new Map<string, ProblemaDeLegibilidad>();
  for (let y = 0; ; y += Math.max(200, Math.floor(medidas.visible * 0.8))) {
    if (medidas.total) {
      await contenido.evaluate((el, destino) => (el as ContenidoIonic).scrollToPoint(0, destino, 0), y);
      await page.waitForTimeout(60);
    }
    for (const p of await problemasDeLegibilidad(page)) encontrados.set(`${p.tipo}|${p.texto}|${p.detalle}`, p);
    if (!medidas.total || y + medidas.visible >= medidas.total) break;
  }
  if (medidas.total) await contenido.evaluate((el) => (el as ContenidoIonic).scrollToTop(0));
  return [...encontrados.values()];
}
