import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  Timestamp,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { FirebaseError } from 'firebase/app';
import { Observable } from 'rxjs';
import { NgZone } from '@angular/core';

import { FIRESTORE } from '../core/firebase.providers';
import { AuthService } from './auth.service';
import {
  ASUNTO_MAX,
  ASUNTO_MIN,
  EstadoTicket,
  MENSAJE_MAX,
  MENSAJE_MIN,
  RolMensaje,
  SupportMessage,
  SupportTicket,
  TRANSICIONES_TICKET,
  TipoTicket,
} from '../models/support.model';

export class SupportError extends Error {
  constructor(
    override readonly message: string,
    readonly code: 'validacion' | 'sin_permiso' | 'red' | 'desconocido',
  ) {
    super(message);
    this.name = 'SupportError';
  }
}

export interface FiltrosBandeja {
  tipo: TipoTicket | 'todos';
  estado: EstadoTicket | 'todos';
}

@Injectable({ providedIn: 'root' })
export class SupportService {
  private readonly firestore = inject<Firestore>(FIRESTORE);
  private readonly authService = inject(AuthService);
  private readonly zone = inject(NgZone);

  /**
   * Crea la conversación y su primer mensaje en un mismo lote: un ticket sin
   * mensaje inicial no aporta nada al funcionario que lo recibe.
   */
  async crearTicket(
    tipo: TipoTicket,
    asunto: string,
    mensaje: string,
  ): Promise<string> {
    const usuario = this.authService.user;

    if (!usuario) {
      throw new SupportError('Inicia sesión para contactar con soporte.', 'sin_permiso');
    }

    const asuntoLimpio = asunto.trim();
    const mensajeLimpio = mensaje.trim();

    this.validarAsunto(asuntoLimpio);
    this.validarMensaje(mensajeLimpio);

    const referenciaTicket = doc(collection(this.firestore, 'supportTickets'));
    const referenciaMensaje = doc(
      collection(this.firestore, 'supportTickets', referenciaTicket.id, 'messages'),
    );

    const nombre = usuario.displayName?.trim() || usuario.email?.split('@')[0] || 'Vecino';

    const ticket: Omit<SupportTicket, 'id'> = {
      uid: usuario.uid,
      autorNombre: nombre,
      autorEmail: usuario.email ?? '',
      tipo,
      asunto: asuntoLimpio,
      estado: 'abierto',
      asignadoA: null,
      lastMessageAt: serverTimestamp(),
      lastMessagePreview: this.recortar(mensajeLimpio),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    const primerMensaje: Omit<SupportMessage, 'id'> = {
      ticketId: referenciaTicket.id,
      autorUid: usuario.uid,
      autorNombre: nombre,
      autorRol: 'ciudadano',
      texto: mensajeLimpio,
      createdAt: serverTimestamp(),
    };

    try {
      const lote = writeBatch(this.firestore);
      lote.set(referenciaTicket, ticket);
      lote.set(referenciaMensaje, primerMensaje);
      await lote.commit();

      return referenciaTicket.id;
    } catch (error) {
      throw this.traducir(error);
    }
  }

  /**
   * Envía un mensaje y actualiza el adelanto del ticket en el mismo lote, de
   * modo que la bandeja nunca muestre un adelanto que no corresponde al último
   * mensaje realmente escrito.
   */
  async enviarMensaje(
    ticketId: string,
    texto: string,
    rol: RolMensaje,
  ): Promise<void> {
    const usuario = this.authService.user;

    if (!usuario) {
      throw new SupportError('Tu sesión expiró. Vuelve a iniciar sesión.', 'sin_permiso');
    }

    const limpio = texto.trim();
    this.validarMensaje(limpio);

    const nombre = usuario.displayName?.trim() || usuario.email?.split('@')[0] || 'Vecino';
    const referenciaTicket = doc(this.firestore, 'supportTickets', ticketId);
    const referenciaMensaje = doc(
      collection(this.firestore, 'supportTickets', ticketId, 'messages'),
    );

    const mensaje: Omit<SupportMessage, 'id'> = {
      ticketId,
      autorUid: usuario.uid,
      autorNombre: nombre,
      autorRol: rol,
      texto: limpio,
      createdAt: serverTimestamp(),
    };

    try {
      const lote = writeBatch(this.firestore);
      lote.set(referenciaMensaje, mensaje);
      lote.update(referenciaTicket, {
        lastMessageAt: serverTimestamp(),
        lastMessagePreview: this.recortar(limpio),
        updatedAt: serverTimestamp(),
        // La primera respuesta del staff toma el caso automáticamente.
        ...(rol === 'staff' ? { estado: 'en_atencion', asignadoA: usuario.uid } : {}),
      });
      await lote.commit();
    } catch (error) {
      throw this.traducir(error);
    }
  }

  /**
   * Mensajes del ticket en tiempo real. `onSnapshot` mantiene la conversación
   * actualizada sin que el usuario recargue: es lo que hace que esto se sienta
   * un chat y no un formulario.
   */
  escucharMensajes(ticketId: string): Observable<SupportMessage[]> {
    return new Observable<SupportMessage[]>((subscriber) => {
      const consulta = query(
        collection(this.firestore, 'supportTickets', ticketId, 'messages'),
        orderBy('createdAt', 'asc'),
        limit(200),
      );

      // El callback llega fuera de la zona de Angular, igual que en AuthService.
      return onSnapshot(
        consulta,
        (snapshot) =>
          this.zone.run(() =>
            subscriber.next(
              snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as SupportMessage),
            ),
          ),
        (error) => this.zone.run(() => subscriber.error(error)),
      );
    });
  }

  /** Tickets del usuario autenticado, por actividad más reciente. */
  async misTickets(maximo = 30): Promise<SupportTicket[]> {
    const usuario = this.authService.user;

    if (!usuario) {
      return [];
    }

    const snapshot = await getDocs(
      query(
        collection(this.firestore, 'supportTickets'),
        where('uid', '==', usuario.uid),
        orderBy('lastMessageAt', 'desc'),
        limit(maximo),
      ),
    );

    return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as SupportTicket);
  }

  /**
   * Bandeja del equipo de soporte. El filtro de tipo viaja en la consulta y el
   * de estado se aplica en cliente, para no multiplicar índices compuestos por
   * cada combinación posible.
   */
  async bandeja(
    filtros: FiltrosBandeja = { tipo: 'todos', estado: 'todos' },
    maximo = 50,
  ): Promise<SupportTicket[]> {
    const restricciones = [
      ...(filtros.tipo !== 'todos' ? [where('tipo', '==', filtros.tipo)] : []),
      orderBy('lastMessageAt', 'desc'),
      limit(maximo),
    ];

    const snapshot = await getDocs(
      query(collection(this.firestore, 'supportTickets'), ...restricciones),
    );

    return snapshot.docs
      .map((d) => ({ id: d.id, ...d.data() }) as SupportTicket)
      .filter((ticket) => filtros.estado === 'todos' || ticket.estado === filtros.estado);
  }

  async obtenerTicket(ticketId: string): Promise<SupportTicket | null> {
    const snapshot = await getDoc(doc(this.firestore, 'supportTickets', ticketId));

    return snapshot.exists()
      ? ({ id: snapshot.id, ...snapshot.data() } as SupportTicket)
      : null;
  }

  transicionesDisponibles(estado: EstadoTicket): ReadonlyArray<EstadoTicket> {
    return TRANSICIONES_TICKET[estado] ?? [];
  }

  /** Cambio de estado del ticket. Solo el staff puede hacerlo. */
  async cambiarEstado(ticket: SupportTicket, nuevoEstado: EstadoTicket): Promise<void> {
    if (!this.transicionesDisponibles(ticket.estado).includes(nuevoEstado)) {
      throw new SupportError(
        `No es posible pasar de "${ticket.estado}" a "${nuevoEstado}".`,
        'validacion',
      );
    }

    try {
      await updateDoc(doc(this.firestore, 'supportTickets', ticket.id), {
        estado: nuevoEstado,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      throw this.traducir(error);
    }
  }

  formatearFecha(valor: SupportTicket['lastMessageAt']): string {
    if (!(valor instanceof Timestamp)) {
      return 'Ahora';
    }

    return valor.toDate().toLocaleString('es-CL', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  private recortar(texto: string): string {
    return texto.length <= 90 ? texto : `${texto.slice(0, 87)}…`;
  }

  private validarAsunto(asunto: string): void {
    if (asunto.length < ASUNTO_MIN || asunto.length > ASUNTO_MAX) {
      throw new SupportError(
        `El asunto debe tener entre ${ASUNTO_MIN} y ${ASUNTO_MAX} caracteres.`,
        'validacion',
      );
    }
  }

  private validarMensaje(texto: string): void {
    if (texto.length < MENSAJE_MIN || texto.length > MENSAJE_MAX) {
      throw new SupportError(
        `El mensaje debe tener entre ${MENSAJE_MIN} y ${MENSAJE_MAX} caracteres.`,
        'validacion',
      );
    }
  }

  private traducir(error: unknown): SupportError {
    if (error instanceof SupportError) {
      return error;
    }

    if (error instanceof FirebaseError) {
      if (error.code === 'permission-denied') {
        return new SupportError(
          'No tienes permiso para realizar esta acción.',
          'sin_permiso',
        );
      }

      if (error.code === 'unavailable') {
        return new SupportError(
          'Sin conexión con el servidor. Intenta nuevamente.',
          'red',
        );
      }
    }

    return new SupportError('No se pudo completar la operación.', 'desconocido');
  }
}
