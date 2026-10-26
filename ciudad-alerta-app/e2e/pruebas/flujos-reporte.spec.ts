import { Page } from '@playwright/test';

import { abrir, aviso, conSenal, datos, elegir, esperarPantalla, expect, responderDialogo, sinSenal, test, vista } from './ayudas';

/**
 * Crear un reporte como lo hace una vecina: foto, ubicación, categoría y
 * descripción; con y sin señal, con el servicio de privacidad caído y con un
 * reporte parecido cerca.
 */

const enviar = (page: Page) => vista(page).locator('ion-button.accion-principal');

async function llenar(page: Page, categoria: string, descripcion: string): Promise<void> {
  await elegir(page, vista(page).locator('ion-select[formControlName="categoria"]'), categoria);
  await vista(page).getByLabel('¿Qué está pasando?').fill(descripcion);
}

async function usarUbicacion(page: Page): Promise<void> {
  await vista(page).getByRole('button', { name: 'Usar mi ubicación actual' }).click();
  await expect(vista(page).getByText('Comuna:')).toContainText('Maipú');
}

test.describe('Crear un reporte', () => {
  test('con foto, ubicación y categoría llega a «Mis reportes» con la comuna y quien lo atiende', async ({ page }) => {
    await abrir(page, '/report-new', { como: 'ana' });

    // Sin ubicación no se puede enviar, y la pantalla dice por qué.
    await expect(enviar(page)).toHaveAttribute('disabled', '');
    await expect(vista(page).getByText('Falta la ubicación')).toBeVisible();

    await vista(page).getByRole('button', { name: 'Tomar fotografía' }).click();
    await expect(vista(page).getByText('Sin personas detectadas')).toBeVisible();
    await expect(vista(page).locator('figure.preview img')).toBeVisible();

    await usarUbicacion(page);
    await expect(vista(page).getByText('Falta la ubicación')).toHaveCount(0);

    // Una categoría con peligro posible ofrece llamar a emergencias.
    await llenar(page, 'Árbol peligroso', 'Rama grande quebrada sobre la vereda, cuelga encima del paradero');
    const emergencia = vista(page).locator('app-aviso-emergencia');
    await expect(emergencia).toContainText('¿Hay peligro ahora?');
    await expect(emergencia.locator('a[href="tel:133"]')).toBeVisible();
    await expect(emergencia.locator('a[href="tel:132"]')).toBeVisible();
    await expect(emergencia.locator('a[href="tel:131"]')).toBeVisible();

    await expect(enviar(page)).not.toHaveAttribute('disabled', '');
    await enviar(page).click();

    await expect(aviso(page, 'Reporte enviado')).toBeVisible();
    await expect(page).toHaveURL(/\/home$/);

    const base = await datos(page);
    const nuevo = Object.values(base.reportes).find((r) => r.descripcion.startsWith('Rama grande'))!;
    expect(nuevo).toMatchObject({ uid: 'ana', categoria: 'arbol_peligroso', comuna: 'Maipú', estado: 'reportado', operadorId: 'op_maipu' });
    expect(nuevo.foto?.dataUrl).toMatch(/^data:image\/jpeg;base64,/);
    expect(nuevo.ubicacion.lat).toBeCloseTo(-33.5106, 3);

    await page.goto('/my-reports');
    await esperarPantalla(page);
    await expect(vista(page).getByText('Rama grande quebrada').first()).toBeVisible();
  });

  test('una descripción muy corta no se envía y dice cuánto escribir', async ({ page }) => {
    await abrir(page, '/report-new', { como: 'ana' });
    await usarUbicacion(page);
    await llenar(page, 'Microbasural', 'Basura');
    await vista(page).getByLabel('¿Qué está pasando?').blur();

    await expect(vista(page).getByText(/Usa entre \d+ y \d+ caracteres/)).toBeVisible();
    await expect(enviar(page)).toHaveAttribute('disabled', '');
  });

  test('si ya hay un reporte igual cerca, lo muestra y deja confirmarlo en vez de duplicarlo', async ({ page }) => {
    await abrir(page, '/report-new', { como: 'ana' });
    await usarUbicacion(page);
    await llenar(page, 'Fuga de agua', 'Sale agua de la vereda hacia la calle');

    const coincidencias = vista(page).locator('app-similar-reports');
    await expect(coincidencias).toContainText('Ya hay un reporte cerca');
    await expect(coincidencias).toContainText('Fuga de agua en la vereda, corre hacia la calle');

    await coincidencias.getByRole('button', { name: 'Es el mismo problema' }).click();
    await expect(coincidencias).toContainText('Confirmaste este reporte');
    expect((await datos(page)).confirmaciones['r_luis']).toContain('ana');
  });

  test('si el servicio de privacidad no responde, la foto no se publica y se puede enviar sin ella', async ({ page }) => {
    await abrir(page, '/report-new', { como: 'ana', escenario: { privacidadCaida: true } });

    await vista(page).getByRole('button', { name: 'Elegir de la galería' }).click();
    await expect(vista(page).getByText('No pudimos difuminar los rostros de esta foto')).toBeVisible();
    await expect(vista(page).getByRole('button', { name: 'Reintentar' })).toBeVisible();

    await usarUbicacion(page);
    await llenar(page, 'Luminaria dañada', 'Poste sin luz hace tres noches en el pasaje');
    // Con la foto sin proteger no se envía.
    await expect(enviar(page)).toHaveAttribute('disabled', '');
    await expect(vista(page).getByText('Reintenta la protección de la foto o quítala')).toBeVisible();

    await vista(page).locator('.acciones-foto').getByRole('button', { name: 'Quitar' }).click();
    await expect(vista(page).getByRole('button', { name: 'Tomar fotografía' })).toBeVisible();
    await enviar(page).click();

    await expect(aviso(page, 'Reporte enviado')).toBeVisible();
    const nuevo = Object.values((await datos(page)).reportes).find((r) => r.descripcion.startsWith('Poste sin luz'))!;
    expect(nuevo.foto).toBeNull();
  });

  test('sin señal queda guardado en el teléfono y se envía solo, con la foto protegida, al volver la conexión', async ({ page }) => {
    await abrir(page, '/report-new', { como: 'ana' });
    await usarUbicacion(page);
    await llenar(page, 'Calle deteriorada', 'Hoyo grande en la pista, los autos lo esquivan');

    await sinSenal(page);
    await expect(vista(page).getByText('Sin señal. Al enviar, el reporte se guarda en este teléfono')).toBeVisible();

    // Sin señal la foto no se puede proteger todavía: se protegerá antes de subirla.
    await vista(page).getByRole('button', { name: 'Tomar fotografía' }).click();
    await expect(vista(page).getByText('Sin señal todavía no podemos difuminar los rostros')).toBeVisible();

    await expect(enviar(page)).toHaveText(/Guardar y enviar con señal/);
    await enviar(page).click();
    await expect(aviso(page, 'Sin señal: guardamos tu reporte')).toBeVisible();
    await expect(page).toHaveURL(/\/home$/);

    const tarjeta = vista(page).locator('app-borrador-pendiente');
    await expect(tarjeta).toContainText('Reporte por enviar');
    await expect(tarjeta).toContainText('Calle deteriorada · Hoyo grande en la pista');
    await expect(tarjeta).toContainText('La foto se protegerá antes de subirla.');
    expect(Object.values((await datos(page)).reportes).some((r) => r.descripcion.startsWith('Hoyo grande'))).toBe(false);

    // Una recarga sin señal no lo pierde.
    await page.reload();
    await expect(page.locator('#arranque')).toHaveCount(0);
    await expect(vista(page).locator('app-borrador-pendiente')).toContainText('Reporte por enviar');

    await conSenal(page);
    await expect(aviso(page, 'Enviamos el reporte que guardaste sin señal.')).toBeVisible({ timeout: 15_000 });
    await expect(vista(page).getByText('Reporte por enviar')).toHaveCount(0);

    const enviado = Object.values((await datos(page)).reportes).find((r) => r.descripcion.startsWith('Hoyo grande'))!;
    expect(enviado).toMatchObject({ uid: 'ana', categoria: 'calle_deteriorada', comuna: 'Maipú' });
    expect(enviado.foto?.dataUrl).toMatch(/^data:image\/jpeg/);
  });
});

/** El punto que muestra el selector del mapa («Punto elegido: lat, lng»). */
async function puntoDelSelector(page: Page): Promise<{ lat: number; lng: number }> {
  const texto = (await vista(page).locator('app-elegir-punto .coordenadas').textContent()) ?? '';
  const [lat, lng] = (texto.match(/-?\d+\.\d+/g) ?? []).map(Number);
  return { lat, lng };
}

/** Arrastra el mapa del selector con el dedo (aquí, el mouse). */
async function arrastrarMapa(page: Page, dx: number, dy: number): Promise<void> {
  const caja = (await vista(page).locator('app-elegir-punto .leaflet-container').boundingBox())!;
  const x = caja.x + caja.width / 2;
  const y = caja.y + caja.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 8 });
  await page.mouse.up();
}

test.describe('Dónde se marca el reporte', () => {
  test('una cuenta con más de una semana puede marcarlo en otro punto del mapa, y así queda guardado', async ({ page }) => {
    await abrir(page, '/report-new', { como: 'ana' });
    await vista(page).getByRole('button', { name: 'Elegir en el mapa' }).click();

    // El mapa empieza donde está el teléfono.
    await expect(vista(page).locator('app-elegir-punto .coordenadas')).toHaveText('Punto elegido: -33.51060, -70.75720');

    // La casa no es el problema: se mueve el mapa hasta la esquina de al lado.
    await arrastrarMapa(page, -60, -40);
    await expect(vista(page).locator('app-elegir-punto .coordenadas')).not.toHaveText('Punto elegido: -33.51060, -70.75720');
    const punto = await puntoDelSelector(page);
    expect(Math.abs(punto.lng - -70.7572)).toBeGreaterThan(0.0005);

    await vista(page).getByRole('button', { name: 'Usar este punto' }).click();
    await expect(vista(page).getByText('punto elegido en el mapa')).toBeVisible();
    await expect(vista(page).getByText('Comuna:')).toContainText('Maipú');
    await expect(vista(page).getByText('precisión aproximada')).toHaveCount(0);

    await llenar(page, 'Microbasural', 'Bolsas de basura acumuladas en la esquina del pasaje');
    await enviar(page).click();
    await expect(aviso(page, 'Reporte enviado')).toBeVisible();

    const nuevo = Object.values((await datos(page)).reportes).find((r) => r.descripcion.startsWith('Bolsas de basura acumuladas'))!;
    expect(nuevo.ubicacion.fuente).toBe('mapa');
    expect(nuevo.ubicacion.lat).toBeCloseTo(punto.lat, 5);
    expect(nuevo.ubicacion.lng).toBeCloseTo(punto.lng, 5);
    expect(nuevo).toMatchObject({ comuna: 'Maipú', operadorId: 'op_maipu' });

    // En el detalle, quien atiende sabe que el punto no viene del GPS.
    await page.goto(`/report/${nuevo.id}`);
    await esperarPantalla(page);
    await expect(vista(page).getByText('marcó este punto en el mapa')).toBeVisible();
  });

  test('una cuenta de menos de una semana solo puede usar su ubicación actual, y sabe cuánto le falta', async ({ page }) => {
    await abrir(page, '/report-new', { como: 'nueva' });

    await expect(vista(page).locator('ion-button', { hasText: 'Elegir en el mapa' })).toHaveAttribute('disabled', '');
    await expect(vista(page).getByText('cuando tu cuenta cumpla 7 días (te faltan 5 días)')).toBeVisible();

    await usarUbicacion(page);
    await expect(vista(page).getByText('precisión aproximada de 12 m')).toBeVisible();
    await expect(vista(page).locator('ion-button', { hasText: /Elegir en el mapa|Mover el punto/ })).toHaveCount(0);

    await llenar(page, 'Microbasural', 'Escombros botados junto al contenedor de la plaza');
    await enviar(page).click();
    await expect(aviso(page, 'Reporte enviado')).toBeVisible();

    const nuevo = Object.values((await datos(page)).reportes).find((r) => r.descripcion.startsWith('Escombros botados'))!;
    expect(nuevo.ubicacion).toMatchObject({ fuente: 'gps', accuracy: 12 });
    expect(nuevo.ubicacion.lat).toBeCloseTo(-33.5106, 4);
  });
});

test.describe('Versión web sin señal', () => {
  test('una pantalla que todavía no se abrió avisa que falta la señal, en vez de quedarse sin responder', async ({ page, context }) => {
    await abrir(page, '/home', { como: 'ana' });
    // En la web el código de cada pantalla se descarga al abrirla.
    await context.setOffline(true);
    await vista(page).getByText('Crear un reporte').first().click();

    await expect(aviso(page, 'Sin señal no pudimos abrir esa pantalla')).toBeVisible();
    await expect(page).toHaveURL(/\/home$/);
    await expect(vista(page).getByText('Hola, Ana')).toBeVisible();

    // Con señal, el mismo botón funciona. El navegador recuerda la descarga
    // fallida y no la reintenta: la app se recarga directo en esa pantalla.
    await context.setOffline(false);
    await vista(page).getByText('Crear un reporte').first().click();
    await expect(page).toHaveURL(/\/report-new$/);
    await esperarPantalla(page);
    await expect(vista(page).getByText('Evidencia')).toBeVisible();
  });
});

test.describe('Un reporte propio', () => {
  test('la autora corrige la descripción y luego lo retira', async ({ page }) => {
    await abrir(page, '/report/r_ana_nuevo', { como: 'ana' });
    await expect(vista(page).getByRole('heading', { name: 'Tu reporte' })).toBeVisible();

    await vista(page).getByRole('button', { name: 'Corregir descripción' }).click();
    await responderDialogo(page, 'Guardar', 'Luminaria apagada frente al paradero 3 de Av. Pajaritos, lado norte');
    await expect(aviso(page, 'Descripción corregida.')).toBeVisible();
    await expect(vista(page).getByText('lado norte')).toBeVisible();
    expect((await datos(page)).reportes['r_ana_nuevo'].descripcion).toContain('lado norte');

    await vista(page).getByRole('button', { name: 'Retirar reporte' }).click();
    await responderDialogo(page, 'Retirar', 'Ya la arreglaron');
    await expect(aviso(page, 'Reporte retirado.')).toBeVisible();
    await expect(vista(page).getByText('Quien lo reportó lo retiró')).toBeVisible();
    await expect(vista(page).getByRole('button', { name: 'Corregir descripción' })).toHaveCount(0);

    const base = await datos(page);
    expect(base.reportes['r_ana_nuevo']).toMatchObject({ estado: 'cerrado', retiradoPorAutor: true });
    expect(base.historial['r_ana_nuevo'].at(-1)).toMatchObject({ desde: 'reportado', hacia: 'cerrado', autorUid: 'ana' });
  });

  test('una descripción corregida demasiado corta no se guarda', async ({ page }) => {
    await abrir(page, '/report/r_ana_nuevo', { como: 'ana' });
    await vista(page).getByRole('button', { name: 'Corregir descripción' }).click();
    await responderDialogo(page, 'Guardar', 'Corta', { quedaAbierto: true });

    await expect(aviso(page, /Usa entre \d+ y \d+ caracteres/)).toBeVisible();
    expect((await datos(page)).reportes['r_ana_nuevo'].descripcion).toBe('Luminaria apagada frente al paradero 3 de Av. Pajaritos');
  });

  test('ofrece llamar y escribir al organismo con los datos del reporte', async ({ page }) => {
    await abrir(page, '/report/r_ana_nuevo', { como: 'ana' });
    const contacto = vista(page).locator('app-contacto-organismo');

    await expect(contacto.getByRole('link', { name: /Llamar/ })).toHaveAttribute('href', 'tel:+56226776000');
    const correo = await contacto.getByRole('link', { name: /Escribir/ }).getAttribute('href');
    expect(correo).toMatch(/^mailto:oirs@maipu\.cl\?/);
    const cuerpo = decodeURIComponent(correo!);
    expect(cuerpo).toContain('Luminaria dañada');
    expect(cuerpo).toContain('Luminaria apagada frente al paradero 3');
    await expect(contacto).toContainText('Atención presencial: Av. 5 de Abril 0260, Maipú');
  });

  test('a otra persona no le ofrece corregirlo ni retirarlo', async ({ page }) => {
    await abrir(page, '/report/r_ana_nuevo', { como: 'luis' });
    await expect(vista(page).getByText('Luminaria apagada frente al paradero 3')).toBeVisible();
    await expect(vista(page).getByRole('heading', { name: 'Tu reporte' })).toHaveCount(0);
    await expect(vista(page).getByRole('button', { name: 'Retirar reporte' })).toHaveCount(0);
  });

  test('un reporte que no existe lo dice, sin errores', async ({ page }) => {
    await abrir(page, '/report/no_existe', { como: 'ana' });
    await expect(vista(page).getByText('No encontramos esta incidencia')).toBeVisible();
  });
});
