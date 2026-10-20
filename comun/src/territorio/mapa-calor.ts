/**
 * Agrupación de reportes por comuna para el mapa de calor (F1–F5).
 *
 * Traído del portal web (portal-web/src/pages/Admin/mapaCalor.ts) y
 * generalizado: recibe solo los campos que usa, así sirve con el modelo de
 * reporte de cualquiera de las dos aplicaciones.
 */
import { cutDeOrganismo } from './codigos';
import { normalizar } from './texto';

/** Lo mínimo de un reporte para ubicarlo en una comuna. */
export interface ReporteParaMapaCalor {
  estado: string;
  categoria: string;
  comuna?: string | null;
  /** `organismo.id` del reporte, como `muni_13101`. */
  organismoId?: string | null;
}

/** Lo mínimo del catálogo de comunas. */
export interface ComunaDeCatalogo {
  codigo: string;
  nombre: string;
}

export interface EstadisticaComuna<R extends ReporteParaMapaCalor = ReporteParaMapaCalor> {
  codigo: string;
  total: number;
  sinResolver: number;
  resueltos: number;
  cerrados: number;
  porCategoria: Record<string, number>;
  reportes: R[];
}

export interface ResultadoAgrupacion<R extends ReporteParaMapaCalor = ReporteParaMapaCalor> {
  porComuna: Map<string, EstadisticaComuna<R>>;
  /** Reportes que no se pudieron ubicar (sin municipalidad ni nombre reconocible). */
  sinComuna: number;
}

/**
 * Comuna de un reporte: primero por la municipalidad (`muni_13101` → 13101),
 * que es el dato fiable; si no, por el nombre de la comuna.
 */
export function codigoDeComuna(
  reporte: ReporteParaMapaCalor,
  porNombre: ReadonlyMap<string, string>,
): string | null {
  const desdeOrganismo = cutDeOrganismo(reporte.organismoId);
  if (desdeOrganismo) return desdeOrganismo;
  return reporte.comuna ? (porNombre.get(normalizar(reporte.comuna)) ?? null) : null;
}

export function agruparPorComuna<R extends ReporteParaMapaCalor>(
  reportes: readonly R[],
  catalogo: readonly ComunaDeCatalogo[],
): ResultadoAgrupacion<R> {
  const porNombre = new Map(catalogo.map((c) => [normalizar(c.nombre), c.codigo]));
  const porComuna = new Map<string, EstadisticaComuna<R>>();
  let sinComuna = 0;

  for (const reporte of reportes) {
    const codigo = codigoDeComuna(reporte, porNombre);
    if (!codigo) {
      sinComuna++;
      continue;
    }

    let estadistica = porComuna.get(codigo);
    if (!estadistica) {
      estadistica = { codigo, total: 0, sinResolver: 0, resueltos: 0, cerrados: 0, porCategoria: {}, reportes: [] };
      porComuna.set(codigo, estadistica);
    }

    estadistica.total++;
    if (reporte.estado === 'resuelto') estadistica.resueltos++;
    else if (reporte.estado === 'cerrado') estadistica.cerrados++;
    else estadistica.sinResolver++;
    estadistica.porCategoria[reporte.categoria] = (estadistica.porCategoria[reporte.categoria] ?? 0) + 1;
    estadistica.reportes.push(reporte);
  }

  return { porComuna, sinComuna };
}

/** Intensidad: 0 sin reportes sin resolver; 1 a 5, de menos a más, según el máximo del área. */
export function tramoDeIntensidad(valor: number, maximo: number): number {
  if (valor <= 0 || maximo <= 0) return 0;
  return Math.min(5, Math.max(1, Math.ceil((valor / maximo) * 5)));
}

/** Límites de cada tramo para la leyenda: [[1, 3], [4, 6], …]. */
export function rangosDeTramos(maximo: number): [number, number][] {
  const rangos: [number, number][] = [];
  let desde = 1;
  for (let tramo = 1; tramo <= 5; tramo++) {
    const hasta = Math.max(desde, Math.ceil((maximo * tramo) / 5));
    rangos.push([desde, hasta]);
    desde = hasta + 1;
  }
  return rangos;
}
