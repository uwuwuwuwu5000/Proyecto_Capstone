import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  collection,
  doc,
  getCountFromServer,
  getDocs,
  limit,
  orderBy,
  query,
  where,
  writeBatch,
} from 'firebase/firestore';

import { FIRESTORE } from '../../../core/firebase.providers';
import { CatalogoComunasService } from '../../../services/catalogo-comunas.service';
import { OrganismoDoc } from '../../../models/report.model';

/**
 * Escrituras por lote.
 *
 * Firestore admite hasta 500 escrituras por lote, pero las reglas limitan a
 * 20 las lecturas de documentos (get, exists) en todo el lote. Si la regla
 * tuviera que leer el perfil del usuario en cada escritura, un lote mayor a 20
 * se rechazaría con "permiso denegado" aunque el rol fuera correcto.
 *
 * Con 10 por lote queda holgura aun en el peor caso: una cuenta administradora
 * asignada a mano en la consola, cuyo correo no está en la lista y obliga a
 * leer su perfil en cada escritura. Son 35 lotes en lugar de uno; tarda unos
 * segundos más y es seguro.
 */
const TAMANO_LOTE = 10;

export interface ResultadoSincronizacion {
  escritos: number;
  lotes: number;
}

/**
 * Colección `organismos`: las 345 municipalidades de Chile.
 *
 * La carga se hace desde la propia aplicación, por un administrador, a partir
 * del catálogo oficial que viaja con la app. Se optó por esto en lugar de un
 * script con credenciales de servidor porque generar claves de cuenta de
 * servicio suele estar bloqueado en proyectos que pertenecen a una organización
 * institucional, como `duocuc.cl`.
 */
@Injectable({ providedIn: 'root' })
export class OrganismosService {
  private readonly firestore = inject<Firestore>(FIRESTORE);
  private readonly catalogo = inject(CatalogoComunasService);

  /** Cantidad de municipalidades cargadas en la base de datos. */
  async contarMunicipalidades(): Promise<number | null> {
    try {
      const snapshot = await getCountFromServer(
        query(collection(this.firestore, 'organismos'), where('tipo', '==', 'municipio')),
      );
      return snapshot.data().count;
    } catch {
      return null;
    }
  }

  /**
   * Escribe o actualiza todas las municipalidades del catálogo.
   *
   * Es idempotente: cada documento tiene un id derivado del código CUT, así que
   * ejecutarla dos veces actualiza los mismos documentos en vez de duplicarlos.
   * Por eso sirve también para corregir datos si el catálogo cambia.
   */
  async sincronizarMunicipalidades(
    alProgresar?: (hechos: number, total: number) => void,
  ): Promise<ResultadoSincronizacion> {
    const comunas = await this.catalogo.todas();

    if (comunas.length === 0) {
      throw new Error('No se pudo leer el catálogo de comunas incluido en la app.');
    }

    // Agrupa por municipio: la comuna Antártica comparte el de Cabo de Hornos.
    const porOrganismo = new Map<string, OrganismoDoc>();

    for (const comuna of comunas) {
      const existente = porOrganismo.get(comuna.organismoId);

      if (existente) {
        existente.comunasAtendidas.push(comuna.codigo);
        continue;
      }

      const esSede = comuna.organismoId === `muni_${comuna.codigo}`;

      porOrganismo.set(comuna.organismoId, {
        id: comuna.organismoId,
        nombre: esSede ? `Municipalidad de ${comuna.nombre}` : '',
        tipo: 'municipio',
        comunasAtendidas: [comuna.codigo],
        comuna: esSede ? comuna.nombre : null,
        codigoRegion: comuna.codigoRegion,
        region: comuna.region,
        activo: true,
      });
    }

    // Completa los nombres de los municipios cuya comuna sede apareció después.
    for (const comuna of comunas) {
      const organismo = porOrganismo.get(comuna.organismoId);

      if (organismo && organismo.id === `muni_${comuna.codigo}`) {
        organismo.nombre = `Municipalidad de ${comuna.nombre}`;
        organismo.comuna = comuna.nombre;
      }
    }

    const organismos = [...porOrganismo.values()];
    let escritos = 0;
    let lotes = 0;

    for (let inicio = 0; inicio < organismos.length; inicio += TAMANO_LOTE) {
      const lote = writeBatch(this.firestore);

      for (const organismo of organismos.slice(inicio, inicio + TAMANO_LOTE)) {
        lote.set(doc(this.firestore, 'organismos', organismo.id), organismo);
      }

      await lote.commit();
      escritos += Math.min(TAMANO_LOTE, organismos.length - inicio);
      lotes += 1;
      alProgresar?.(escritos, organismos.length);
    }

    return { escritos, lotes };
  }

  /** Municipalidades de una región, ordenadas por nombre. */
  async listarPorRegion(codigoRegion: string): Promise<OrganismoDoc[]> {
    const snapshot = await getDocs(
      query(
        collection(this.firestore, 'organismos'),
        where('codigoRegion', '==', codigoRegion),
        orderBy('nombre'),
        limit(100),
      ),
    );

    return snapshot.docs.map((d) => d.data() as OrganismoDoc);
  }
}
