import { abrir, aviso, datos, entrar, esperarPantalla, expect, responderDialogo, salir, test, vista } from './ayudas';

/**
 * La cuenta de punta a punta: entrar, crear una cuenta, aceptar los términos
 * nuevos, la introducción, cerrar sesión y eliminar la cuenta.
 */

test.describe('Entrar', () => {
  test('con la contraseña equivocada lo dice y no entra; con la correcta llega al inicio', async ({ page }) => {
    await abrir(page, '/login');

    await entrar(page, 'ana@prueba.cl', 'equivocada');
    await expect(vista(page).getByText('Correo o contraseña incorrectos.')).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);

    await entrar(page, 'ana@prueba.cl');
    await expect(page).toHaveURL(/\/home$/);
    await esperarPantalla(page);
    await expect(vista(page).getByText('Hola, Ana')).toBeVisible();
  });

  test('sin sesión, una pantalla privada lleva a iniciar sesión', async ({ page }) => {
    await abrir(page, '/my-reports');
    await expect(page).toHaveURL(/\/login$/);
    await expect(vista(page).getByText('Entrar').first()).toBeVisible();
  });

  test('con sesión, el inicio de sesión lleva al inicio', async ({ page }) => {
    await abrir(page, '/login', { como: 'ana' });
    await expect(page).toHaveURL(/\/home$/);
  });

  test('una vecina no puede abrir las pantallas del equipo', async ({ page }) => {
    await abrir(page, '/admin-reports', { como: 'ana' });
    await expect(page).toHaveURL(/\/home$/);
    await abrir(page, '/support-inbox', { como: 'ana' });
    await expect(page).toHaveURL(/\/home$/);
  });

  test('cerrar sesión pide confirmación, sale y no deja volver atrás a la cuenta', async ({ page }) => {
    await abrir(page, '/home', { como: 'ana' });
    await vista(page).getByText('Mi perfil').click();
    await expect(page).toHaveURL(/\/perfil$/);
    await esperarPantalla(page);

    await salir(page);
    expect((await datos(page)).sesion).toBeNull();

    // «Atrás» del teléfono: vuelve a pedir la sesión, no muestra la cuenta.
    await page.goBack();
    await expect(page).toHaveURL(/\/login$/);
    await expect(vista(page).getByText('Hola, Ana')).toHaveCount(0);
  });
});

test.describe('Crear una cuenta', () => {
  test('pide aceptar los términos y entra con el nombre elegido', async ({ page }) => {
    await abrir(page, '/login', { bienvenidaVista: false });
    await vista(page).locator('ion-segment-button[value="registro"]').click();

    const formulario = vista(page).locator('form').filter({ hasText: 'Repite la contraseña' });
    await formulario.getByLabel('Nombre para mostrar').fill('Marta Rojas');
    await formulario.getByLabel('Correo').fill('marta@prueba.cl');
    await formulario.getByLabel('Contraseña', { exact: true }).fill('clave123');
    await formulario.getByLabel('Repite la contraseña').fill('clave123');

    const crear = formulario.locator('ion-button[type="submit"]');
    await expect(crear).toHaveAttribute('disabled', '');

    await formulario.locator('ion-checkbox').click();
    await crear.click();

    await expect(aviso(page, /Cuenta creada/)).toBeVisible();
    // Primera vez: la introducción, y después el inicio.
    await expect(page).toHaveURL(/\/bienvenida$/);
    await esperarPantalla(page);
    await vista(page).getByRole('button', { name: 'Saltar' }).click();
    await expect(page).toHaveURL(/\/home$/);
    await esperarPantalla(page);
    await expect(vista(page).getByText('Hola, Marta')).toBeVisible();

    const cuenta = Object.values((await datos(page)).cuentas).find((c) => c.email === 'marta@prueba.cl')!;
    expect(cuenta).toMatchObject({ displayName: 'Marta Rojas', role: 'ciudadano', terminosVersion: 'vigente' });
  });

  test('un correo que ya tiene cuenta lo dice', async ({ page }) => {
    await abrir(page, '/login');
    await vista(page).locator('ion-segment-button[value="registro"]').click();

    const formulario = vista(page).locator('form').filter({ hasText: 'Repite la contraseña' });
    await formulario.getByLabel('Nombre para mostrar').fill('Ana Otra');
    await formulario.getByLabel('Correo').fill('ana@prueba.cl');
    await formulario.getByLabel('Contraseña', { exact: true }).fill('secreta1');
    await formulario.getByLabel('Repite la contraseña').fill('secreta1');
    await formulario.locator('ion-checkbox').click();
    await formulario.locator('ion-button[type="submit"]').click();

    await expect(vista(page).getByText('Ese correo ya tiene una cuenta')).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
  });
});

test.describe('Términos nuevos', () => {
  test('una cuenta antigua debe aceptarlos antes de seguir; una vez aceptados no se vuelven a pedir', async ({ page }) => {
    await abrir(page, '/login');
    await entrar(page, 'antigua@prueba.cl');

    await expect(page).toHaveURL(/\/terminos\?aceptar=1$/);
    await esperarPantalla(page);
    await expect(vista(page).getByText('Para seguir usando Ciudad Alerta, lee y acepta')).toBeVisible();
    // No hay cómo saltárselos.
    await expect(vista(page).locator('ion-back-button')).toHaveCount(0);

    await page.locator('ion-footer').getByRole('button', { name: 'Acepto' }).click();
    await expect(page).toHaveURL(/\/home$/);
    await esperarPantalla(page);
    expect((await datos(page)).cuentas['antigua'].terminosVersion).toBe('vigente');

    await page.reload();
    await esperarPantalla(page);
    await expect(page).toHaveURL(/\/home$/);
  });

  test('quien no los acepta puede cerrar sesión desde ahí', async ({ page }) => {
    await abrir(page, '/home', { como: 'antigua' });
    await expect(page).toHaveURL(/\/terminos\?aceptar=1$/);
    await esperarPantalla(page);

    await page.locator('ion-footer').getByRole('button', { name: 'Cerrar sesión' }).click();
    await expect(page).toHaveURL(/\/login$/);
    expect((await datos(page)).cuentas['antigua'].terminosVersion).toBeUndefined();
  });
});

test.describe('Introducción', () => {
  test('se recorre con Siguiente y Atrás, termina en el inicio y no vuelve a aparecer', async ({ page }) => {
    await abrir(page, '/home', { como: 'ana', bienvenidaVista: false });
    await expect(page).toHaveURL(/\/bienvenida$/);
    await esperarPantalla(page);

    const titulo = vista(page).locator('h1').filter({ visible: true });
    await expect(titulo).toHaveText('Reporta lo que ves en tu barrio');
    await vista(page).getByRole('button', { name: 'Siguiente' }).click();
    await expect(titulo).toHaveText('Sigue tu reporte');
    await vista(page).getByRole('button', { name: 'Atrás' }).click();
    await expect(titulo).toHaveText('Reporta lo que ves en tu barrio');

    for (let i = 0; i < 2; i++) await vista(page).getByRole('button', { name: 'Siguiente' }).click();
    // Con el módulo de confianza activo, la última habla de él.
    await expect(titulo).toHaveText('Tu confianza suma');
    await vista(page).getByRole('button', { name: 'Empezar' }).click();

    await expect(page).toHaveURL(/\/home$/);
    await page.reload();
    await esperarPantalla(page);
    await expect(page).toHaveURL(/\/home$/);
  });

  test('a una operadora no se le muestra', async ({ page }) => {
    await abrir(page, '/home', { como: 'op', bienvenidaVista: false });
    await expect(page).toHaveURL(/\/home$/);
    await expect(vista(page).getByText('Por atender').first()).toBeVisible();
  });
});

test.describe('Eliminar la cuenta', () => {
  test('con la contraseña equivocada no borra nada; con la correcta deja todo anónimo y ya no se puede entrar', async ({ page }) => {
    await abrir(page, '/perfil', { como: 'ana' });

    await vista(page).getByRole('button', { name: 'Eliminar mi cuenta' }).click();
    await responderDialogo(page, 'Eliminar', 'equivocada');
    await expect(aviso(page, 'La contraseña no es correcta.')).toBeVisible();
    expect((await datos(page)).cuentas['ana'].eliminada).toBeUndefined();

    // Sin contraseña el diálogo no se cierra.
    await vista(page).getByRole('button', { name: 'Eliminar mi cuenta' }).click();
    await responderDialogo(page, 'Eliminar', '', { quedaAbierto: true });
    await expect(page.locator('ion-alert')).toBeVisible();
    await responderDialogo(page, 'Eliminar', 'secreta1');

    await expect(aviso(page, 'Tu cuenta fue eliminada.')).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);

    const base = await datos(page);
    expect(base.cuentas['ana']).toMatchObject({ eliminada: true, displayName: 'Cuenta eliminada', email: '' });
    for (const id of ['r_ana_nuevo', 'r_ana_proceso']) expect(base.reportes[id].autorNombre).toBe('Cuenta eliminada');
    // Lo que promete la página pública: los tickets de soporte quedan sin datos de contacto.
    expect(base.tickets['t_ana']).toMatchObject({ autorNombre: 'Cuenta eliminada', autorEmail: '' });
    // Los reportes de otras personas no se tocan.
    expect(base.reportes['r_luis'].autorNombre).toBe('Luis Soto');

    await esperarPantalla(page);
    await entrar(page, 'ana@prueba.cl');
    await expect(vista(page).getByText('Correo o contraseña incorrectos.')).toBeVisible();
  });

  test('sin señal no elimina nada y lo dice', async ({ page, context }) => {
    await abrir(page, '/perfil', { como: 'ana' });
    await context.setOffline(true);

    await vista(page).getByRole('button', { name: 'Eliminar mi cuenta' }).click();
    await responderDialogo(page, 'Eliminar', 'secreta1');

    await expect(aviso(page, 'Sin conexión: tu cuenta no se eliminó.')).toBeVisible();
    await context.setOffline(false);
    expect((await datos(page)).cuentas['ana'].eliminada).toBeUndefined();
    await expect(page).toHaveURL(/\/perfil$/);
  });
});
