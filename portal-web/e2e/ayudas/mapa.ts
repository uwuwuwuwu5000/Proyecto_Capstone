import { expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import { POSICION } from '../datos/semilla'

/** Los mosaicos vienen de OpenStreetMap (internet): se reemplazan por un cuadro vacío. */
export async function bloquearMosaicos(page: Page): Promise<void> {
  await page.route(/tile\.openstreetmap\.org/, (ruta) => ruta.fulfill({ status: 204, body: '' }))
}

type ConMapa = { __mapa?: { setView(c: [number, number], z: number, o?: object): void; getZoom(): number } }

/** Abre /mapa y espera a que carguen las incidencias de la región. */
export async function abrirMapa(page: Page): Promise<void> {
  await bloquearMosaicos(page)
  await page.goto('/mapa')
  await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 45_000 })
  await expect(page.getByText(/incidencias? en |No hay incidencias/)).toBeVisible({ timeout: 45_000 })
}

/** Acerca el mapa a unas coordenadas (el mapa puede reencuadrarse un momento después de cargar: se reintenta). */
export async function acercarA(page: Page, lat: number, lng: number, verificar: () => Promise<void>): Promise<void> {
  await expect(async () => {
    await page.evaluate(([la, ln]) => {
      ;(window as unknown as ConMapa).__mapa!.setView([la, ln], 19, { animate: false })
    }, [lat, lng])
    await verificar()
    // El mapa puede reencuadrarse un instante después: se confirma que la vista se mantiene.
    await page.waitForTimeout(800)
    await verificar()
  }).toPass({ timeout: 30_000 })
}

/** Acerca el mapa al reporte (por sus coordenadas) y devuelve su pin. */
export async function pinDe(page: Page, id: string) {
  const { lat, lng } = POSICION[id]
  const pin = page.locator(`[data-reporte-id="${id}"]`)
  await acercarA(page, lat, lng, () => expect(pin).toBeVisible({ timeout: 2_000 }))
  return pin
}

/** Abre el panel de detalle de un reporte desde su pin. */
export async function abrirDetalle(page: Page, id: string): Promise<void> {
  const pin = await pinDe(page, id)
  await pin.click()
  await expect(page.getByRole('complementary', { name: /.+/ })).toBeVisible()
}

export const filtro = (page: Page, etiqueta: 'Región' | 'Categoría' | 'Estado') => page.getByRole('combobox', { name: etiqueta })
