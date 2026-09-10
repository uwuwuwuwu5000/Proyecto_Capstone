import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  Timestamp,
  collection,
  endAt,
  getDocs,
  orderBy,
  query,
  startAt,
  where,
} from 'firebase/firestore';
import { distanceBetween, geohashQueryBounds } from 'geofire-common';

import { FIRESTORE } from '../core/firebase.providers';
import { ImageSimilarityService } from './image-similarity.service';
import {
  ESTADOS_INACTIVOS,
  GeoPoint,
  MatchCandidate,
  RADIO_COINCIDENCIA_METROS,
  Report,
  ReportCategory,
  VENTANA_COINCIDENCIA_HORAS,
} from '../models/report.model';

export interface ConsultaCoincidencias {
  ubicacion: GeoPoint;
  categoria: ReportCategory;
  /** Vector de la fotografía del nuevo reporte. Opcional. */
  embedding: number[] | null;
}

/** Peso de cada señal en el puntaje final. Suman 1. */
const PESO_DISTANCIA = 0.45;
const PESO_TIEMPO = 0.2;
const PESO_IMAGEN = 0.35;

/** Bajo este puntaje la coincidencia se considera ruido y no se muestra. */
const UMBRAL_PUNTAJE = 0.4;

@Injectable({ providedIn: 'root' })
export class DuplicateDetectionService {
  private readonly firestore = inject<Firestore>(FIRESTORE);
  private readonly similarityService = inject(ImageSimilarityService);

  /**
   * Busca reportes que podrían corresponder al mismo incidente.
   *
   * Filtro duro: misma categoría, dentro del radio, dentro de la ventana de
   * tiempo y en un estado todavía activo. La similitud visual solo ajusta el
   * orden y el puntaje. Devuelve una lista vacía si no hay nada cerca, que es
   * el caso normal y no un error.
   */
  async findSimilar(consulta: ConsultaCoincidencias): Promise<MatchCandidate[]> {
    const centro: [number, number] = [consulta.ubicacion.lat, consulta.ubicacion.lng];

    let candidatos: Report[];

    try {
      candidatos = await this.consultarPorGeohash(centro, consulta.categoria);
    } catch {
      // Ante un fallo de consulta preferimos dejar continuar el reporte antes
      // que bloquear al usuario por una función auxiliar.
      return [];
    }

    const ahora = Date.now();

    const evaluados = candidatos
      .map((report) => this.evaluar(report, centro, consulta.embedding, ahora))
      .filter((candidato): candidato is MatchCandidate => candidato !== null)
      .filter((candidato) => candidato.puntaje >= UMBRAL_PUNTAJE)
      .sort((a, b) => b.puntaje - a.puntaje);

    return evaluados.slice(0, 3);
  }

  /**
   * Firestore no soporta consultas por radio. La técnica estándar es acotar por
   * rangos de geohash (que agrupan puntos cercanos en cadenas con prefijo
   * común) y afinar después con la distancia real, porque los rangos incluyen
   * algunos falsos positivos en los bordes.
   */
  private async consultarPorGeohash(
    centro: [number, number],
    categoria: ReportCategory,
  ): Promise<Report[]> {
    const rangos = geohashQueryBounds(centro, RADIO_COINCIDENCIA_METROS);
    const referencia = collection(this.firestore, 'reports');

    const consultas = rangos.map((rango) =>
      getDocs(
        query(
          referencia,
          where('categoria', '==', categoria),
          orderBy('geohash'),
          startAt(rango[0]),
          endAt(rango[1]),
        ),
      ),
    );

    const resultados = await Promise.all(consultas);
    const porId = new Map<string, Report>();

    for (const snapshot of resultados) {
      for (const documento of snapshot.docs) {
        porId.set(documento.id, { id: documento.id, ...documento.data() } as Report);
      }
    }

    return [...porId.values()];
  }

  /** Aplica los filtros duros y calcula el puntaje combinado. */
  private evaluar(
    report: Report,
    centro: [number, number],
    embedding: number[] | null,
    ahora: number,
  ): MatchCandidate | null {
    if (ESTADOS_INACTIVOS.includes(report.estado)) {
      return null;
    }

    const distanciaMetros =
      distanceBetween(centro, [report.ubicacion.lat, report.ubicacion.lng]) * 1000;

    if (distanciaMetros > RADIO_COINCIDENCIA_METROS) {
      return null;
    }

    const creado = this.aMilisegundos(report.createdAt);

    if (creado === null) {
      return null;
    }

    const horasTranscurridas = (ahora - creado) / 3_600_000;

    if (horasTranscurridas > VENTANA_COINCIDENCIA_HORAS || horasTranscurridas < 0) {
      return null;
    }

    const similitudImagen = this.similarityService.cosineSimilarity(
      embedding,
      report.embedding,
    );

    const puntajeDistancia = 1 - distanciaMetros / RADIO_COINCIDENCIA_METROS;
    const puntajeTiempo = 1 - horasTranscurridas / VENTANA_COINCIDENCIA_HORAS;

    // Sin señal visual redistribuimos su peso entre distancia y tiempo, para
    // que un reporte sin foto no quede injustamente penalizado.
    const puntaje =
      similitudImagen === null
        ? puntajeDistancia * (PESO_DISTANCIA + PESO_IMAGEN * 0.6) +
          puntajeTiempo * (PESO_TIEMPO + PESO_IMAGEN * 0.4)
        : puntajeDistancia * PESO_DISTANCIA +
          puntajeTiempo * PESO_TIEMPO +
          similitudImagen * PESO_IMAGEN;

    return {
      report,
      distanciaMetros: Math.round(distanciaMetros),
      horasTranscurridas: Math.round(horasTranscurridas),
      similitudImagen,
      puntaje: Number(puntaje.toFixed(3)),
      motivos: this.explicar(distanciaMetros, horasTranscurridas, similitudImagen),
    };
  }

  private explicar(
    distancia: number,
    horas: number,
    similitud: number | null,
  ): string[] {
    const motivos = [`A ${Math.round(distancia)} m de tu ubicación`];

    motivos.push(
      horas < 1
        ? 'Reportado hace menos de una hora'
        : `Reportado hace ${Math.round(horas)} h`,
    );

    if (similitud !== null) {
      if (similitud >= 0.8) {
        motivos.push('La fotografía se parece mucho a la tuya');
      } else if (similitud >= 0.6) {
        motivos.push('La fotografía tiene elementos en común con la tuya');
      }
    }

    return motivos;
  }

  private aMilisegundos(valor: Report['createdAt']): number | null {
    if (valor instanceof Timestamp) {
      return valor.toMillis();
    }

    // serverTimestamp() aún sin resolver en el snapshot local.
    return null;
  }
}
