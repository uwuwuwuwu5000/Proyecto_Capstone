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
