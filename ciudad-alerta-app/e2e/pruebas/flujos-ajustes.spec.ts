import { Page } from '@playwright/test';

import { abrir, aviso, conSenal, datos, elegir, esperarPantalla, expect, responderDialogo, sinSenal, test, vista } from './ayudas';

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

  test('«Borrar datos guardados» no cierra la sesión ni pierde el reporte que espera señal', async ({ page }) => {
    // Un reporte guardado sin señal.
    await abrir(page, '/report-new', { como: 'ana' });
    await vista(page).getByRole('button', { name: 'Usar mi ubicación actual' }).click();
    await expect(vista(page).getByText('Comuna:')).toContainText('Maipú');
    await elegir(page, vista(page).locator('ion-select[formControlName="categoria"]'), 'Microbasural');
    await vista(page).getByLabel('¿Qué está pasando?').fill('Bolsas de basura acumuladas en la esquina del pasaje');
    await sinSenal(page);
    await vista(page).locator('ion-button.accion-principal').click();
    await expect(page).toHaveURL(/\/home$/);
    await expect(vista(page).getByText('Reporte por enviar')).toBeVisible();

    await page.goto('/configuracion');
    await esperarPantalla(page);
    await vista(page).getByRole('button', { name: 'Borrar datos guardados' }).click();
    await responderDialogo(page, 'Borrar');
    await expect(aviso(page, /datos guardados/)).toBeVisible();

    // Al volver a abrir la app sigue la sesión y el reporte por enviar. La
    // introducción ya vista es una de las ayudas que se borran: aparece otra vez.
    await page.goto('/home');
    await expect(page).toHaveURL(/\/bienvenida$/);
    await esperarPantalla(page);
    await vista(page).getByRole('button', { name: 'Saltar' }).click();
    await expect(page).toHaveURL(/\/home$/);
    await expect(vista(page).getByText('Reporte por enviar')).toBeVisible();

    await conSenal(page);
    await expect(aviso(page, 'Enviamos el reporte que guardaste sin señal.')).toBeVisible({ timeout: 15_000 });
    expect(Object.values((await datos(page)).reportes).some((r) => r.descripcion.startsWith('Bolsas de basura'))).toBe(true);
  });
});
