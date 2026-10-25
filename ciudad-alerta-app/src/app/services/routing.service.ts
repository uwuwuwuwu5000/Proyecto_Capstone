import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  where,
} from 'firebase/firestore';

import { esFallaDeRed } from '../core/fallas-de-red';
import { FIRESTORE } from '../core/firebase.providers';
import { ComunaDetectada } from './comuna.service';
import { ReportCategory, StatusChange } from '../models/report.model';
import { ORGANISMOS, OperadorDoc, Organismo, OrganismoDoc } from '../models/organismo.model';

/**
 * HU-28 · A quién se deriva un reporte y su historial de estados.
 *
 * - Asignación: organismo responsable (la municipalidad de la comuna) y su
 *   operador activo. La usa la creación de reportes.
 * - Historial: los cambios registrados en `reports/{id}/statusHistory`, que
 *   leen el detalle, el mapa y los avisos.
 *
 * El cambio de estado ya no está aquí: es del módulo `gestion-reportes`
 * (`CambioEstadoService`), que es el único que escribe en el historial.
 */
@Injectable({ providedIn: 'root' })
export class RoutingService {
  private readonly firestore = inject<Firestore>(FIRESTORE);

  /** Municipalidades ya consultadas, para no releer el mismo documento. */
  private readonly cacheMunicipios = new Map<string, Organismo | null>();

  /** Operadores ya consultados por organismo. */
  private readonly cacheOperadores = new Map<string, string | null>();

  /**
   * Determina el organismo responsable del reporte: la municipalidad de la
   * comuna donde se hizo, para cualquier categoría.
   *
   * Antes, las fugas de agua y las luminarias se derivaban a empresas de
   * servicio. Con el modelo de operadores, el organismo responde por el
   * territorio y son sus operadores quienes gestionan cada reporte; una
   * empresa sanitaria o eléctrica puede incorporarse como operador de ese
   * organismo.
   *
   * Si la comuna no se identificó, o su municipalidad no está activa en la
   * base de datos, se usa el organismo genérico. Esto es obligatorio: las
   * reglas exigen que el organismo exista, y asignar uno ausente haría fallar
   * la creación del reporte.
   */
  async resolveOrganismo(
    categoria: ReportCategory,
    comuna: ComunaDetectada | null = null,
  ): Promise<Organismo> {
    const generico = ORGANISMOS[categoria] ?? ORGANISMOS.otro;

    if (!comuna?.organismoId) {
      return generico;
    }

    const municipio = await this.leerMunicipio(comuna.organismoId);
    return municipio ?? generico;
  }

  /**
   * Operador activo de un organismo, o null si no tiene ninguno.
   *
   * Si un organismo tiene varios operadores activos, se toma el primero por
   * orden alfabético de id, para que la asignación sea siempre la misma ante
   * el mismo estado de datos. Repartir carga entre varios operadores es una
   * evolución posible, pero no forma parte de esta historia.
   *
   * Los organismos genéricos (`muni_oirs`, `sanitaria`…) no tienen operadores
   * y devuelven null sin consultar.
   */
  async resolveOperador(organismoId: string): Promise<string | null> {
    if (!/^muni_\d{5}$/.test(organismoId)) {
      return null;
    }

    if (this.cacheOperadores.has(organismoId)) {
      return this.cacheOperadores.get(organismoId) ?? null;
    }

    try {
      const snapshot = await this.consultarOperadores(organismoId);

      const ids = snapshot.docs
        .map((d) => (d.data() as OperadorDoc).id ?? d.id)
        .sort((a, b) => a.localeCompare(b));

      const operadorId = ids[0] ?? null;
      this.cacheOperadores.set(organismoId, operadorId);
      return operadorId;
    } catch (error) {
      // Sin conexión no se sabe quién atiende: quien crea el reporte decide
      // (guardarlo para después). Antes se devolvía null y el reporte quedaba
      // sin operador aunque el organismo tuviera uno.
      if (esFallaDeRed(error)) throw error;
      return null;
    }
  }

  /**
   * Las dos lecturas de Firestore de la asignación, aparte para poder probar
   * el servicio sin red. Dos igualdades sin orderBy: Firestore las resuelve
   * con los índices automáticos de cada campo, sin índice compuesto.
   */
  protected consultarOperadores(organismoId: string) {
    return getDocs(
      query(
        collection(this.firestore, 'operadores'),
        where('organismoId', '==', organismoId),
        where('activo', '==', true),
        limit(10),
      ),
    );
  }

  protected leerOrganismo(organismoId: string) {
    return getDoc(doc(this.firestore, 'organismos', organismoId));
  }

  private async leerMunicipio(organismoId: string): Promise<Organismo | null> {
    if (this.cacheMunicipios.has(organismoId)) {
      return this.cacheMunicipios.get(organismoId) ?? null;
    }

    try {
      const snapshot = await this.leerOrganismo(organismoId);

      if (!snapshot.exists()) {
        this.cacheMunicipios.set(organismoId, null);
        return null;
      }

      const datos = snapshot.data() as OrganismoDoc;

      if (!datos.activo) {
        this.cacheMunicipios.set(organismoId, null);
        return null;
      }

      // El reporte guarda una copia reducida, con el mismo criterio que antes:
      // conserva a quién se derivó aunque el catálogo cambie después.
      const organismo: Organismo = {
        id: datos.id,
        nombre: datos.nombre,
        tipo: datos.tipo,
        comuna: datos.comuna,
      };

      this.cacheMunicipios.set(organismoId, organismo);
      return organismo;
    } catch (error) {
      // Sin conexión no se sabe si la municipalidad está activa. Antes se
      // devolvía null y el reporte se derivaba a la OIRS genérica aunque la
      // comuna tuviera municipalidad: ahora se avisa, y la creación del
      // reporte lo guarda para enviarlo con señal.
      if (esFallaDeRed(error)) throw error;
      return null;
    }
  }

  /**
   * Historial de cambios, del más antiguo al más reciente.
   *
   * BUG 22 · Devuelve `null` si la consulta falla, para no mostrar "sin
   * seguimiento" cuando en realidad no se pudo leer.
   */
  async getStatusHistory(reportId: string): Promise<StatusChange[] | null> {
    try {
      const snapshot = await getDocs(
        query(
          collection(this.firestore, 'reports', reportId, 'statusHistory'),
          orderBy('createdAt', 'asc'),
        ),
      );

      return snapshot.docs.map((d) => d.data() as StatusChange);
    } catch {
      return null;
    }
  }
}
