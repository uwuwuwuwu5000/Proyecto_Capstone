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

    const restricciones = [
      where('uid', '==', usuario.uid),
      orderBy('createdAt', 'desc'),
      ...(cursor ? [startAfter(cursor)] : []),
      limit(tamanoPagina),
    ];

    const snapshot = await getDocs(
      query(collection(this.firestore, 'reports'), ...restricciones),
    );

    return {
      reportes: snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as Report),
      cursor:
        snapshot.docs.length === tamanoPagina
          ? snapshot.docs[snapshot.docs.length - 1]
          : null,
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
