/** Rectángulo geográfico en grados. */
export interface CajaGeografica {
  minLat: number;
  minLng: number;
  maxLat: number;
  maxLng: number;
}

export interface Coordenadas {
  lat: number;
  lng: number;
}

/** El rectángulo más chico que contiene todos los puntos; null si no hay puntos. */
export function cajaDePuntos(puntos: readonly Coordenadas[]): CajaGeografica | null {
  if (puntos.length === 0) return null;
  return {
    minLat: Math.min(...puntos.map((p) => p.lat)),
    minLng: Math.min(...puntos.map((p) => p.lng)),
    maxLat: Math.max(...puntos.map((p) => p.lat)),
    maxLng: Math.max(...puntos.map((p) => p.lng)),
  };
}

export function unirCajas(a: CajaGeografica | null, b: CajaGeografica): CajaGeografica {
  if (!a) return b;
  return {
    minLat: Math.min(a.minLat, b.minLat),
    minLng: Math.min(a.minLng, b.minLng),
    maxLat: Math.max(a.maxLat, b.maxLat),
    maxLng: Math.max(a.maxLng, b.maxLng),
  };
}

export function dentroDeCaja(punto: Coordenadas, caja: CajaGeografica): boolean {
  return punto.lat >= caja.minLat && punto.lat <= caja.maxLat && punto.lng >= caja.minLng && punto.lng <= caja.maxLng;
}

export function areaDeCaja(caja: CajaGeografica): number {
  return (caja.maxLat - caja.minLat) * (caja.maxLng - caja.minLng);
}

/** Caja en el formato `[minLng, minLat, maxLng, maxLat]` de los archivos GeoJSON e indice.json. */
export function cajaDesdeGeoJson(caja: readonly [number, number, number, number]): CajaGeografica {
  return { minLng: caja[0], minLat: caja[1], maxLng: caja[2], maxLat: caja[3] };
}
