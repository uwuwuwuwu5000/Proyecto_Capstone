import { Injectable, inject } from '@angular/core';
import { FirebaseError } from 'firebase/app';
import {
  DocumentReference,
  Firestore,
  Timestamp,
  Transaction,
  collection,
  doc,
  runTransaction,
  serverTimestamp,
} from 'firebase/firestore';
import { problemaDescripcion } from '@ciudad-alerta/comun';

import { FIRESTORE } from '../../../core/firebase.providers';
import { DESCRIPCION_MAX, DESCRIPCION_MIN, Report, StatusChange } from '../../../models/report.model';
import { AuthService } from '../../../services/auth.service';

/** Largo máximo del motivo al retirar un reporte (las reglas aceptan hasta 512). */
export const MOTIVO_RETIRO_MAXIMO = 300;

/** Firma pública del retiro en el historial: no se muestra el nombre de la persona. */
export const FIRMA_DEL_AUTOR = 'Quien lo reportó';

export class MiReporteError extends Error {
  constructor(
    override readonly message: string,
    readonly code: 'sin_sesion' | 'no_es_tuyo' | 'ya_revisado' | 'descripcion' | 'red' | 'desconocido',
  ) {
    super(message);
    this.name = 'MiReporteError';
  }
}

/**
 * 1.0 · Lo que el autor puede hacer con su propio reporte mientras nadie lo
 * ha revisado (estado «reportado»): corregir la descripción o retirarlo.
 *
 * Retirar lo deja «cerrado», con su entrada en el historial firmada como
 * «Quien lo reportó» y `retiradoPorAutor: true` (para no contarlo contra el
 * organismo en los tiempos de resolución). Las dos cosas releen el reporte
 * en una transacción: si alguien lo empezó a revisar, ya no se puede.
 */
@Injectable({ providedIn: 'root' })
export class MiReporteService {
  private readonly firestore = inject<Firestore>(FIRESTORE);
  private readonly authService = inject(AuthService);

  /** El autor, mientras siga en «reportado». */
  puedeModificar(reporte: Pick<Report, 'uid' | 'estado'>): boolean {
    return reporte.uid === this.authService.user?.uid && reporte.estado === 'reportado';
  }

  async editarDescripcion(reporte: Report, texto: string): Promise<Report> {
    const descripcion = texto.trim();
    if (problemaDescripcion(descripcion) !== null) {
      throw new MiReporteError(`Usa entre ${DESCRIPCION_MIN} y ${DESCRIPCION_MAX} caracteres.`, 'descripcion');
    }

    await this.enTransaccion(reporte, (transaccion, referencia) => {
      transaccion.update(referencia, {
        descripcion,
        updatedAt: serverTimestamp(),
        editadoAt: serverTimestamp(),
      });
    });

    return { ...reporte, descripcion, editadoAt: Timestamp.now(), updatedAt: Timestamp.now() };
  }

  async retirar(reporte: Report, motivo = ''): Promise<Report> {
    const usuario = this.exigirAutor(reporte);
    const detalle = motivo.trim().slice(0, MOTIVO_RETIRO_MAXIMO);

    await this.enTransaccion(reporte, (transaccion, referencia) => {
      const cambio: StatusChange = {
        reportId: reporte.id,
        desde: 'reportado',
        hacia: 'cerrado',
        autorUid: usuario,
        autorNombre: FIRMA_DEL_AUTOR,
        comentario: detalle ? `Retirado por quien lo reportó: ${detalle}` : 'Retirado por quien lo reportó.',
        createdAt: serverTimestamp(),
      };
      transaccion.set(doc(collection(this.firestore, 'reports', reporte.id, 'statusHistory')), cambio);
      transaccion.update(referencia, {
        estado: 'cerrado',
        updatedAt: serverTimestamp(),
        cerradoSinResolverAt: serverTimestamp(),
        retiradoPorAutor: true,
      });
    });

    const ahora = Timestamp.now();
    return { ...reporte, estado: 'cerrado', retiradoPorAutor: true, cerradoSinResolverAt: ahora, updatedAt: ahora };
  }

  private exigirAutor(reporte: Report): string {
    const uid = this.authService.user?.uid;
    if (!uid) throw new MiReporteError('Tu sesión venció. Vuelve a iniciar sesión.', 'sin_sesion');
    if (reporte.uid !== uid) throw new MiReporteError('Solo quien lo reportó puede hacerlo.', 'no_es_tuyo');
    return uid;
  }

  /** La transacción de Firestore, aparte para poder probar el servicio sin red. */
  protected correr(fn: (transaccion: Transaction) => Promise<void>): Promise<void> {
    return runTransaction(this.firestore, fn);
  }

  private async enTransaccion(
    reporte: Report,
    escribir: (transaccion: Transaction, referencia: DocumentReference) => void,
  ): Promise<void> {
    this.exigirAutor(reporte);
    const referencia = doc(this.firestore, 'reports', reporte.id);

    try {
      await this.correr(async (transaccion) => {
        const actual = await transaccion.get(referencia);
        if (!actual.exists() || actual.data()['estado'] !== 'reportado') {
          throw new MiReporteError(
            'El organismo ya empezó a revisar este reporte: ya no se puede corregir ni retirar.',
            'ya_revisado',
          );
        }
        escribir(transaccion, referencia);
      });
    } catch (error) {
      if (error instanceof MiReporteError) throw error;
      if (error instanceof FirebaseError && ['unavailable', 'deadline-exceeded'].includes(error.code)) {
        throw new MiReporteError('Sin conexión: no se guardó el cambio. Reintenta.', 'red');
      }
      console.error('Mi reporte:', error);
      throw new MiReporteError('No se pudo guardar el cambio. Reintenta en un momento.', 'desconocido');
    }
  }
}
