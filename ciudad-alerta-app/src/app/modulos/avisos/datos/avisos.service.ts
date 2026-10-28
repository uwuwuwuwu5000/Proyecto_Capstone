import { Injectable, NgZone, computed, inject, signal } from '@angular/core';
import {
  Firestore,
  Timestamp,
  Unsubscribe,
  arrayUnion,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';

import { FIRESTORE } from '../../../core/firebase.providers';
import { AuthService } from '../../../services/auth.service';
import { HistorialService } from '../../../services/historial.service';
import { PARAMETROS_CONFIANZA } from '@ciudad-alerta/comun';

import { Aviso, AvisoSinVisto, EstadoAvisos } from '../modelo/aviso.model';
import { Report, StatusChange } from '../../../models/report.model';
import { esCuentaDeOrganismo } from '../../../models/user-profile.model';

/**
 * Reportes propios que se vigilan.
 *
 * La consulta filtra solo por `uid`, sin ordenar. Así la resuelve el índice
 * automático de ese campo y no depende de ningún índice compuesto: si el
 * índice no estaba desplegado, la campana fallaba en silencio. Un ciudadano
 * rara vez supera este número de reportes.
 */
const REPORTES_VIGILADOS = 50;
/** Cambios que se leen de cada reporte modificado. */
const CAMBIOS_POR_REPORTE = 10;
/** Tope de ids individuales guardados antes de compactar con `vistosHasta`. */
const MAX_VISTOS = 200;

/**
 * Avisos de cambios de estado y de veredictos en los reportes del ciudadano.
 *
 * Sin Cloud Functions no hay quien "empuje" un aviso al teléfono cuando
 * cambia un reporte. En su lugar, la app escucha en tiempo real sus propios
 * reportes; cuando uno cambia —su `updatedAt` avanza—, lee las entradas de su
 * historial y las convierte en avisos.
 *
 * Costo controlado:
 *  - Una sola escucha, sobre los 20 reportes propios más recientes.
 *  - El historial de un reporte solo se lee cuando su `updatedAt` cambió
 *    desde la última vez, y nunca para reportes que no se han modificado.
 *
 * El veredicto (real o falso) no tiene historial: se lee del mapa
 * `validacion` del reporte, que ya viene en la escucha. Como también avanza
 * `updatedAt`, el reporte se vuelve a procesar.
 *
 * Limitación declarada: solo genera avisos para cambios de estado que queden
 * registrados en el historial. Un cambio de estado hecho sin escribir
 * historial no produce aviso.
 */
@Injectable({ providedIn: 'root' })
export class AvisosService {
  private readonly firestore = inject<Firestore>(FIRESTORE);
  private readonly authService = inject(AuthService);
  private readonly historialService = inject(HistorialService);
  private readonly zone = inject(NgZone);

  private readonly avisosBase = signal<AvisoSinVisto[]>([]);
  private readonly vistos = signal<Set<string>>(new Set());
  private readonly vistosHasta = signal<Date | null>(null);

  /** Avisos del usuario, del más reciente al más antiguo. */
  readonly avisos = computed<Aviso[]>(() => {
    const vistos = this.vistos();
    const hasta = this.vistosHasta();

    return this.avisosBase().map(
      (aviso) =>
        ({
          ...aviso,
          visto:
            vistos.has(aviso.id) ||
            (hasta !== null && aviso.fecha !== null && aviso.fecha <= hasta),
        }) as Aviso,
    );
  });

  readonly noVistos = computed(() => this.avisos().filter((aviso) => !aviso.visto).length);
  readonly cargando = signal(false);
  /** Error de la última escucha, para mostrarlo en vez de una lista vacía. */
  readonly error = signal<string | null>(null);

  private uid: string | null = null;
  private escucha: Unsubscribe | null = null;
  /** Por reporte: la marca de cambio procesada y los avisos que produjo. */
  private readonly cache = new Map<string, { marca: string; avisos: AvisoSinVisto[] }>();

  constructor() {
    // Se activa al iniciar sesión y se apaga al cerrarla.
    this.authService.authState$.subscribe((usuario) => {
      if (usuario?.uid === this.uid) {
        return;
      }

      this.detener();

      if (usuario) {
        void this.iniciar(usuario.uid);
      }
    });
  }

  /** Marca un aviso como visto al abrirlo. */
  async marcarVisto(id: string): Promise<void> {
    if (!this.uid || this.vistos().has(id)) {
      return;
    }

    this.vistos.update((actuales) => new Set([...actuales, id]));

    // Si la lista individual crece demasiado, se compacta: todo lo anterior al
    // momento actual pasa a cubrirse con `vistosHasta`.
    if (this.vistos().size > MAX_VISTOS) {
      await this.marcarTodos();
      return;
    }

    try {
      await setDoc(
        this.refEstado(this.uid),
        { vistos: arrayUnion(id), updatedAt: serverTimestamp() },
        { merge: true },
      );
    } catch {
      // Queda marcado en esta sesión aunque no se haya guardado.
    }
  }

  /** Marca todos los avisos actuales como vistos. */
  async marcarTodos(): Promise<void> {
    if (!this.uid) {
      return;
    }

    this.vistosHasta.set(new Date());
    this.vistos.set(new Set());

    const estado: EstadoAvisos = {
      vistos: [],
      vistosHasta: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    try {
      await setDoc(this.refEstado(this.uid), estado, { merge: true });
    } catch {
      // Queda aplicado en esta sesión aunque no se haya guardado.
    }
  }

  private async iniciar(uid: string): Promise<void> {
    this.uid = uid;
    this.cargando.set(true);

    await this.cargarEstado(uid);

    // Si cerró sesión, o entró otra cuenta, mientras se leía el estado, no se
    // escucha nada: antes quedaba abierta la escucha de la cuenta anterior.
    if (this.uid !== uid) {
      return;
    }

    // 1.2 · Una cuenta de organismo no tiene reportes propios, y las reglas no
    // le dejan consultar reportes por autor: sin escucha, la campana queda
    // vacía en vez de mostrar un error engañoso.
    if (await this.esCuentaDeOrganismo(uid)) {
      if (this.uid === uid) this.cargando.set(false);
      return;
    }
    if (this.uid !== uid) {
      return;
    }

    this.escucha = this.escuchar(
      uid,
      (reportes) => {
        this.error.set(null);
        void this.procesar(uid, reportes);
      },
      (error) => {
        if (this.uid !== uid) return;
        // Antes este error se descartaba y la campana quedaba vacía sin
        // explicación. El mensaje de Firestore incluye, si falta un índice,
        // el enlace para crearlo.
        console.error('Avisos: no se pudo escuchar los reportes propios.', error);
        this.error.set('No se pudieron cargar tus avisos. Revisa tu conexión.');
        this.cargando.set(false);
      },
    );
  }

  /** Si la sesión es de una cuenta de organismo (aparte, para probar sin red). */
  protected async esCuentaDeOrganismo(uid: string): Promise<boolean> {
    try {
      return esCuentaDeOrganismo((await this.authService.getUserProfile(uid))?.role);
    } catch {
      return false;
    }
  }

  /** La escucha de Firestore, aparte para poder probar el servicio sin red. */
  protected escuchar(
    uid: string,
    alCambiar: (reportes: Report[]) => void,
    alFallar: (error: unknown) => void,
  ): Unsubscribe {
    const consulta = query(
      collection(this.firestore, 'reports'),
      where('uid', '==', uid),
      limit(REPORTES_VIGILADOS),
    );

    return onSnapshot(
      consulta,
      (snapshot) => {
        const reportes = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as Report);
        this.zone.run(() => alCambiar(reportes));
      },
      (error) => this.zone.run(() => alFallar(error)),
    );
  }

  /** El estado guardado (qué avisos vio), aparte para probar sin red. */
  protected async leerEstado(uid: string): Promise<EstadoAvisos | undefined> {
    const snapshot = await getDoc(this.refEstado(uid));
    return snapshot.data() as EstadoAvisos | undefined;
  }

  private detener(): void {
    this.escucha?.();
    this.escucha = null;
    this.uid = null;
    this.cache.clear();
    this.avisosBase.set([]);
    this.vistos.set(new Set());
    this.vistosHasta.set(null);
    this.cargando.set(false);
    this.error.set(null);
  }

  private async procesar(uid: string, reportes: Report[]): Promise<void> {
    await Promise.all(
      reportes.map(async (reporte) => {
        /**
         * La marca de cambio combina el estado y `updatedAt`. Antes se usaba
         * solo `updatedAt`, y si un cliente —el portal, por ejemplo— cambiaba
         * el estado sin actualizar esa fecha, el cambio pasaba inadvertido.
         */
        const marca = `${reporte.estado}|${this.milisegundos(reporte.updatedAt) ?? ''}`;
        const previo = this.cache.get(reporte.id);

        if (previo && previo.marca === marca) {
          return;
        }

        // Un reporte que sigue en su estado inicial y nunca se actualizó no
        // tiene historial que leer. Se decide por el estado, no por fechas.
        const intacto =
          reporte.estado === 'reportado' &&
          this.milisegundos(reporte.updatedAt) === this.milisegundos(reporte.createdAt);

        if (intacto) {
          this.cache.set(reporte.id, { marca, avisos: [] });
          return;
        }

        const avisos = [...(await this.leerAvisos(uid, reporte)), ...this.avisoDeVeredicto(uid, reporte)];
        this.cache.set(reporte.id, { marca, avisos });
      }),
    );

    // Si el usuario cerró sesión mientras se procesaba, no se publica nada.
    if (this.uid !== uid) {
      return;
    }

    const todos = [...this.cache.values()]
      .flatMap((entrada) => entrada.avisos)
      .sort((a, b) => (b.fecha?.getTime() ?? 0) - (a.fecha?.getTime() ?? 0));

    this.avisosBase.set(todos);
    this.cargando.set(false);
  }

  private async leerAvisos(uid: string, reporte: Report): Promise<AvisoSinVisto[]> {
    try {
      const snapshot = await getDocs(
        query(
          collection(this.firestore, 'reports', reporte.id, 'statusHistory'),
          orderBy('createdAt', 'desc'),
          limit(CAMBIOS_POR_REPORTE),
        ),
      );

      return snapshot.docs
        .map((d) => ({ cambioId: d.id, cambio: d.data() as StatusChange }))
        // Los cambios que hizo el propio usuario no son avisos para él.
        .filter(({ cambio }) => cambio.autorUid !== uid)
        .map(({ cambioId, cambio }): AvisoSinVisto => ({
          tipo: 'estado',
          id: `${reporte.id}_${cambioId}`,
          reportId: reporte.id,
          reporte: this.resumir(reporte.descripcion),
          desde: cambio.desde,
          hacia: cambio.hacia,
          autor: this.historialService.etiquetaAutor(cambio),
          comentario: cambio.comentario?.trim() || null,
          fecha: this.historialService.aFecha(cambio.createdAt),
        }));
    } catch (error) {
      console.error(`Avisos: no se pudo leer el historial del reporte ${reporte.id}.`, error);
      return [];
    }
  }

  /**
   * El veredicto de quien gestiona el reporte (real o falso) también es un
   * aviso: cambia los puntos de confianza del autor. Se lee del propio
   * reporte, sin otra consulta.
   */
  private avisoDeVeredicto(uid: string, reporte: Report): AvisoSinVisto[] {
    const v = reporte.validacion;

    if ((v?.veredicto !== 'real' && v?.veredicto !== 'falso') || v.veredictoPor === uid) {
      return [];
    }

    const real = v.veredicto === 'real';
    return [
      {
        tipo: 'veredicto',
        id: `${reporte.id}_veredicto`,
        reportId: reporte.id,
        reporte: this.resumir(reporte.descripcion),
        veredicto: v.veredicto,
        // Reportes de antes de guardar veredictoPuntos: lo que dicen las reglas.
        puntos:
          typeof v.veredictoPuntos === 'number'
            ? v.veredictoPuntos
            : real
              ? PARAMETROS_CONFIANZA.puntosPorReporteReal
              : PARAMETROS_CONFIANZA.puntosPorReporteFalso,
        autor: 'Revisado por quien gestiona el reporte',
        comentario: v.veredictoComentario?.trim() || null,
        fecha: this.historialService.aFecha(v.veredictoAt),
      },
    ];
  }

  private async cargarEstado(uid: string): Promise<void> {
    try {
      const datos = await this.leerEstado(uid);
      // Lo de una cuenta que ya salió no se aplica a la que entró.
      if (this.uid !== uid) return;

      this.vistos.set(new Set(datos?.vistos ?? []));
      this.vistosHasta.set(
        datos?.vistosHasta instanceof Timestamp ? datos.vistosHasta.toDate() : null,
      );
    } catch {
      if (this.uid !== uid) return;
      this.vistos.set(new Set());
      this.vistosHasta.set(null);
    }
  }

  private refEstado(uid: string) {
    return doc(this.firestore, 'users', uid, 'avisos', 'estado');
  }

  private milisegundos(valor: unknown): number | null {
    return valor instanceof Timestamp ? valor.toMillis() : null;
  }

  private resumir(texto: string): string {
    return texto.length <= 60 ? texto : `${texto.slice(0, 57)}…`;
  }
}
