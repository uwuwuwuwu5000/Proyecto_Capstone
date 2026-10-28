import { Injectable, inject } from '@angular/core';
import {
  DocumentSnapshot,
  Firestore,
  QueryDocumentSnapshot,
  Timestamp,
  collection,
  doc,
  endAt,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
  startAt,
  where,
} from 'firebase/firestore';
import { FirebaseError } from 'firebase/app';
import { distanceBetween, geohashQueryBounds } from 'geofire-common';

import { FIRESTORE } from '../core/firebase.providers';
import { AuthService } from './auth.service';
import {
  GeoPoint,
  NearbyReport,
  Report,
  ReportCategory,
  ReportStatus,
} from '../models/report.model';

export interface FiltrosMapa {
  categoria: ReportCategory | 'todas';
  estado: ReportStatus | 'todos';
}

export interface FiltrosBandejaReportes {
  categoria: ReportCategory | 'todas';
  estado: ReportStatus | 'todos';
  /** Comuna exacta, tal como quedó normalizada al detectarla. */
  comuna: string | 'todas';
}

export interface ReportesDeRegion {
  /** Del más reciente al más antiguo, ya filtrados. */
  reportes: Report[];
  /** Había más que el máximo pedido: se entregan solo los más recientes. */
  hayMas: boolean;
}

/** Lo mínimo que se necesita de una región para consultarla. */
export interface RegionConsultable {
  /** Igual a `reports.region`: "Región Metropolitana de Santiago". */
  nombre: string;
  /** Comunas de la región, para los reportes antiguos sin `region`. */
  comunas: string[];
}

/** Firestore acepta hasta 30 valores en un filtro `in`. */
const MAXIMO_EN_FILTRO_IN = 30;

export interface PaginaReportes {
  reportes: Report[];
  /** Cursor para pedir la siguiente página. Null si no hay más. */
  cursor: QueryDocumentSnapshot | null;
}

/**
 * Consultas de lectura sobre la colección `reports`.
 *
 * Se mantiene separada de ReportService (que escribe) para que la página del
 * mapa y el historial no arrastren las dependencias de cámara y almacenamiento.
 */
@Injectable({ providedIn: 'root' })
export class ReportQueryService {
  private readonly firestore = inject<Firestore>(FIRESTORE);
  private readonly authService = inject(AuthService);

  /**
   * HU-25 · Reportes dentro de un radio, con filtros opcionales.
   *
   * La consulta se acota por rangos de geohash para no descargar la colección
   * completa, y la distancia real se calcula sobre los resultados porque los
   * rangos incluyen falsos positivos en los bordes.
   */
  async findNearby(
    centro: GeoPoint,
    radioMetros: number,
    filtros: FiltrosMapa = { categoria: 'todas', estado: 'todos' },
  ): Promise<NearbyReport[]> {
    const punto: [number, number] = [centro.lat, centro.lng];
    const rangos = geohashQueryBounds(punto, radioMetros);
    const referencia = collection(this.firestore, 'reports');

    const consultas = rangos.map((rango) => {
      const restricciones = [
        ...(filtros.categoria !== 'todas'
          ? [where('categoria', '==', filtros.categoria)]
          : []),
        orderBy('geohash'),
        startAt(rango[0]),
        endAt(rango[1]),
      ];

      return getDocs(query(referencia, ...restricciones));
    });

    const resultados = await Promise.all(consultas);
    const porId = new Map<string, Report>();

    for (const snapshot of resultados) {
      for (const documento of snapshot.docs) {
        porId.set(documento.id, { id: documento.id, ...documento.data() } as Report);
      }
    }

    return [...porId.values()]
      .filter((report) => filtros.estado === 'todos' || report.estado === filtros.estado)
      .map((report) => ({
        report,
        distanciaMetros: Math.round(
          distanceBetween(punto, [report.ubicacion.lat, report.ubicacion.lng]) * 1000,
        ),
      }))
      .filter((item) => item.distanciaMetros <= radioMetros)
      .sort((a, b) => a.distanciaMetros - b.distanciaMetros);
  }

  /**
   * Mapa de incidencias · Todos los reportes de una región, del más reciente
   * al más antiguo, hasta `maximo`.
   *
   * Se consulta por `region`, que la app escribe al crear el reporte con el
   * nombre del catálogo oficial. Es una sola consulta con el índice
   * `region + createdAt`; si el índice todavía no está desplegado, se repite
   * sin ordenar para que el mapa funcione igual.
   *
   * Con `incluirSinRegion` también busca por comuna los reportes antiguos que
   * no tienen `region` (de a 30 comunas por consulta). Cuesta lecturas extra:
   * después de completar la región con scripts/ubicaciones-reportes.mjs
   * conviene apagarlo en los parámetros del mapa.
   *
   * Categoría y estado se filtran sobre el resultado, para no necesitar un
   * índice por cada combinación.
   */
  async porRegion(
    region: RegionConsultable,
    filtros: FiltrosMapa = { categoria: 'todas', estado: 'todos' },
    opciones: { maximo: number; incluirSinRegion: boolean } = { maximo: 500, incluirSinRegion: true },
  ): Promise<ReportesDeRegion> {
    const referencia = collection(this.firestore, 'reports');
    const { maximo } = opciones;

    let principal;
    try {
      principal = await getDocs(
        query(referencia, where('region', '==', region.nombre), orderBy('createdAt', 'desc'), limit(maximo + 1)),
      );
    } catch (error) {
      if (!(error instanceof FirebaseError) || error.code !== 'failed-precondition') {
        throw error;
      }
      console.warn(
        'Falta el índice reports(region, createdAt). Despliégalo con: firebase deploy --only firestore:indexes',
      );
      principal = await getDocs(query(referencia, where('region', '==', region.nombre), limit(maximo + 1)));
    }

    const porId = new Map<string, Report>();
    for (const documento of principal.docs) {
      porId.set(documento.id, { id: documento.id, ...documento.data() } as Report);
    }

    if (opciones.incluirSinRegion && region.comunas.length) {
      const grupos: string[][] = [];
      for (let i = 0; i < region.comunas.length; i += MAXIMO_EN_FILTRO_IN) {
        grupos.push(region.comunas.slice(i, i + MAXIMO_EN_FILTRO_IN));
      }

      const antiguos = await Promise.all(
        grupos.map((comunas) => getDocs(query(referencia, where('comuna', 'in', comunas), limit(maximo)))),
      );

      for (const snapshot of antiguos) {
        for (const documento of snapshot.docs) {
          const datos = documento.data() as Partial<Report>;
          if (!datos.region && !porId.has(documento.id)) {
            porId.set(documento.id, { id: documento.id, ...datos } as Report);
          }
        }
      }
    }

    const milisegundos = (r: Report) => (r.createdAt instanceof Timestamp ? r.createdAt.toMillis() : 0);
    const todos = [...porId.values()].sort((a, b) => milisegundos(b) - milisegundos(a));
    const filtrados = todos.filter(
      (r) =>
        (filtros.categoria === 'todas' || r.categoria === filtros.categoria) &&
        (filtros.estado === 'todos' || r.estado === filtros.estado),
    );

    return {
      reportes: filtrados.slice(0, maximo),
      hayMas: principal.docs.length > maximo || filtrados.length > maximo,
    };
  }

  /**
   * Todos los reportes del sistema, ordenados por fecha de creación.
   *
   * A diferencia de `findNearby`, no depende de la ubicación del usuario ni del
   * geohash: la bandeja de gestión necesita ver la totalidad de las incidencias,
   * incluidas las de sectores donde el funcionario no se encuentra. Las reglas
   * solo permiten leer reportes a usuarios autenticados, y la pantalla que la
   * consume está restringida a roles de gestión.
   */
  async todosLosReportes(
    filtros: FiltrosBandejaReportes = { categoria: 'todas', estado: 'todos', comuna: 'todas' },
    tamanoPagina = 20,
    cursor: QueryDocumentSnapshot | null = null,
  ): Promise<PaginaReportes> {
    /**
     * Una sola igualdad viaja en la consulta, para no necesitar un índice por
     * cada combinación de filtros; el resto se aplica sobre el resultado. La
     * comuna tiene prioridad porque es el filtro más selectivo para un
     * organismo, que trabaja sobre su área de responsabilidad.
     */
    const campoServidor: 'comuna' | 'categoria' | 'estado' | null =
      filtros.comuna !== 'todas'
        ? 'comuna'
        : filtros.categoria !== 'todas'
          ? 'categoria'
          : filtros.estado !== 'todos'
            ? 'estado'
            : null;

    const restricciones = [
      ...(campoServidor ? [where(campoServidor, '==', filtros[campoServidor])] : []),
      orderBy('createdAt', 'desc'),
      ...(cursor ? [startAfter(cursor)] : []),
      limit(tamanoPagina + 1),
    ];

    const snapshot = await getDocs(
      query(collection(this.firestore, 'reports'), ...restricciones),
    );

    const hayMas = snapshot.docs.length > tamanoPagina;
    const documentos = hayMas ? snapshot.docs.slice(0, tamanoPagina) : snapshot.docs;

    const reportes = documentos
      .map((d) => ({ id: d.id, ...d.data() }) as Report)
      .filter(
        (reporte) =>
          (filtros.categoria === 'todas' || reporte.categoria === filtros.categoria) &&
          (filtros.estado === 'todos' || reporte.estado === filtros.estado),
      );

    return {
      reportes,
      cursor: hayMas ? documentos[documentos.length - 1] : null,
    };
  }

  /**
   * Reportes asignados a un operador, del más reciente al más antiguo.
   *
   * Filtra solo por `operadorId` y ordena en el cliente: así no necesita un
   * índice compuesto. Un operador municipal maneja un volumen acotado en el
   * piloto; si crece, conviene paginar con un índice `operadorId` + `createdAt`.
   */
  async reportesDeOperador(operadorId: string, maximo = 100): Promise<Report[]> {
    const snapshot = await getDocs(
      query(
        collection(this.firestore, 'reports'),
        where('operadorId', '==', operadorId),
        limit(maximo),
      ),
    );

    return snapshot.docs
      .map((d) => ({ id: d.id, ...d.data() }) as Report)
      .sort(
        (a, b) =>
          (b.createdAt instanceof Timestamp ? b.createdAt.toMillis() : 0) -
          (a.createdAt instanceof Timestamp ? a.createdAt.toMillis() : 0),
      );
  }

  /**
   * 1.2 · Lo que ve una cuenta de organismo: los reportes de su organismo ya
   * validados por la comunidad (`validacion.validado`). Es la única consulta
   * de reportes que las reglas le permiten: sin estos dos filtros, se rechaza.
   *
   * Usa el índice reports(organismo.id, validacion.validado, createdAt) para
   * traer primero los más nuevos. Si todavía no está desplegado, consulta solo
   * con las dos igualdades (no necesitan índice) y ordena en el teléfono.
   */
  async validadosDeOrganismo(organismoId: string, maximo = 500): Promise<{ reportes: Report[]; hayMas: boolean }> {
    const referencia = collection(this.firestore, 'reports');
    const filtros = [where('organismo.id', '==', organismoId), where('validacion.validado', '==', true)];

    let snapshot;
    try {
      snapshot = await getDocs(query(referencia, ...filtros, orderBy('createdAt', 'desc'), limit(maximo + 1)));
    } catch (error) {
      if (!(error instanceof FirebaseError) || error.code !== 'failed-precondition') {
        throw error;
      }
      console.warn(
        'Falta el índice reports(organismo.id, validacion.validado, createdAt). Despliégalo con: firebase deploy --only firestore:indexes',
      );
      snapshot = await getDocs(query(referencia, ...filtros, limit(maximo + 1)));
    }

    const milisegundos = (r: Report) => (r.createdAt instanceof Timestamp ? r.createdAt.toMillis() : 0);
    const reportes = snapshot.docs
      .map((d) => ({ id: d.id, ...d.data() }) as Report)
      .sort((a, b) => milisegundos(b) - milisegundos(a));

    return { reportes: reportes.slice(0, maximo), hayMas: reportes.length > maximo };
  }

  /** HU-26 · Un reporte por id. Devuelve null si no existe. */
  async getById(reportId: string): Promise<Report | null> {
    const snapshot: DocumentSnapshot = await getDoc(
      doc(this.firestore, 'reports', reportId),
    );

    return snapshot.exists()
      ? ({ id: snapshot.id, ...snapshot.data() } as Report)
      : null;
  }

  /**
   * HU-27 · Historial paginado del usuario autenticado.
   * Pasar el cursor de la página anterior para obtener la siguiente.
   */
  async getMyReports(
    tamanoPagina = 10,
    cursor: QueryDocumentSnapshot | null = null,
  ): Promise<PaginaReportes> {
    const usuario = this.authService.user;

    if (!usuario) {
      return { reportes: [], cursor: null };
    }

    /**
     * v2-E1 · Se pide un documento de más como centinela. Antes, una página
     * exactamente llena dejaba el cursor activo aunque no quedara nada después,
     * y la pantalla ofrecía "ver anteriores" para devolver una lista vacía.
     */
    const restricciones = [
      where('uid', '==', usuario.uid),
      orderBy('createdAt', 'desc'),
      ...(cursor ? [startAfter(cursor)] : []),
      limit(tamanoPagina + 1),
    ];

    const snapshot = await getDocs(
      query(collection(this.firestore, 'reports'), ...restricciones),
    );

    const hayMas = snapshot.docs.length > tamanoPagina;
    const documentos = hayMas ? snapshot.docs.slice(0, tamanoPagina) : snapshot.docs;

    return {
      reportes: documentos.map((d) => ({ id: d.id, ...d.data() }) as Report),
      cursor: hayMas ? documentos[documentos.length - 1] : null,
    };
  }

  /** Fecha legible a partir del Timestamp de Firestore. */
  formatearFecha(valor: Report['createdAt']): string {
    if (!(valor instanceof Timestamp)) {
      return 'Hace unos instantes';
    }

    return valor.toDate().toLocaleString('es-CL', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
}
