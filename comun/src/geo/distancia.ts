import type { Coordenadas } from './cajas';

const RADIO_TIERRA_M = 6_371_000;

/** Distancia en metros entre dos puntos (fórmula del haversine). */
export function distanciaMetros(a: Coordenadas, b: Coordenadas): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * RADIO_TIERRA_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * "350 m" bajo 1 km y "1,2 km" sobre ese valor. Con `aproximada`, redondea a
 * decenas de metros (nunca menos de 10) y agrega "aprox.": la ubicación del
 * teléfono tiene un margen de error y no conviene aparentar más precisión.
 */
export function formatearDistancia(metros: number, opciones: { aproximada?: boolean } = {}): string {
  const sufijo = opciones.aproximada ? ' aprox.' : '';
  if (metros < 1000) {
    const valor = opciones.aproximada ? Math.max(10, Math.round(metros / 10) * 10) : Math.round(metros);
    return `${valor} m${sufijo}`;
  }
  const km = (Math.round(metros / 100) / 10).toFixed(1).replace('.', ',');
  return `${km} km${sufijo}`;
}
