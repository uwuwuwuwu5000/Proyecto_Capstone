import { abrir, expect, test, vista } from './ayudas';

test('la vecina entra al inicio con su resumen y sus botones', async ({ page }) => {
  await abrir(page, '/home', { como: 'ana' });
  await expect(vista(page).getByText('Hola, Ana')).toBeVisible();
  await expect(vista(page).getByText('Tus reportes')).toBeVisible();
  await expect(vista(page).getByText('Crear un reporte')).toBeVisible();
});
