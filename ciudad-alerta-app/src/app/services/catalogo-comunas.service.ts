import { Injectable } from '@angular/core';

/** Comuna del catálogo oficial, con la municipalidad que la atiende. */
export interface ComunaCatalogo {
  /** Código Único Territorial (CUT), de cinco dígitos. */
  codigo: string;
  nombre: string;
  /** Nombre sin tildes ni signos, para comparar entre fuentes. */
  clave: string;
  codigoRegion: string;
  region: string;
  /** Id del documento en `organismos` que atiende esta comuna. */
  organismoId: string;
}

interface ArchivoCatalogo {
  comunas: ComunaCatalogo[];
}

/**
 * Variantes ortográficas que aparecen en distintas fuentes para una misma
 * comuna. Los límites comunales de la BCN, OpenStreetMap y el registro oficial
 * no siempre escriben igual los nombres; sin esta tabla, una comuna detectada
 * como "Coihaique" no encontraría su municipalidad, registrada como
 * "Coyhaique".
 */
const ALIAS: Readonly<Record<string, string>> = {
  coihaique: 'coyhaique',
  aisen: 'aysen',
  'til til': 'tiltil',
  'llay llay': 'llaillay',
  marchihue: 'marchigue',
  paiguano: 'paihuano',
  trehuaco: 'treguaco',
  'cabo de hornos ex navarino': 'cabo de hornos',
  navarino: 'cabo de hornos',
  'la calera': 'calera',
  'alto bio bio': 'alto biobio',
};

/**
 * Catálogo oficial de las 346 comunas de Chile y la municipalidad que atiende
 * a cada una.
 *
 * Es la fuente de verdad para dos cosas: normalizar el nombre de una comuna
 * detectada —venga de los límites oficiales o de otro servicio— y saber qué
 * municipalidad corresponde a una ubicación. Se distribuye como archivo
 * estático en la app porque cambia muy rara vez: la última modificación a la
 * división comunal fue la creación de la Región de Ñuble, en 2018.
 */
@Injectable({ providedIn: 'root' })
export class CatalogoComunasService {
  private porCodigo = new Map<string, ComunaCatalogo>();
  private porClave = new Map<string, ComunaCatalogo>();
  private carga: Promise<void> | null = null;

  /** Todas las comunas, para quien necesite recorrer el catálogo completo. */
  async todas(): Promise<ComunaCatalogo[]> {
    await this.cargar();
    return [...this.porCodigo.values()];
  }

  /**
   * Busca una comuna por código CUT, que es la forma fiable, o por nombre
   * cuando la fuente no trae código.
   */
  async buscar(codigo: string | null, nombre: string | null): Promise<ComunaCatalogo | null> {
    await this.cargar();

    if (codigo) {
      // Algunas fuentes guardan el código como número y pierden el cero inicial
      // de las regiones 1 a 9 ("5101" en vez de "05101").
      const encontrada = this.porCodigo.get(codigo.padStart(5, '0'));

      if (encontrada) {
        return encontrada;
      }
    }

    if (nombre) {
      const clave = CatalogoComunasService.clave(nombre);
      const buscada = ALIAS[clave] ?? clave;

      return (
        this.porClave.get(buscada) ??
        // Último intento: sin espacios, para "Til Til" frente a "Tiltil".
        this.buscarSinEspacios(buscada)
      );
    }

    return null;
  }

  /** Quita tildes, signos y mayúsculas para comparar nombres entre fuentes. */
  static clave(texto: string): string {
    return texto
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9 ]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private buscarSinEspacios(clave: string): ComunaCatalogo | null {
    const compacta = clave.replace(/ /g, '');

    for (const comuna of this.porClave.values()) {
      if (comuna.clave.replace(/ /g, '') === compacta) {
        return comuna;
      }
    }

    return null;
  }

  private cargar(): Promise<void> {
    if (this.porCodigo.size > 0) {
      return Promise.resolve();
    }

    if (!this.carga) {
      this.carga = fetch('assets/data/comunas-chile.json')
        .then((respuesta) => {
          if (!respuesta.ok) {
            throw new Error(`Catálogo de comunas no disponible (${respuesta.status}).`);
          }

          return respuesta.json() as Promise<ArchivoCatalogo>;
        })
        .then((archivo) => {
          for (const comuna of archivo.comunas) {
            this.porCodigo.set(comuna.codigo, comuna);
            this.porClave.set(comuna.clave, comuna);
          }
        })
        .catch((error) => {
          console.error(error);
          // Se permite reintentar en la próxima llamada.
          this.carga = null;
        });
    }

    return this.carga;
  }
}
