// El `test` de Playwright con una limpieza más: al terminar cada prueba se cierran los contextos de navegador que
// la prueba abrió con `browser.newContext()` o con `paginaDe()`. Muchas pruebas abren la sesión de otra cuenta y no
// la cierran; sin esto los contextos se acumulan durante toda la corrida (más de 17 páginas abiertas hacia la mitad)
// y una prueba cualquiera falla al preparar o cerrar su grabación de la traza («trace recording timeout»: WX2 en las
// fases 8 y 10, RI7 en la 12). Cada especificación importa `test` y `expect` desde aquí.
import { test as base } from '@playwright/test'
import type { BrowserContext } from '@playwright/test'

export { expect } from '@playwright/test'

export const test = base.extend<{ cerrarContextosPropios: void }>({
  cerrarContextosPropios: [
    async ({ browser }, use) => {
      const abiertos: BrowserContext[] = []
      const original = browser.newContext.bind(browser)
      browser.newContext = async (opciones) => {
        const contexto = await original(opciones)
        abiertos.push(contexto)
        return contexto
      }
      await use()
      browser.newContext = original
      // Los que ya estaban cerrados (por la propia prueba o por Playwright) no dan error.
      await Promise.all(abiertos.map((c) => c.close().catch(() => undefined)))
    },
    { auto: true },
  ],
})
