import { FieldValue, Timestamp } from 'firebase/firestore';

/** Naturaleza del contacto: determina cómo lo prioriza el equipo de soporte. */
export type TipoTicket = 'queja' | 'sugerencia';

/** Ciclo de vida de una conversación de soporte. */
export type EstadoTicket = 'abierto' | 'en_atencion' | 'cerrado';

export const ETIQUETAS_TIPO: Readonly<Record<TipoTicket, string>> = {
  queja: 'Queja',
  sugerencia: 'Sugerencia',
};

export const ETIQUETAS_ESTADO_TICKET: Readonly<Record<EstadoTicket, string>> = {
  abierto: 'Abierto',
  en_atencion: 'En atención',
  cerrado: 'Cerrado',
};

export const COLORES_ESTADO_TICKET: Readonly<Record<EstadoTicket, string>> = {
  abierto: '#1ca9c9',
  en_atencion: '#f0b429',
  cerrado: '#5c677d',
};

/** Transiciones permitidas. El cierre es reversible: un problema puede reabrirse. */
export const TRANSICIONES_TICKET: Readonly<
  Record<EstadoTicket, ReadonlyArray<EstadoTicket>>
> = {
  abierto: ['en_atencion', 'cerrado'],
  en_atencion: ['cerrado'],
  cerrado: ['en_atencion'],
};

export const ASUNTO_MIN = 5;
export const ASUNTO_MAX = 120;
export const MENSAJE_MIN = 2;
export const MENSAJE_MAX = 1000;

/**
 * Conversación de soporte en `supportTickets/{ticketId}`.
 *
 * `lastMessageAt` y `lastMessagePreview` están denormalizados a propósito: la
 * bandeja de entrada necesita ordenar por actividad reciente y mostrar un
 * adelanto sin leer la subcolección de mensajes de cada ticket. A diferencia del
 * contador de confirmaciones, aquí sí puede mantenerlo el cliente, porque quien
 * escribe el mensaje es el mismo que actualiza el ticket y las reglas validan
 * que ambos valores correspondan a esa escritura.
 */
export interface SupportTicket {
  id: string;
  uid: string;
  autorNombre: string;
  autorEmail: string;
  tipo: TipoTicket;
  asunto: string;
  estado: EstadoTicket;
  /** uid del funcionario que tomó el caso. Null mientras nadie lo atiende. */
  asignadoA: string | null;
  lastMessageAt: Timestamp | FieldValue;
  lastMessagePreview: string;
  createdAt: Timestamp | FieldValue;
  updatedAt: Timestamp | FieldValue;
}

/** Rol con el que se emitió un mensaje, para alinear las burbujas del chat. */
export type RolMensaje = 'ciudadano' | 'staff';

/** Mensaje en `supportTickets/{ticketId}/messages/{messageId}`. */
export interface SupportMessage {
  id: string;
  ticketId: string;
  autorUid: string;
  autorNombre: string;
  autorRol: RolMensaje;
  texto: string;
  createdAt: Timestamp | FieldValue;
}
