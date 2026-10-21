import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  Timestamp,
  collection,
  getCountFromServer,
  query,
  where,
} from 'firebase/firestore';
import { ESTADOS_EN_ORDEN, estaFinalizado } from '@ciudad-alerta/comun';

import { FIRESTORE } from '../../../core/firebase.providers';
import { Report } from '../../../models/report.model';
import { ReportQueryService } from '../../../services/report-query.service';

/** Lo que muestra «Por atender» en el inicio del staff. */
export interface ResumenGestion {
  /** Reportes que no están resueltos ni cerrados. */
  abiertos: number;
  /** De ellos, los que nadie ha tocado todavía (estado «reportado»). */
  sinRevisar: number;
  /** Creados desde la medianoche de hoy. */
  nuevosHoy: number;
}

const ESTADOS_ABIERTOS = ESTADOS_EN_ORDEN.filter((estado) => !estaFinalizado(estado));

/** Conteo sobre los reportes asignados a un operador (ya descargados). */
export function resumenDeAsignados(reportes: readonly Report[], desdeMs: number): ResumenGestion {
  const abiertos = reportes.filter((r) => !estaFinalizado(r.estado));
  return {
    abiertos: abiertos.length,
    sinRevisar: abiertos.filter((r) => r.estado === 'reportado').length,
    nuevosHoy: reportes.filter((r) => r.createdAt instanceof Timestamp && r.createdAt.toMillis() >= desdeMs).length,
  };
}

/** Medianoche de hoy en la hora del teléfono. */
export function inicioDeHoy(ahora = new Date()): Date {
  const inicio = new Date(ahora);
  inicio.setHours(0, 0, 0, 0);
  return inicio;
}

/**
 * Datos de «Por atender».
 *
 * - Administrador: cuenta en el servidor sobre todos los reportes
 *   (getCountFromServer, una lectura por cada mil documentos). Cada consulta
 *   filtra un solo campo, así que no necesita índices compuestos.
 * - Operador: usa la misma lista de asignados que su bandeja (hasta 100).
 */
@Injectable({ providedIn: 'root' })
export class ResumenGestionService {
  private readonly firestore = inject<Firestore>(FIRESTORE);
  private readonly queryService = inject(ReportQueryService);

  async deAdministrador(desde = inicioDeHoy()): Promise<ResumenGestion> {
    const reportes = collection(this.firestore, 'reports');
    const [abiertos, sinRevisar, nuevosHoy] = await Promise.all([
      getCountFromServer(query(reportes, where('estado', 'in', ESTADOS_ABIERTOS))),
      getCountFromServer(query(reportes, where('estado', '==', 'reportado'))),
      getCountFromServer(query(reportes, where('createdAt', '>=', Timestamp.fromDate(desde)))),
    ]);
    return {
      abiertos: abiertos.data().count,
      sinRevisar: sinRevisar.data().count,
      nuevosHoy: nuevosHoy.data().count,
    };
  }

  async deOperador(operadorId: string, desde = inicioDeHoy()): Promise<ResumenGestion> {
    const asignados = await this.queryService.reportesDeOperador(operadorId);
    return resumenDeAsignados(asignados, desde.getTime());
  }
}
