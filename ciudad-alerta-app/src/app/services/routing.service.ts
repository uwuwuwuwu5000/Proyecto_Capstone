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
  runTransaction,
  serverTimestamp,
} from 'firebase/firestore';
import { FirebaseError } from 'firebase/app';

import { FIRESTORE } from '../core/firebase.providers';
import { AuthService } from './auth.service';
import { ComunaDetectada } from './comuna.service';
import {
  NOMBRE_ADMINISTRACION,
  ORGANISMOS,
  OperadorDoc,
  Organismo,
  OrganismoDoc,
  Report,
  ReportCategory,
  ReportStatus,
  StatusChange,
  TRANSICIONES,
} from '../models/report.model';

export class RoutingError extends Error {
  constructor(
    override readonly message: string,
    readonly code: 'transicion_invalida' | 'sin_permiso' | 'red' | 'desconocido',
  ) {
    super(message);
    this.name = 'RoutingError';
  }
}

/**
 * HU-28 · Enrutamiento al organismo responsable y evolución de estados.
 *
 * El enrutamiento se resuelve por categoría contra un catálogo simulado. Los
 * cambios de estado quedan registrados en la subcolección `statusHistory`, lo
 * que da trazabilidad sin inflar el documento del reporte.
 */
@Injectable({ providedIn: 'root' })
export class RoutingService {
  private readonly firestore = inject<Firestore>(FIRESTORE);
  private readonly authService = inject(AuthService);

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
      // Dos igualdades sin orderBy: Firestore las resuelve combinando los
      // índices automáticos de cada campo, sin índice compuesto.
      const snapshot = await getDocs(
        query(
          collection(this.firestore, 'operadores'),
          where('organismoId', '==', organismoId),
          where('activo', '==', true),
          limit(10),
        ),
      );

      const ids = snapshot.docs
        .map((d) => (d.data() as OperadorDoc).id ?? d.id)
        .sort((a, b) => a.localeCompare(b));

      const operadorId = ids[0] ?? null;
      this.cacheOperadores.set(organismoId, operadorId);
      return operadorId;
    } catch {
      // Sin conexión no se cachea, para reintentar en el próximo reporte.
      return null;
    }
  }

  private async leerMunicipio(organismoId: string): Promise<Organismo | null> {
    if (this.cacheMunicipios.has(organismoId)) {
      return this.cacheMunicipios.get(organismoId) ?? null;
    }

    try {
      const snapshot = await getDoc(doc(this.firestore, 'organismos', organismoId));

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
    } catch {
      // Sin conexión no se cachea el fallo, para reintentar en el próximo reporte.
      return null;
    }
  }

  /** Estados a los que puede avanzar un reporte desde su estado actual. */
  transicionesDisponibles(estadoActual: ReportStatus): ReadonlyArray<ReportStatus> {
    return TRANSICIONES[estadoActual] ?? [];
  }

  esTransicionValida(desde: ReportStatus, hacia: ReportStatus): boolean {
    return this.transicionesDisponibles(desde).includes(hacia);
  }

  /**
   * Cambia el estado del reporte y deja constancia del movimiento.
   * Las reglas de seguridad exigen rol de gestión, de modo que la validación
   * del cliente es solo para dar mejor retroalimentación.
   */
  async changeStatus(
    report: Report,
    nuevoEstado: ReportStatus,
    comentario = '',
  ): Promise<void> {
    const usuario = this.authService.user;

    if (!usuario) {
      throw new RoutingError('Debes iniciar sesión para gestionar reportes.', 'sin_permiso');
    }

    if (!this.esTransicionValida(report.estado, nuevoEstado)) {
      throw new RoutingError(
        `No es posible pasar de "${report.estado}" a "${nuevoEstado}".`,
        'transicion_invalida',
      );
    }

    // Quién firma el cambio en el historial público. Se resuelve antes de la
    // transacción: dentro de ella solo deben ir las lecturas que necesitan
    // consistencia con la escritura.
    const firma = await this.resolverFirma(usuario.uid);

    const referenciaReporte = doc(this.firestore, 'reports', report.id);
    const referenciaHistorial = doc(
      collection(this.firestore, 'reports', report.id, 'statusHistory'),
    );

    try {
      /**
       * BUG 14 · Antes se escribía el historial y luego se actualizaba el
       * estado. Si lo segundo fallaba, quedaba registrada una transición que
       * nunca ocurrió. La transacción garantiza que ambas cosas pasen o ninguna,
       * y de paso relee el estado actual: si otro gestor movió el reporte
       * mientras este diálogo estaba abierto, el cambio se rechaza en vez de
       * pisarlo.
       */
      await runTransaction(this.firestore, async (transaccion) => {
        const actual = await transaccion.get(referenciaReporte);

        if (!actual.exists()) {
          throw new RoutingError('El reporte ya no existe.', 'desconocido');
        }

        const estadoActual = actual.data()['estado'] as ReportStatus;

        if (estadoActual !== report.estado) {
          throw new RoutingError(
            `Otro gestor cambió este reporte a "${estadoActual}". Vuelve a abrirlo para continuar.`,
            'transicion_invalida',
          );
        }

        const cambio: StatusChange = {
          reportId: report.id,
          desde: estadoActual,
          hacia: nuevoEstado,
          autorUid: usuario.uid,
          ...(firma ? { autorNombre: firma.nombre, autorRol: firma.rol } : {}),
          comentario: comentario.trim().slice(0, 300),
          createdAt: serverTimestamp(),
        };

        transaccion.set(referenciaHistorial, cambio);
        transaccion.update(referenciaReporte, {
          estado: nuevoEstado,
          updatedAt: serverTimestamp(),
        });
      });
    } catch (error) {
      if (error instanceof RoutingError) {
        throw error;
      }

      console.error('Cambio de estado rechazado:', error);
      throw this.traducir(error);
    }
  }

  /**
   * Nombre público con que se firma un cambio de estado.
   *
   * - Administrador → "Administración Ciudad Alerta".
   * - Operador → el nombre del organismo al que pertenece, por ejemplo
   *   "Municipalidad de Pudahuel". Se muestra el organismo y no la persona:
   *   al ciudadano le importa qué institución atiende su reporte.
   *
   * Las reglas comprueban que el nombre de un operador coincida con su
   * organismo, así que no puede firmar como otra institución.
   */
  private async resolverFirma(
    uid: string,
  ): Promise<{ nombre: string; rol: 'admin' | 'operador' } | null> {
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

  private traducir(error: unknown): RoutingError {
    if (error instanceof FirebaseError) {
      if (error.code === 'permission-denied') {
        return new RoutingError(
          'No tienes permisos para cambiar el estado de este reporte.',
          'sin_permiso',
        );
      }

      if (error.code === 'unavailable') {
        return new RoutingError(
          'Sin conexión con el servidor. El cambio no se guardó.',
          'red',
        );
      }
    }

    return new RoutingError('No se pudo actualizar el estado del reporte.', 'desconocido');
  }
}
