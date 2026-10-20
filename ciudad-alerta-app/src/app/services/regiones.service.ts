import { Injectable, inject } from '@angular/core';
import {
  CajaGeografica,
  areaDeCaja,
  cajaDesdeGeoJson,
  codigoRegionDeComuna,
  dentroDeCaja,
  nombreCortoRegion,
  unirCajas,
} from '@ciudad-alerta/comun';

import { GeoPoint } from '../models/report.model';
import { CatalogoComunasService } from './catalogo-comunas.service';
import { ComunaService } from './comuna.service';

export type { CajaGeografica };

/** Una de las 16 regiones de Chile. */
export interface Region {
  /** Código de dos dígitos: '13' es la Metropolitana. */
  codigo: string;
  /**
   * Nombre tal como se guarda en `reports.region` ("Región Metropolitana de
   * Santiago"): sale del mismo catálogo que usa la app al crear un reporte.
   */
  nombre: string;
  /** Nombre corto para listas: "Metropolitana de Santiago", "Valparaíso". */
  nombreCorto: string;
  /** Comunas de la región, con el nombre del catálogo. */
  comunas: string[];
  /**
   * Caja del territorio continental. Se descartan las islas oceánicas (Isla
   * de Pascua y Juan Fernández) para que el mapa no se aleje hasta el Pacífico.
   */
  caja: CajaGeografica | null;
}

interface IndiceGeo {
  comunas: { cut: string; region: string; caja: [number, number, number, number] }[];
}

/** Comunas insulares que no cuentan para encuadrar su región en el mapa. */
const COMUNAS_OCEANICAS = new Set(['05201', '05104']);

/**
 * Catálogo de regiones y región de una ubicación.
 *
 * Las regiones salen del catálogo oficial de comunas (assets/data) y su caja
 * del índice de límites comunales (assets/geo/indice.json). Ambos archivos
 * vienen con la app: no hace falta conexión ni Firestore.
 */
@Injectable({ providedIn: 'root' })
export class RegionesService {
  private readonly catalogo = inject(CatalogoComunasService);
  private readonly comunaService = inject(ComunaService);
  private carga: Promise<Region[]> | null = null;

  /** Las 16 regiones, de norte a sur. */
  todas(): Promise<Region[]> {
    if (!this.carga) {
      this.carga = this.construir().catch((error: unknown) => {
        // Se olvida para reintentar en la próxima llamada.
        this.carga = null;
        throw error;
      });
    }
    return this.carga;
  }

  async porCodigo(codigo: string): Promise<Region | null> {
    return (await this.todas()).find((r) => r.codigo === codigo) ?? null;
  }

  /**
   * Región donde está un punto, con los límites comunales oficiales. Si el
   * punto cae fuera de todas las comunas (en el mar, cerca de la costa), se
   * usa la región cuya caja lo contiene; null si tampoco hay ninguna.
   */
  async regionDe(punto: GeoPoint): Promise<Region | null> {
    const regiones = await this.todas();
    const detectada = await this.comunaService.detectar(punto);
    const codigo = detectada.codigo ? codigoRegionDeComuna(detectada.codigo) : undefined;

    const porComuna =
      regiones.find((r) => r.codigo === codigo) ??
      regiones.find((r) => detectada.region !== null && r.nombre === detectada.region);

    if (porComuna) {
      return porComuna;
    }

    const contienen = regiones.filter((r) => r.caja && dentroDeCaja(punto, r.caja));
    // Con cajas que se traslapan, la más chica es la más probable.
    contienen.sort((a, b) => areaDeCaja(a.caja!) - areaDeCaja(b.caja!));
    return contienen[0] ?? null;
  }

  private async construir(): Promise<Region[]> {
    const [comunas, indice] = await Promise.all([this.catalogo.todas(), this.cargarIndice()]);
    const cajaDe = new Map((indice?.comunas ?? []).map((c) => [c.cut, c.caja]));
    const porCodigo = new Map<string, Region>();

    for (const comuna of comunas) {
      let region = porCodigo.get(comuna.codigoRegion);

      if (!region) {
        region = {
          codigo: comuna.codigoRegion,
          nombre: comuna.region,
          nombreCorto: nombreCortoRegion(comuna.region),
          comunas: [],
          caja: null,
        };
        porCodigo.set(comuna.codigoRegion, region);
      }

      region.comunas.push(comuna.nombre);

      const caja = cajaDe.get(comuna.codigo);
      if (caja && !COMUNAS_OCEANICAS.has(comuna.codigo)) {
        region.caja = unirCajas(region.caja, cajaDesdeGeoJson(caja));
      }
    }

    // De norte a sur: el código no sigue el orden geográfico (Arica es la 15).
    return [...porCodigo.values()].sort(
      (a, b) => (b.caja ? centroLat(b.caja) : -90) - (a.caja ? centroLat(a.caja) : -90),
    );
  }

  private async cargarIndice(): Promise<IndiceGeo | null> {
    try {
      const respuesta = await fetch('assets/geo/indice.json');
      return respuesta.ok ? ((await respuesta.json()) as IndiceGeo) : null;
    } catch {
      return null;
    }
  }
}

function centroLat(caja: CajaGeografica): number {
  return (caja.minLat + caja.maxLat) / 2;
}
