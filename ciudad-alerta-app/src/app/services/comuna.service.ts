import { Injectable, inject } from '@angular/core';

import { environment } from '../../environments/environment';
import { GeoPoint } from '../models/report.model';
import { CatalogoComunasService } from './catalogo-comunas.service';

export interface ComunaDetectada {
  comuna: string | null;
  region: string | null;
  /** Código Único Territorial, cuando se pudo identificar en el catálogo. */
  codigo: string | null;
  /** Municipalidad que atiende la comuna, según el catálogo oficial. */
  organismoId: string | null;
  fuente: 'limites_oficiales' | 'nominatim' | 'no_disponible';
}

interface IndiceRegional {
  regiones: { codigo: string; archivo: string }[];
  comunas: { cut: string; region: string; caja: [number, number, number, number] }[];
}

type Anillo = number[][];
type Poligono = Anillo[];

interface ComunaIndexada {
  nombre: string;
  codigo: string | null;
  region: string | null;
  /** Caja envolvente [minLng, minLat, maxLng, maxLat] para descartar rápido. */
  caja: [number, number, number, number];
  poligonos: Poligono[];
}

/** Propiedades donde suele venir el código CUT según la fuente del GeoJSON. */
const CLAVES_CODIGO = ['CUT_COM', 'COD_COMUNA', 'CODIGO', 'cod_comuna', 'codigo_comuna', 'cut'];

/** Propiedades donde suelen venir los nombres según la fuente del GeoJSON. */
const CLAVES_COMUNA = ['Comuna', 'COMUNA', 'comuna', 'NOM_COM', 'NOM_COMUNA', 'nombre', 'name'];
const CLAVES_REGION = ['Region', 'REGION', 'region', 'NOM_REG', 'NOM_REGION'];

const SIN_DATO: ComunaDetectada = {
  comuna: null,
  region: null,
  codigo: null,
  organismoId: null,
  fuente: 'no_disponible',
};

/**
 * Detección de la comuna de una ubicación.
 *
 * La estrategia por defecto compara el punto contra los límites comunales
 * oficiales cargados en el dispositivo. Frente a un geocodificador inverso
 * tiene tres ventajas para este caso de uso:
 *
 *  - Usa el límite administrativo real. Un geocodificador devuelve la dirección
 *    del objeto de mapa más cercano, que cerca de un borde puede pertenecer a la
 *    comuna vecina: justo el error que un organismo no puede tolerar al revisar
 *    su área de responsabilidad.
 *  - Funciona sin conexión y sin límites de uso.
 *  - No envía la ubicación de los usuarios a un servicio de terceros.
 *
 * Nunca lanza errores: si no puede determinar la comuna devuelve `null` y el
 * reporte se guarda igual. La comuna enriquece el reporte, no lo condiciona.
 */
@Injectable({ providedIn: 'root' })
export class ComunaService {
  private readonly catalogo = inject(CatalogoComunasService);
  private readonly cache = new Map<string, ComunaDetectada>();

  /**
   * Índice liviano (26 KB) con la caja envolvente de cada comuna y la región a
   * la que pertenece. Permite saber qué archivo regional descargar sin cargar
   * la geometría de todo el país, que pesa más de 3 MB.
   */
  private indiceRegional: IndiceRegional | null = null;
  private cargaIndice: Promise<IndiceRegional | null> | null = null;
  private readonly regionesCargadas = new Map<string, Promise<ComunaIndexada[]>>();

  async detectar(punto: GeoPoint): Promise<ComunaDetectada> {
    // Cuatro decimales equivalen a unos 11 metros: suficiente para reutilizar
    // el resultado si el usuario actualiza la ubicación sin moverse.
    const clave = `${punto.lat.toFixed(4)},${punto.lng.toFixed(4)}`;
    const guardado = this.cache.get(clave);

    if (guardado) {
      return guardado;
    }

    const detectada =
      environment.comunaResolver === 'nominatim'
        ? await this.porNominatim(punto)
        : await this.porLimitesOficiales(punto);

    const resultado = await this.contrastarConCatalogo(detectada);

    if (resultado.comuna) {
      this.cache.set(clave, resultado);
    }

    return resultado;
  }

  /**
   * Cruza la comuna detectada con el catálogo oficial.
   *
   * Unifica el nombre —las fuentes difieren en ortografía: "Coihaique" frente a
   * "Coyhaique", "Til Til" frente a "Tiltil"— y resuelve la municipalidad
   * responsable. Si la comuna no aparece en el catálogo, se conserva lo
   * detectado sin municipalidad asignada.
   */
  private async contrastarConCatalogo(detectada: ComunaDetectada): Promise<ComunaDetectada> {
    if (!detectada.comuna && !detectada.codigo) {
      return detectada;
    }

    const oficial = await this.catalogo.buscar(detectada.codigo, detectada.comuna);

    if (!oficial) {
      return detectada;
    }

    return {
      comuna: oficial.nombre,
      region: oficial.region,
      codigo: oficial.codigo,
      organismoId: oficial.organismoId,
      fuente: detectada.fuente,
    };
  }

  // -------------------------------------------------------------------------
  // Estrategia 1 · Límites comunales oficiales
  // -------------------------------------------------------------------------

  private async porLimitesOficiales(punto: GeoPoint): Promise<ComunaDetectada> {
    const candidatas = await this.comunasCandidatas(punto);

    for (const comuna of candidatas) {
      if (!this.dentroDeCaja(punto, comuna.caja)) {
        continue;
      }

      if (comuna.poligonos.some((poligono) => this.dentroDePoligono(punto, poligono))) {
        return {
          comuna: comuna.nombre,
          region: comuna.region,
          codigo: comuna.codigo,
          organismoId: null,
          fuente: 'limites_oficiales',
        };
      }
    }

    return SIN_DATO;
  }

  /**
   * Devuelve solo las comunas que podrían contener el punto.
   *
   * 1. Con el índice, descarta todas las comunas cuya caja no lo contiene.
   * 2. Descarga únicamente los archivos de las regiones que quedan. Para un
   *    punto en Santiago es uno solo, de 84 KB.
   *
   * Si el índice no existe, recurre al archivo único `comunas.geojson`, por si
   * el equipo prefiere cargar sus propios límites.
   */
  private async comunasCandidatas(punto: GeoPoint): Promise<ComunaIndexada[]> {
    const indice = await this.cargarIndiceRegional();

    if (!indice) {
      return this.cargarArchivo('assets/geo/comunas.geojson');
    }

    const regiones = new Set(
      indice.comunas
        .filter((comuna) => this.dentroDeCaja(punto, comuna.caja))
        .map((comuna) => comuna.region),
    );

    const archivos = indice.regiones.filter((region) => regiones.has(region.codigo));
    const cargadas = await Promise.all(
      archivos.map((region) => this.cargarRegion(region.codigo, region.archivo)),
    );

    return cargadas.flat();
  }

  private cargarIndiceRegional(): Promise<IndiceRegional | null> {
    if (this.indiceRegional) {
      return Promise.resolve(this.indiceRegional);
    }

    if (!this.cargaIndice) {
      this.cargaIndice = fetch('assets/geo/indice.json')
        .then((respuesta) => (respuesta.ok ? (respuesta.json() as Promise<IndiceRegional>) : null))
        .then((indice) => {
          this.indiceRegional = indice;
          return indice;
        })
        .catch(() => null)
        .finally(() => {
          this.cargaIndice = null;
        });
    }

    return this.cargaIndice;
  }

  private cargarRegion(codigo: string, archivo: string): Promise<ComunaIndexada[]> {
    let carga = this.regionesCargadas.get(codigo);

    if (!carga) {
      carga = this.cargarArchivo(`assets/geo/${archivo}`);
      this.regionesCargadas.set(codigo, carga);

      // Si falla, se olvida para poder reintentar en el próximo reporte.
      void carga.then((comunas) => {
        if (comunas.length === 0) {
          this.regionesCargadas.delete(codigo);
        }
      });
    }

    return carga;
  }

  private cargarArchivo(ruta: string): Promise<ComunaIndexada[]> {
    return fetch(ruta)
      .then((respuesta) => {
        if (!respuesta.ok) {
          throw new Error(`No se encontró ${ruta} (${respuesta.status}).`);
        }

        return respuesta.json();
      })
      .then((geojson) => this.indexar(geojson))
      .catch((error) => {
        console.warn('Límites comunales no disponibles:', error);
        return [];
      });
  }

  private indexar(geojson: {
    features?: {
      properties?: Record<string, unknown>;
      geometry?: { type: string; coordinates: unknown };
    }[];
  }): ComunaIndexada[] {
    const resultado: ComunaIndexada[] = [];

    for (const feature of geojson.features ?? []) {
      const nombre = this.leerPropiedad(feature.properties, CLAVES_COMUNA);
      const geometria = feature.geometry;

      if (!nombre || !geometria) {
        continue;
      }

      // Polygon es una lista de anillos; MultiPolygon, una lista de polígonos.
      // Se normaliza todo a MultiPolygon para recorrerlo de una sola forma.
      const poligonos: Poligono[] =
        geometria.type === 'Polygon'
          ? [geometria.coordinates as Poligono]
          : geometria.type === 'MultiPolygon'
            ? (geometria.coordinates as Poligono[])
            : [];

      if (poligonos.length === 0) {
        continue;
      }

      resultado.push({
        nombre: this.normalizarNombre(nombre),
        codigo: this.leerPropiedad(feature.properties, CLAVES_CODIGO),
        region: this.leerPropiedad(feature.properties, CLAVES_REGION),
        caja: this.calcularCaja(poligonos),
        poligonos,
      });
    }

    return resultado;
  }

  /**
   * Algoritmo de trazado de rayos: se lanza una semirrecta desde el punto y
   * se cuentan los cruces con el borde. Un número impar significa que está
   * dentro. El primer anillo es el contorno exterior y los siguientes son
   * huecos; un punto dentro de un hueco queda fuera del polígono.
   */
  private dentroDePoligono(punto: GeoPoint, poligono: Poligono): boolean {
    const [exterior, ...huecos] = poligono;

    if (!exterior || !this.dentroDeAnillo(punto, exterior)) {
      return false;
    }

    return !huecos.some((hueco) => this.dentroDeAnillo(punto, hueco));
  }

  private dentroDeAnillo(punto: GeoPoint, anillo: Anillo): boolean {
    // GeoJSON guarda las coordenadas como [longitud, latitud].
    const x = punto.lng;
    const y = punto.lat;
    let dentro = false;

    for (let i = 0, j = anillo.length - 1; i < anillo.length; j = i++) {
      const [xi, yi] = anillo[i];
      const [xj, yj] = anillo[j];

      const cruza = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;

      if (cruza) {
        dentro = !dentro;
      }
    }

    return dentro;
  }

  private calcularCaja(poligonos: Poligono[]): [number, number, number, number] {
    let minLng = Infinity;
    let minLat = Infinity;
    let maxLng = -Infinity;
    let maxLat = -Infinity;

    for (const poligono of poligonos) {
      for (const [lng, lat] of poligono[0] ?? []) {
        minLng = Math.min(minLng, lng);
        minLat = Math.min(minLat, lat);
        maxLng = Math.max(maxLng, lng);
        maxLat = Math.max(maxLat, lat);
      }
    }

    return [minLng, minLat, maxLng, maxLat];
  }

  private dentroDeCaja(punto: GeoPoint, caja: [number, number, number, number]): boolean {
    return (
      punto.lng >= caja[0] &&
      punto.lat >= caja[1] &&
      punto.lng <= caja[2] &&
      punto.lat <= caja[3]
    );
  }

  // -------------------------------------------------------------------------
  // Estrategia 2 · Nominatim (opcional)
  // -------------------------------------------------------------------------

  /**
   * Geocodificación inversa con el servicio público de OpenStreetMap.
   *
   * Solo se usa si el equipo lo activa en environment.ts. Su política de uso
   * exige una decisión deliberada de los desarrolladores, identificar la app
   * con un correo de contacto y no superar una petición por segundo. Aquí se
   * hace a lo sumo una consulta por reporte, y se reutiliza el resultado de
   * ubicaciones ya consultadas.
   */
  private async porNominatim(punto: GeoPoint): Promise<ComunaDetectada> {
    if (!environment.nominatimEmail) {
      console.warn('Nominatim requiere nominatimEmail en environment.ts.');
      return SIN_DATO;
    }

    const parametros = new URLSearchParams({
      format: 'jsonv2',
      lat: String(punto.lat),
      lon: String(punto.lng),
      // Nivel de ciudad: evita que el resultado sea una calle o un comercio.
      zoom: '10',
      addressdetails: '1',
      'accept-language': 'es',
      email: environment.nominatimEmail,
    });

    const controlador = new AbortController();
    const temporizador = setTimeout(() => controlador.abort(), 6000);

    try {
      const respuesta = await fetch(
        `https://nominatim.openstreetmap.org/reverse?${parametros}`,
        { signal: controlador.signal },
      );

      if (!respuesta.ok) {
        return SIN_DATO;
      }

      const datos = (await respuesta.json()) as {
        address?: Record<string, string>;
      };
      const direccion = datos.address ?? {};

      // En Chile la comuna suele venir como city, town o village según su
      // tamaño. `county` corresponde a la provincia y no se usa.
      const comuna =
        direccion['city'] ??
        direccion['town'] ??
        direccion['village'] ??
        direccion['municipality'] ??
        null;

      return comuna
        ? {
            comuna: this.normalizarNombre(comuna),
            region: direccion['state'] ?? null,
            codigo: null,
            organismoId: null,
            fuente: 'nominatim',
          }
        : SIN_DATO;
    } catch {
      return SIN_DATO;
    } finally {
      clearTimeout(temporizador);
    }
  }

  // -------------------------------------------------------------------------

  private leerPropiedad(
    propiedades: Record<string, unknown> | undefined,
    claves: string[],
  ): string | null {
    if (!propiedades) {
      return null;
    }

    for (const clave of claves) {
      const valor = propiedades[clave];

      if (typeof valor === 'string' && valor.trim()) {
        return valor.trim();
      }

      if (typeof valor === 'number' && Number.isFinite(valor)) {
        return String(valor);
      }
    }

    return null;
  }

  /**
   * Unifica el formato del nombre: los archivos oficiales suelen venir en
   * mayúsculas ("MAIPÚ") y así se comparan igual con los de otras fuentes.
   * Se respetan tildes y conectores en minúscula ("Lo Barnechea", "San José
   * de Maipo").
   */
  private normalizarNombre(nombre: string): string {
    const menores = new Set(['de', 'del', 'la', 'las', 'los', 'y']);

    return nombre
      .trim()
      .toLocaleLowerCase('es-CL')
      .split(/\s+/)
      .map((palabra, indice) =>
        indice > 0 && menores.has(palabra)
          ? palabra
          : palabra.charAt(0).toLocaleUpperCase('es-CL') + palabra.slice(1),
      )
      .join(' ')
      .slice(0, 80);
  }
}
