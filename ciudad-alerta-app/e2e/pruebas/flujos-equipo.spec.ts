import { abrir, aviso, datos, entrar, esperarPantalla, expect, responderDialogo, salir, test, vista } from './ayudas';

/**
 * Lo que hace el equipo (operadora, administración) y cómo le llega a la
 * vecina: cambios de estado con su comentario, avisos y soporte.
 */

test.describe('Gestión de un reporte', () => {
  test('la operadora lo pasa a revisión con un comentario y a la vecina le llega el aviso', async ({ page }) => {
    await abrir(page, '/report/r_ana_nuevo', { como: 'op' });

    const gestion = vista(page).locator('app-gestion-reporte');
    await expect(gestion).toContainText('Reportado por');
    await expect(gestion).toContainText('Ana Pérez');
    await gestion.getByRole('button', { name: 'En revisión' }).click();
    await responderDialogo(page, 'Confirmar', 'Mañana pasa la cuadrilla a revisarla.');
    await expect(aviso(page, 'Estado actualizado.')).toBeVisible();

    const base = await datos(page);
    expect(base.reportes['r_ana_nuevo'].estado).toBe('en_revision');
    expect(base.historial['r_ana_nuevo'].at(-1)).toMatchObject({
      desde: 'reportado',
      hacia: 'en_revision',
      autorUid: 'op',
      comentario: 'Mañana pasa la cuadrilla a revisarla.',
    });

    // La vecina entra y lo ve en sus avisos.
    await page.goto('/home');
    await esperarPantalla(page);
    await salir(page);
    await entrar(page, 'ana@prueba.cl');
    await expect(page).toHaveURL(/\/home$/);
    await esperarPantalla(page);

    await page.goto('/avisos');
    await esperarPantalla(page);
    const nuevo = vista(page).locator('button').filter({ hasText: 'Mañana pasa la cuadrilla' });
    await expect(nuevo).toBeVisible();
    await nuevo.click();
    await expect(page).toHaveURL(/\/report\/r_ana_nuevo$/);
    await esperarPantalla(page);
    await expect(vista(page).getByText('Mañana pasa la cuadrilla a revisarla.').first()).toBeVisible();
    // Ya revisado: la autora no lo puede corregir ni retirar.
    await expect(vista(page).getByRole('button', { name: 'Corregir descripción' })).toHaveCount(0);

    const vistos = (await datos(page)).vistos['ana'] ?? [];
    expect(vistos.some((id) => id.startsWith('r_ana_nuevo_'))).toBe(true);
  });

  test('una vecina no ve la gestión de un reporte', async ({ page }) => {
    await abrir(page, '/report/r_luis', { como: 'ana' });
    await expect(vista(page).getByText('Fuga de agua en la vereda').first()).toBeVisible();
    await expect(vista(page).locator('app-gestion-reporte').getByRole('button')).toHaveCount(0);
    await expect(vista(page).getByText('Reportado por')).toHaveCount(0);
  });

  test('la bandeja de la operadora solo muestra lo de su municipalidad y abre el detalle', async ({ page }) => {
    await abrir(page, '/admin-reports', { como: 'op' });
    await expect(vista(page).getByText('Fuga de agua en la vereda').first()).toBeVisible();

    await vista(page).getByText('Fuga de agua en la vereda').first().click();
    await expect(page).toHaveURL(/\/report\/r_luis$/);
    await esperarPantalla(page);
    await expect(vista(page).locator('app-gestion-reporte')).toContainText('Gestión');
  });
});

test.describe('Soporte', () => {
  test('una vecina abre una conversación nueva y sigue escribiendo; el equipo la ve en su bandeja', async ({ page }) => {
    await abrir(page, '/support-new', { como: 'ana' });

    await vista(page).locator('ion-segment-button[value="sugerencia"]').click();
    await vista(page).getByLabel('Asunto').fill('Mapa con más contraste');
    await vista(page).getByLabel('Tu mensaje').fill('Con sol fuerte cuesta ver los puntos del mapa en la calle.');
    await vista(page).locator('ion-button[type="submit"]').click();

    await expect(aviso(page, 'Conversación abierta.')).toBeVisible();
    await expect(page).toHaveURL(/\/support\/ticket_\d+$/);
    await esperarPantalla(page);
    // Los mensajes de la conversación (el campo de texto también contiene lo que se escribe).
    const mensajes = vista(page).locator('.mensaje__texto');
    await expect(mensajes).toHaveText(['Con sol fuerte cuesta ver los puntos del mapa en la calle.']);

    await page.getByLabel('Mensaje para soporte').fill('Sobre todo los amarillos.');
    await page.getByRole('button', { name: 'Enviar mensaje' }).click();
    await expect(mensajes).toHaveText(['Con sol fuerte cuesta ver los puntos del mapa en la calle.', 'Sobre todo los amarillos.']);
    await expect(page.getByLabel('Mensaje para soporte')).toHaveValue('');

    const base = await datos(page);
    const ticket = Object.values(base.tickets).find((t) => t.asunto === 'Mapa con más contraste')!;
    expect(ticket).toMatchObject({ uid: 'ana', tipo: 'sugerencia', estado: 'abierto' });
    expect(base.mensajes[ticket.id].map((m) => m.texto)).toEqual([
      'Con sol fuerte cuesta ver los puntos del mapa en la calle.',
      'Sobre todo los amarillos.',
    ]);

    await page.goto('/home');
    await esperarPantalla(page);
    await salir(page);
    await entrar(page, 'admin@prueba.cl');
    await expect(page).toHaveURL(/\/home$/);
    await esperarPantalla(page);
    await page.goto('/support-inbox');
    await esperarPantalla(page);
    await expect(vista(page).getByText('Mapa con más contraste')).toBeVisible();
  });

  test('un mensaje vacío no se envía', async ({ page }) => {
    await abrir(page, '/support/t_ana', { como: 'ana' });
    await page.getByLabel('Mensaje para soporte').fill('   ');
    await expect(page.getByRole('button', { name: 'Enviar mensaje' })).toHaveAttribute('disabled', '');
  });
});
