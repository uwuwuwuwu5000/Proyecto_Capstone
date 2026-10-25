import { Page } from '@playwright/test';

import { abrir, elegir, esperarPantalla, expect, test, vista } from './ayudas';

/**
 * Configuración: lo que se elige se nota en toda la app y sigue igual al
 * volver a abrirla.
 */

const clasesDeLaRaiz = (page: Page) => page.evaluate(() => document.documentElement.className);

test.describe('Configuración', () => {
  test('el tema claro se aplica al instante y se mantiene al volver a abrir la app', async ({ page }) => {
    await abrir(page, '/configuracion', { como: 'ana' });
    expect(await clasesDeLaRaiz(page)).not.toContain('tema-claro');

    await vista(page).locator('ion-segment-button[value="claro"]').click();
    await expect(page.locator('html')).toHaveClass(/tema-claro/);

    await page.reload();
    await esperarPantalla(page);
    await expect(page.locator('html')).toHaveClass(/tema-claro/);
    // También en pantallas sin sesión.
    await page.goto('/terminos');
    await esperarPantalla(page);
    await expect(page.locator('html')).toHaveClass(/tema-claro/);
  });

  test('el texto «Muy grande» agranda las letras y se mantiene al volver a abrir la app', async ({ page }) => {
    await abrir(page, '/configuracion', { como: 'ana' });
    const tamano = () => vista(page).locator('h2').first().evaluate((h) => parseFloat(getComputedStyle(h).fontSize));
    const antes = await tamano();

    await vista(page).locator('ion-segment-button[value="muy-grande"]').click();
    await expect(page.locator('html')).toHaveClass(/ca-texto-muy-grande/);
    expect(await tamano()).toBeGreaterThan(antes * 1.15);

    await page.reload();
    await esperarPantalla(page);
    await expect(page.locator('html')).toHaveClass(/ca-texto-muy-grande/);
  });

  test('«Al abrir la app» lleva a la pantalla elegida, y atrás vuelve al inicio', async ({ page }) => {
    await abrir(page, '/configuracion', { como: 'ana' });
    await elegir(page, vista(page).locator('ion-select').filter({ hasText: 'Ir a' }), 'Mis reportes');

    await page.goto('/');
    await expect(page).toHaveURL(/\/my-reports$/);
    await esperarPantalla(page);
    await expect(vista(page).getByText('Luminaria apagada').first()).toBeVisible();

    await vista(page).locator('ion-back-button').click();
    await expect(page).toHaveURL(/\/home$/);
  });

  test('«Ver la introducción» la muestra otra vez', async ({ page }) => {
    await abrir(page, '/configuracion', { como: 'ana' });
    await vista(page).getByRole('link', { name: 'Ver la introducción' }).click();
    await expect(page).toHaveURL(/\/bienvenida$/);
    await esperarPantalla(page);
    await expect(vista(page).getByText('Reporta lo que ves en tu barrio')).toBeVisible();
  });
});
