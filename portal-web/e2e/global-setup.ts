import { chromium } from '@playwright/test'
import type { FullConfig } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { CLAVE, CUENTAS, sembrar } from './datos/semilla'
import { rutaSesion } from './ayudas/sesion'

/**
 * 1) Carga los datos de prueba en los emuladores.
 * 2) Inicia sesión una vez con cada cuenta y guarda el estado, para que las pruebas
 *    no tengan que pasar por la pantalla de login cada vez.
 */
export default async function globalSetup(config: FullConfig) {
  await sembrar(true)
  mkdirSync('e2e/.sesiones', { recursive: true })
  const baseURL = config.projects[0].use.baseURL!
  const navegador = await chromium.launch()
  for (const cuenta of Object.keys(CUENTAS) as Array<keyof typeof CUENTAS>) {
    const contexto = await navegador.newContext({ baseURL })
    const pagina = await contexto.newPage()
    await pagina.goto('/login')
    await pagina.getByLabel('Correo').fill(CUENTAS[cuenta].correo)
    await pagina.getByLabel('Contraseña').fill(CLAVE)
    await pagina.getByRole('button', { name: 'Iniciar sesión' }).click()
    await pagina.waitForURL(baseURL + '/')
    await pagina.getByRole('button', { name: new RegExp(CUENTAS[cuenta].nombre) }).waitFor()
    await contexto.storageState({ path: rutaSesion(cuenta), indexedDB: true })
    await contexto.close()
  }
  await navegador.close()
}
