import { Injectable, inject } from '@angular/core';
import { FirebaseError } from 'firebase/app';
import { Firestore, Timestamp, doc, runTransaction, serverTimestamp } from 'firebase/firestore';
import {
  ConfianzaGuardada,
  EfectoVeredicto,
  efectoDeVeredicto,
  motivoDeVeredicto,
  permisoDeGestion,
  validacionCompleta,
} from '@ciudad-alerta/comun';

import { FIRESTORE } from '../../../core/firebase.providers';
import { Report } from '../../../models/report.model';
import { AuthService } from '../../../services/auth.service';

export type Veredicto = 'real' | 'falso';

export type CodigoErrorVeredicto =
  | 'sin_sesion'
  | 'propio'
  | 'ya_tiene'
  | 'motivo'
  | 'sin_permiso'
  | 'red'
  | 'desconocido';

export class VeredictoError extends Error {
  constructor(
    override readonly message: string,
    readonly code: CodigoErrorVeredicto,
  ) {
    super(message);
    this.name = 'VeredictoError';
  }
}

/**
 * Lo que escribe un veredicto en cada documento. Las listas de campos son las
 * de las reglas (`veredictoValido`, `confianzaDeVeredictoValida`,
 * `espejoDeConfianzaValido`): un campo de más y el lote entero se rechaza.
 */
export function camposDeVeredicto(datos: {
  reportId: string;
  gestorUid: string;
  veredicto: Veredicto;
  motivo: string | null;
  previo: ConfianzaGuardada | null;
}): {
  efecto: EfectoVeredicto;
  reporte: Record<string, unknown>;
  confianza: Record<string, unknown>;
  espejo: Record<string, unknown>;
} {
  const efecto = efectoDeVeredicto(datos.previo, datos.veredicto);

  return {
    efecto,
    reporte: {
      'validacion.veredicto': datos.veredicto,
      'validacion.veredictoPor': datos.gestorUid,
      'validacion.veredictoAt': serverTimestamp(),
      'validacion.veredictoPuntos': efecto.veredictoPuntos,
      ...(datos.motivo ? { 'validacion.veredictoComentario': datos.motivo } : {}),
      updatedAt: serverTimestamp(),
    },
    confianza: {
      puntosConfianza: efecto.puntosConfianza,
      trustLevel: efecto.trustLevel,
      validatedReports: efecto.validatedReports,
      reportesFalsos: efecto.reportesFalsos,
      confirmacionesSuspendidas: efecto.confirmacionesSuspendidas,
      ultimoReporteId: datos.reportId,
      updatedAt: serverTimestamp(),
    },
    espejo: {
      trustLevel: efecto.trustLevel,
      validatedReports: efecto.validatedReports,
      updatedAt: serverTimestamp(),
    },
  };
}

/** Si la sesión actual puede dar el veredicto de un reporte. */
export interface PermisoVeredicto {
  /** Gestiona este reporte (admin, o el operador asignado): ve el bloque. */
  gestiona: boolean;
  /** Puede darlo ahora. */
  puede: boolean;
  /** Por qué no puede, si gestiona pero no puede. */
  motivo: string | null;
}

/**
 * Sistema de confianza, sección 4.4 · Veredicto de un gestor sobre un reporte.
 *
 * Quien gestiona el reporte (un admin, o el operador asignado) decide si es
 * real o falso. En una sola transacción:
 *
 *  1. `reports/{id}.validacion`: veredicto, quién, cuándo, motivo y los PC que
 *     movió.
 *  2. `users/{autor}/confianza/actual`: +10 PC y un reporte validado si es
 *     real; −15 PC y un reporte falso si no (efectoDeVeredicto, en comun/).
 *  3. `users/{autor}`: el espejo del nivel y de los reportes validados.
 *
 * Las reglas comprueban cada número (`veredictoValido`,
 * `confianzaDeVeredictoValida`, `espejoDeConfianzaValido`) y que el autor sea
 * un vecino distinto de quien da el veredicto. El autor se entera por la
 * campana: el módulo de avisos lee el veredicto del propio reporte.
 */
@Injectable({ providedIn: 'root' })
export class VeredictoService {
  private readonly firestore = inject<Firestore>(FIRESTORE);
  private readonly authService = inject(AuthService);

  async permiso(reporte: Report): Promise<PermisoVeredicto> {
    const usuario = this.authService.user;

    if (!usuario) {
      return { gestiona: false, puede: false, motivo: null };
    }

    const perfil = await this.authService.getUserProfile(usuario.uid).catch(() => null);
    const gestion = permisoDeGestion(perfil ? { rol: perfil.role, operadorId: perfil.operadorId } : null, reporte);

    if (!gestion.puede) {
      // Otro operador ya ve en «Gestión» por qué no puede tocar el reporte.
      return { gestiona: false, puede: false, motivo: null };
    }

    if (reporte.uid === usuario.uid) {
      return {
        gestiona: true,
        puede: false,
        motivo: 'Es tu propio reporte: el veredicto lo da otro gestor.',
      };
    }

    return { gestiona: true, puede: validacionCompleta(reporte.validacion).veredicto === null, motivo: null };
  }

  /**
   * Registra el veredicto y devuelve el reporte con su `validacion` nueva, para
   * mostrarlo sin volver a leer.
   */
  async dar(reporte: Report, veredicto: Veredicto, comentario?: string | null): Promise<Report> {
    const usuario = this.authService.user;

    if (!usuario) {
      throw new VeredictoError('Debes iniciar sesión para dar un veredicto.', 'sin_sesion');
    }

    if (reporte.uid === usuario.uid) {
      throw new VeredictoError('No puedes dar el veredicto de tu propio reporte.', 'propio');
    }

    const { motivo, error } = motivoDeVeredicto(veredicto, comentario);

    if (error) {
      throw new VeredictoError(error, 'motivo');
    }

    const refReporte = doc(this.firestore, 'reports', reporte.id);
    let efecto: EfectoVeredicto;

    try {
      efecto = await runTransaction(this.firestore, async (transaccion) => {
        const actual = await transaccion.get(refReporte);

        if (!actual.exists()) {
          throw new VeredictoError('El reporte ya no existe.', 'desconocido');
        }

        const datos = actual.data() as Report;

        if (validacionCompleta(datos.validacion).veredicto !== null) {
          throw new VeredictoError(
            'Otro gestor ya dio el veredicto de este reporte. Vuelve a abrirlo para verlo.',
            'ya_tiene',
          );
        }

        const autor = datos.uid;
        const refConfianza = doc(this.firestore, 'users', autor, 'confianza', 'actual');
        const confianza = await transaccion.get(refConfianza);
        const campos = camposDeVeredicto({
          reportId: reporte.id,
          gestorUid: usuario.uid,
          veredicto,
          motivo,
          previo: confianza.exists() ? (confianza.data() as ConfianzaGuardada) : null,
        });

        transaccion.update(refReporte, campos.reporte);
        transaccion.set(refConfianza, campos.confianza);
        // Espejo en el perfil, que es lo que leen el portal y las pantallas antiguas.
        transaccion.update(doc(this.firestore, 'users', autor), campos.espejo);

        return campos.efecto;
      });
    } catch (error) {
      throw this.traducir(error);
    }

    return {
      ...reporte,
      validacion: {
        ...reporte.validacion,
        veredicto,
        veredictoPor: usuario.uid,
        veredictoAt: Timestamp.now(),
        veredictoComentario: motivo,
        veredictoPuntos: efecto.veredictoPuntos,
      },
    };
  }

  private traducir(error: unknown): VeredictoError {
    if (error instanceof VeredictoError) {
      return error;
    }

    if (error instanceof FirebaseError) {
      if (error.code === 'permission-denied') {
        return new VeredictoError(
          'No se pudo registrar el veredicto. Solo lo da quien gestiona el reporte, y solo sobre reportes de vecinos (no de cuentas de organismos).',
          'sin_permiso',
        );
      }

      if (['unavailable', 'deadline-exceeded', 'aborted'].includes(error.code)) {
        return new VeredictoError('Sin conexión: el veredicto no se guardó. Reintenta.', 'red');
      }
    }

    console.error('Veredicto: error inesperado.', error);
    return new VeredictoError('No se pudo registrar el veredicto. Reintenta en un momento.', 'desconocido');
  }
}
