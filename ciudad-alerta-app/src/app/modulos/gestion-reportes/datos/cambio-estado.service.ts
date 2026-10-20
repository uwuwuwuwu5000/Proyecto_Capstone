import { Injectable, inject } from '@angular/core';
import { FirebaseError } from 'firebase/app';
import {
  Firestore,
  Timestamp,
  collection,
  doc,
  getDoc,
  runTransaction,
  serverTimestamp,
} from 'firebase/firestore';
import {
  PermisoGestion,
  ResolucionDelCambio,
  permisoDeGestion,
  resolucionDelCambio,
  transicionesDisponibles,
} from '@ciudad-alerta/comun';

import { FIRESTORE } from '../../../core/firebase.providers';
import {
  NOMBRE_ADMINISTRACION,
  OperadorDoc,
  OrganismoDoc,
  Report,
  ReportStatus,
  StatusChange,
} from '../../../models/report.model';
import { AuthService } from '../../../services/auth.service';

export class CambioEstadoError extends Error {
  constructor(
    override readonly message: string,
    readonly code: 'transicion_invalida' | 'sin_permiso' | 'red' | 'desconocido',
  ) {
    super(message);
    this.name = 'CambioEstadoError';
  }
}

/**
 * HU-28 · Cambio de estado de un reporte, con su entrada en el historial.
 *
 * Antes estaba en `services/routing.service.ts`, junto con la asignación de
 * organismo y operador que usa la creación de reportes. Ahora es del módulo de
 * gestión: si se desactiva, nadie puede cambiar estados desde la app y el
 * detalle de un reporte deja de mostrar el bloque «Gestión».
 *
 * Las reglas de Firestore exigen rol de gestión y una transición válida; lo
 * que se valida aquí es solo para dar un mensaje claro antes de escribir.
 */
@Injectable({ providedIn: 'root' })
export class CambioEstadoService {
  private readonly firestore = inject<Firestore>(FIRESTORE);
  private readonly authService = inject(AuthService);

  /** Estados a los que puede avanzar un reporte desde su estado actual. */
  transiciones(estadoActual: ReportStatus): ReadonlyArray<ReportStatus> {
    // `?? []`: un reporte antiguo puede traer un estado que ya no existe.
    return transicionesDisponibles(estadoActual) ?? [];
  }

  /** Si la sesión actual puede cambiar el estado de este reporte, y si no, por qué. */
  async permiso(reporte: Report): Promise<PermisoGestion> {
    const usuario = this.authService.user;
    const perfil = usuario ? await this.authService.getUserProfile(usuario.uid).catch(() => null) : null;
    return permisoDeGestion(perfil ? { rol: perfil.role, operadorId: perfil.operadorId } : null, reporte);
  }

  /**
   * Cambia el estado y deja constancia del movimiento en `statusHistory`.
   * Devuelve el reporte con el estado nuevo (y, si corresponde, sus datos de
   * resolución, para mostrarlos sin volver a leer).
   *
   * F12 · Al resolver guarda `resueltoAt` y `tiempoResolucionMs`; al cerrar sin
   * resolver, `cerradoSinResolverAt`, igual que el portal. Etapa blanda: si las
   * reglas rechazan esos campos (reloj del teléfono muy desviado, reglas sin
   * actualizar), se reintenta sin ellos. Un dato de análisis nunca debe
   * impedir el cambio de estado.
   */
  async cambiar(reporte: Report, nuevoEstado: ReportStatus, comentario = ''): Promise<Report> {
    const usuario = this.authService.user;

    if (!usuario) {
      throw new CambioEstadoError('Debes iniciar sesión para gestionar reportes.', 'sin_permiso');
    }

    if (!this.transiciones(reporte.estado).includes(nuevoEstado)) {
      throw new CambioEstadoError(
        `No es posible pasar de "${reporte.estado}" a "${nuevoEstado}".`,
        'transicion_invalida',
      );
    }

    // Quién firma el cambio en el historial público. Se resuelve antes de la
    // transacción: dentro de ella solo van las lecturas que necesitan
    // consistencia con la escritura.
    const firma = await this.resolverFirma(usuario.uid);

    const referenciaReporte = doc(this.firestore, 'reports', reporte.id);
    const referenciaHistorial = doc(collection(this.firestore, 'reports', reporte.id, 'statusHistory'));

    /** Si el intento llevaba datos de resolución (para saber si reintentar sin ellos). */
    let llevabaResolucion = false;

    const escribir = (conResolucion: boolean): Promise<ResolucionDelCambio> =>
      /**
       * BUG 14 · El historial y el estado se escriben juntos o ninguno. La
       * transacción relee el estado: si otro gestor movió el reporte mientras
       * este diálogo estaba abierto, el cambio se rechaza en vez de pisarlo.
       */
      runTransaction(this.firestore, async (transaccion) => {
        const actual = await transaccion.get(referenciaReporte);

        if (!actual.exists()) {
          throw new CambioEstadoError('El reporte ya no existe.', 'desconocido');
        }

        const estadoActual = actual.data()['estado'] as ReportStatus;

        if (estadoActual !== reporte.estado) {
          throw new CambioEstadoError(
            `Otro gestor cambió este reporte a "${estadoActual}". Vuelve a abrirlo para continuar.`,
            'transicion_invalida',
          );
        }

        const cambio: StatusChange = {
          reportId: reporte.id,
          desde: estadoActual,
          hacia: nuevoEstado,
          autorUid: usuario.uid,
          ...(firma ? { autorNombre: firma.nombre, autorRol: firma.rol } : {}),
          comentario: comentario.trim().slice(0, 300),
          createdAt: serverTimestamp(),
        };

        const creado = actual.data()['createdAt'];
        const resolucion = conResolucion
          ? resolucionDelCambio(
              estadoActual,
              nuevoEstado,
              creado instanceof Timestamp ? creado.toMillis() : null,
            )
          : null;
        llevabaResolucion = resolucion !== null;

        transaccion.set(referenciaHistorial, cambio);
        transaccion.update(referenciaReporte, {
          estado: nuevoEstado,
          updatedAt: serverTimestamp(),
          ...camposDeResolucion(resolucion),
        });

        return resolucion;
      });

    let resolucion: ResolucionDelCambio;

    try {
      try {
        resolucion = await escribir(true);
      } catch (error) {
        const rechazado = error instanceof FirebaseError && error.code === 'permission-denied';
        if (!rechazado || !llevabaResolucion) throw error;

        console.warn('Las reglas rechazaron los datos de resolución; se reintenta sin ellos.');
        resolucion = await escribir(false);
      }
    } catch (error) {
      if (error instanceof CambioEstadoError) {
        throw error;
      }

      console.error('Cambio de estado rechazado:', error);
      throw this.traducir(error);
    }

    // Copia local para mostrar de inmediato: la hora exacta es la del servidor.
    const ahora = Timestamp.now();
    return {
      ...reporte,
      estado: nuevoEstado,
      ...(resolucion?.tipo === 'resuelto'
        ? { resueltoAt: ahora, tiempoResolucionMs: resolucion.tiempoResolucionMs }
        : {}),
      ...(resolucion?.tipo === 'cerrado_sin_resolver' ? { cerradoSinResolverAt: ahora } : {}),
    };
  }

  /**
   * Nombre público con que se firma un cambio de estado: "Administración
   * Ciudad Alerta" para un admin, el organismo del operador para un operador
   * ("Municipalidad de Pudahuel"). Las reglas comprueban que el nombre de un
   * operador coincida con su organismo.
   */
  private async resolverFirma(uid: string): Promise<{ nombre: string; rol: 'admin' | 'operador' } | null> {
    const perfil = await this.authService.getUserProfile(uid).catch(() => null);

    if (perfil?.role === 'admin') {
      return { nombre: NOMBRE_ADMINISTRACION, rol: 'admin' };
    }

    if (perfil?.role !== 'operador' || !perfil.operadorId) {
      return null;
    }

    try {
      const operador = await getDoc(doc(this.firestore, 'operadores', perfil.operadorId));
      const organismoId = (operador.data() as OperadorDoc | undefined)?.organismoId;

      if (!organismoId) {
        return null;
      }

      const organismo = await getDoc(doc(this.firestore, 'organismos', organismoId));
      const nombre = (organismo.data() as OrganismoDoc | undefined)?.nombre;

      return nombre ? { nombre, rol: 'operador' } : null;
    } catch {
      return null;
    }
  }

  private traducir(error: unknown): CambioEstadoError {
    if (error instanceof FirebaseError) {
      if (error.code === 'permission-denied') {
        return new CambioEstadoError('No tienes permisos para cambiar el estado de este reporte.', 'sin_permiso');
      }

      if (error.code === 'unavailable') {
        return new CambioEstadoError('Sin conexión con el servidor. El cambio no se guardó.', 'red');
      }
    }

    return new CambioEstadoError('No se pudo actualizar el estado del reporte.', 'desconocido');
  }
}

/**
 * Campos de Firestore para los datos de resolución (cambioDeEstadoValido() en
 * las reglas). Exportada solo para las pruebas.
 */
export function camposDeResolucion(resolucion: ResolucionDelCambio): Record<string, unknown> {
  switch (resolucion?.tipo) {
    case 'resuelto':
      return { resueltoAt: serverTimestamp(), tiempoResolucionMs: resolucion.tiempoResolucionMs };
    case 'cerrado_sin_resolver':
      return { cerradoSinResolverAt: serverTimestamp() };
    default:
      return {};
  }
}
