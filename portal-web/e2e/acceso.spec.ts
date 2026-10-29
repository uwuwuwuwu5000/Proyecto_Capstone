// Fases 4 y 5: acceso, registro, sesión y navegación por rol.
import { expect, test } from '@playwright/test'
import { CLAVE, CUENTAS, autenticacion, bd, sembrar } from './datos/semilla'
import { iniciarSesion, paginaDe } from './ayudas/sesion'

test.beforeAll(async () => {
  await sembrar()
})

test.describe('Sesión', () => {
  test('US04 · Inicio de sesión exitoso', async ({ page }) => {
    await iniciarSesion(page, 'vecino1')
    await expect(page.getByRole('link', { name: /Ir al mapa/ }).first()).toBeVisible()
  })

  test('US05 · Contraseña incorrecta', async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel('Correo').fill(CUENTAS.vecino1.correo)
    await page.getByLabel('Contraseña').fill('incorrecta1')
    await page.getByRole('button', { name: 'Iniciar sesión' }).click()
    await expect(page.getByText('Correo o contraseña incorrectos.')).toBeVisible()
    await expect(page).toHaveURL(/\/login/)
  })

  test('US07 · Cerrar sesión termina en el inicio', async ({ page }) => {
    await iniciarSesion(page, 'vecino1')
    await page.goto('/mapa')
    await page.getByRole('button', { name: /Vecina Uno/ }).click()
    await page.getByRole('menuitem', { name: 'Cerrar sesión' }).click()
    await expect(page).toHaveURL('/')
    await expect(page.getByRole('link', { name: /Crear cuenta/ }).first()).toBeVisible()
  })

  test('WA7 · Cerrar sesión desde el mapa, Mi perfil y un panel llega siempre al inicio', async ({ page }) => {
    for (const ruta of ['/mapa', '/mi-perfil']) {
      await iniciarSesion(page, 'vecino1')
      await page.goto(ruta)
      await page.getByRole('button', { name: /Vecina Uno/ }).click()
      await page.getByRole('menuitem', { name: 'Cerrar sesión' }).click()
      await expect(page).toHaveURL('/')
    }
    await iniciarSesion(page, 'admin')
    await page.goto('/admin/reportes')
    await page.getByRole('button', { name: /Admin Prueba/ }).click()
    await page.getByRole('menuitem', { name: 'Cerrar sesión' }).click()
    await expect(page).toHaveURL('/')
    await page.goBack()
    await expect(page).not.toHaveURL(/\/admin\/reportes$/)
  })

  test('PF3 · La sesión persiste al recargar', async ({ page }) => {
    await iniciarSesion(page, 'vecino1')
    await page.goto('/mi-perfil')
    await page.reload()
    await expect(page).toHaveURL(/\/mi-perfil/)
    await expect(page.getByRole('button', { name: /Vecina Uno/ })).toBeVisible()
  })
})

test.describe('Registro', () => {
  test('US02 · Registro con email inválido', async ({ page }) => {
    await page.goto('/registro')
    await page.getByLabel('Nombre de usuario').fill('vecino_nuevo')
    await page.getByLabel('Correo electrónico').fill('usuario@@correo')
    await page.getByLabel('Contraseña', { exact: true }).fill(CLAVE)
    await page.getByLabel('Confirmar contraseña').fill(CLAVE)
    await page.getByRole('button', { name: 'Crear cuenta' }).click()
    await expect(page.getByText('El correo no tiene un formato válido.')).toBeVisible()
  })

  test('US03 · Registro con correo existente', async ({ page }) => {
    await page.goto('/registro')
    await page.getByLabel('Nombre de usuario').fill('otro_vecino')
    await page.getByLabel('Correo electrónico').fill(CUENTAS.vecino1.correo)
    await page.getByLabel('Contraseña', { exact: true }).fill(CLAVE)
    await page.getByLabel('Confirmar contraseña').fill(CLAVE)
    await page.getByRole('button', { name: 'Crear cuenta' }).click()
    await expect(page.getByText('Ya existe una cuenta con este correo.')).toBeVisible()
  })

  test('US01 · Registro de usuario exitoso', async ({ page }) => {
    await page.goto('/registro')
    await page.getByLabel('Nombre de usuario').fill('vecino_nuevo')
    await page.getByLabel('Correo electrónico').fill('nuevo@prueba.cl')
    await page.getByLabel('Contraseña', { exact: true }).fill(CLAVE)
    await page.getByLabel('Confirmar contraseña').fill(CLAVE)
    await page.getByRole('button', { name: 'Crear cuenta' }).click()
    await expect(page).toHaveURL('/')
    await expect
      .poll(async () => (await bd.collection('users').where('email', '==', 'nuevo@prueba.cl').get()).docs.map((d) => d.data()))
      .toEqual([expect.objectContaining({ role: 'ciudadano', displayName: 'vecino_nuevo' })])
  })
})

test.describe('Rutas protegidas y redirección por rol', () => {
  test('US08 · Sin sesión las rutas protegidas no muestran datos', async ({ page }) => {
    await page.goto('/mapa')
    await expect(page).toHaveURL(/\/registro/)
    for (const ruta of ['/historial', '/mi-nivel', '/mi-perfil']) {
      await page.goto(ruta)
      await expect(page).toHaveURL(/\/login/)
    }
    await page.goto('/admin')
    await expect(page).toHaveURL('/')
  })

  test('WA4 · Los enlaces al mapa exigen registro', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('link', { name: 'Ver reportes' }).first().click()
    await expect(page).toHaveURL(/\/registro/)
    await page.goto('/')
    await expect(page.getByRole('link', { name: /Ir al mapa/ }).first()).toHaveCount(0)
  })

  test('WA5 · La landing cambia según la sesión y el rol', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('link', { name: /Crear cuenta/ }).first()).toBeVisible()
    await expect(page.getByRole('link', { name: 'Iniciar sesión' }).first()).toBeVisible()
    await iniciarSesion(page, 'admin')
    await expect(page.getByRole('link', { name: /Ir al mapa/ }).first()).toBeVisible()
    await expect(page.getByRole('main').getByRole('link', { name: 'Panel de administración' })).toBeVisible()
  })

  test('WA1 / AD1 · Cada rol llega solo a su panel', async ({ browser }) => {
    const como = (cuenta: 'vecino1' | 'operadorA' | 'admin') => paginaDe(browser, cuenta)
    // Vecino: /admin y /operador lo devuelven al inicio.
    const vecino = await como('vecino1')
    for (const ruta of ['/admin', '/operador']) {
      await vecino.goto(ruta)
      await expect(vecino).toHaveURL('/')
    }
    // Operador: /admin lo devuelve al inicio; /operador abre.
    const operador = await como('operadorA')
    await operador.goto('/admin')
    await expect(operador).toHaveURL('/')
    await operador.goto('/operador')
    await expect(operador).toHaveURL(/\/operador$/)
    // Administrador: /admin abre; /operador lo devuelve al inicio.
    const admin = await como('admin')
    await admin.goto('/admin')
    await expect(admin).toHaveURL(/\/admin$/)
    await admin.goto('/operador')
    await expect(admin).toHaveURL('/')
  })
})

test('US06 · Recuperación de contraseña: se pide el enlace, el emulador lo genera y la clave nueva sirve', async ({ page }) => {
  const correo = 'recuperacion@prueba.cl'
  await autenticacion.createUser({ email: correo, password: 'ClaveVieja1!' })
  await page.goto('/login')
  await page.getByRole('button', { name: '¿Olvidaste tu contraseña?' }).click()
  await page.getByLabel('Correo').fill(correo)
  await page.getByRole('button', { name: 'Enviar enlace de recuperación' }).click()
  await expect(page.getByText('Si el correo existe, te enviamos un enlace para restablecer tu contraseña.')).toBeVisible()
  // El emulador guarda el enlace en vez de enviar un correo: se toma de ahí y se usa.
  const respuesta = await fetch('http://127.0.0.1:9099/emulator/v1/projects/demo-ciudad-alerta/oobCodes')
  const { oobCodes } = (await respuesta.json()) as { oobCodes: Array<{ email: string; requestType: string; oobCode: string }> }
  const codigo = oobCodes.filter((c) => c.email === correo && c.requestType === 'PASSWORD_RESET').pop()
  expect(codigo).toBeTruthy()
  await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:resetPassword?key=demo-key', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ oobCode: codigo!.oobCode, newPassword: 'ClaveNueva1!' }),
  })
  await page.getByRole('button', { name: 'Volver a iniciar sesión' }).click()
  await page.getByLabel('Correo').fill(correo)
  await page.getByLabel('Contraseña').fill('ClaveNueva1!')
  await page.getByRole('button', { name: 'Iniciar sesión' }).click()
  await expect(page).toHaveURL('/')
})
