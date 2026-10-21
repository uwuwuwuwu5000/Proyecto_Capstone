// Soporte: quejas y sugerencias de los vecinos (colecciones `supportTickets` y
// `supportTickets/{id}/messages`). Es el mismo modelo y el mismo comportamiento
// que la app móvil (support.service.ts / support.model.ts de main-mobile): el
// portal es otro cliente de las mismas colecciones y de las mismas reglas.
import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore'
import type { DocumentData, Unsubscribe } from 'firebase/firestore'
import { FirebaseError } from 'firebase/app'
import { db } from '../../firebase/config'

export type TipoTicket = 'queja' | 'sugerencia'
export type EstadoTicket = 'abierto' | 'en_atencion' | 'cerrado'
export type RolMensaje = 'ciudadano' | 'staff'

export const ETIQUETAS_TIPO: Record<TipoTicket, string> = {
  queja: 'Queja',
  sugerencia: 'Sugerencia',
}

export const ETIQUETAS_ESTADO: Record<EstadoTicket, string> = {
  abierto: 'Abierto',
  en_atencion: 'En atención',
  cerrado: 'Cerrado',
}

// Mismos colores que la app móvil (COLORES_ESTADO_TICKET).
export const COLORES_ESTADO: Record<EstadoTicket, string> = {
  abierto: '#1ca9c9',
  en_atencion: '#f0b429',
  cerrado: '#5c677d',
}

/** Transiciones permitidas (igual que transicionTicketValida() en las reglas). El cierre es reversible. */
export const TRANSICIONES_TICKET: Record<EstadoTicket, EstadoTicket[]> = {
  abierto: ['en_atencion', 'cerrado'],
  en_atencion: ['cerrado'],
  cerrado: ['en_atencion'],
}

export const MENSAJE_MIN = 2
export const MENSAJE_MAX = 1000

/** Tope de la bandeja y de la conversación (como la app móvil: 50 y 200). */
export const MAXIMO_BANDEJA = 50
const MAXIMO_MENSAJES = 200

export interface Ticket {
  id: string
  uid: string
  autorNombre: string
  autorEmail: string
  tipo: TipoTicket
  asunto: string
  estado: EstadoTicket
  /** uid del funcionario que tomó el caso; null mientras nadie lo atiende. */
  asignadoA: string | null
  lastMessageAt: Date | null
  lastMessagePreview: string
  createdAt: Date | null
}

export interface Mensaje {
  id: string
  ticketId: string
  autorUid: string
  autorNombre: string
  autorRol: RolMensaje
  texto: string
  /** null mientras el servidor no confirma la hora (mensaje recién enviado). */
  createdAt: Date | null
}

function aFecha(valor: unknown): Date | null {
  const candidato = valor as { toDate?: () => Date } | null | undefined
  return typeof candidato?.toDate === 'function' ? candidato.toDate() : null
}

function texto(valor: unknown, porDefecto = ''): string {
  return typeof valor === 'string' ? valor : porDefecto
}

export function mapearTicket(id: string, data: DocumentData): Ticket {
  const estado = data.estado as EstadoTicket
  const tipo = data.tipo as TipoTicket
  return {
    id,
    uid: texto(data.uid),
    autorNombre: texto(data.autorNombre, 'Vecino'),
    autorEmail: texto(data.autorEmail),
    tipo: tipo in ETIQUETAS_TIPO ? tipo : 'queja',
    asunto: texto(data.asunto, '(sin asunto)'),
    estado: estado in ETIQUETAS_ESTADO ? estado : 'abierto',
    asignadoA: typeof data.asignadoA === 'string' ? data.asignadoA : null,
    lastMessageAt: aFecha(data.lastMessageAt),
    lastMessagePreview: texto(data.lastMessagePreview),
    createdAt: aFecha(data.createdAt),
  }
}

function mapearMensaje(id: string, data: DocumentData): Mensaje {
  return {
    id,
    ticketId: texto(data.ticketId),
    autorUid: texto(data.autorUid),
    autorNombre: texto(data.autorNombre, 'Vecino'),
    autorRol: data.autorRol === 'staff' ? 'staff' : 'ciudadano',
    texto: texto(data.texto),
    createdAt: aFecha(data.createdAt),
  }
}

// ---------------------------------------------------------------------------
// Lecturas en tiempo real
// ---------------------------------------------------------------------------

/**
 * Bandeja: las conversaciones más recientes. El tipo viaja en la consulta
 * (índice tipo + lastMessageAt); el estado se filtra en la pantalla, para no
 * necesitar un índice por cada combinación.
 */
export function escucharBandeja(
  tipo: TipoTicket | 'todos',
  alCambiar: (tickets: Ticket[]) => void,
  alFallar: (err: unknown) => void,
): Unsubscribe {
  return onSnapshot(
    query(
      collection(db, 'supportTickets'),
      ...(tipo !== 'todos' ? [where('tipo', '==', tipo)] : []),
      orderBy('lastMessageAt', 'desc'),
      limit(MAXIMO_BANDEJA),
    ),
    (snapshot) => alCambiar(snapshot.docs.map((d) => mapearTicket(d.id, d.data()))),
    alFallar,
  )
}

/** Un ticket (null si ya no existe). */
export function escucharTicket(
  ticketId: string,
  alCambiar: (ticket: Ticket | null) => void,
  alFallar: (err: unknown) => void,
): Unsubscribe {
  return onSnapshot(
    doc(db, 'supportTickets', ticketId),
    (snapshot) => alCambiar(snapshot.exists() ? mapearTicket(snapshot.id, snapshot.data() ?? {}) : null),
    alFallar,
  )
}

/** Los últimos 200 mensajes de la conversación, del más antiguo al más reciente. */
export function escucharMensajes(
  ticketId: string,
  alCambiar: (mensajes: Mensaje[]) => void,
  alFallar: (err: unknown) => void,
): Unsubscribe {
  return onSnapshot(
    query(
      collection(db, 'supportTickets', ticketId, 'messages'),
      orderBy('createdAt', 'desc'),
      limit(MAXIMO_MENSAJES),
    ),
    (snapshot) => alCambiar(snapshot.docs.map((d) => mapearMensaje(d.id, d.data())).reverse()),
    alFallar,
  )
}

/**
 * Las conversaciones abiertas (nadie las ha tomado), con su detalle: de aquí
 * salen el contador del panel y los avisos de la campana del administrador.
 */
export function escucharAbiertasDetalle(
  alCambiar: (tickets: Ticket[]) => void,
  alFallar: (err: unknown) => void,
): Unsubscribe {
  return onSnapshot(
    query(collection(db, 'supportTickets'), where('estado', '==', 'abierto'), limit(100)),
    (snapshot) => alCambiar(snapshot.docs.map((d) => mapearTicket(d.id, d.data()))),
    alFallar,
  )
}

/** Cantidad de conversaciones abiertas (nadie las ha tomado): el contador del panel. */
export function escucharAbiertos(
  alCambiar: (cantidad: number) => void,
  alFallar: (err: unknown) => void,
): Unsubscribe {
  return onSnapshot(
    query(collection(db, 'supportTickets'), where('estado', '==', 'abierto'), limit(100)),
    (snapshot) => alCambiar(snapshot.docs.length),
    alFallar,
  )
}

// ---------------------------------------------------------------------------
// Escrituras
// ---------------------------------------------------------------------------

export class ErrorSoporte extends Error {
  constructor(mensaje: string) {
    super(mensaje)
    this.name = 'ErrorSoporte'
  }
}

function traducir(err: unknown): ErrorSoporte {
  if (err instanceof ErrorSoporte) return err
  if (err instanceof FirebaseError) {
    if (err.code === 'permission-denied') {
      return new ErrorSoporte('No tienes permiso para realizar esta acción.')
    }
    if (err.code === 'unavailable') {
      return new ErrorSoporte('Sin conexión con el servidor. Intenta nuevamente.')
    }
  }
  return new ErrorSoporte('No se pudo completar la operación.')
}

function recortar(texto: string): string {
  return texto.length <= 90 ? texto : `${texto.slice(0, 87)}…`
}

/**
 * Responde como equipo de soporte. El mensaje y el adelanto del ticket se
 * escriben en un mismo lote, así la bandeja nunca muestra un adelanto que no
 * corresponde al último mensaje. Igual que en la app móvil, responder toma el
 * caso: queda "En atención" y asignado a quien responde (si estaba cerrado, se
 * reabre).
 */
export async function enviarMensajeStaff(
  ticketId: string,
  mensaje: string,
  autor: { uid: string; nombre: string },
): Promise<void> {
  const limpio = mensaje.trim()
  if (limpio.length < MENSAJE_MIN || limpio.length > MENSAJE_MAX) {
    throw new ErrorSoporte(`El mensaje debe tener entre ${MENSAJE_MIN} y ${MENSAJE_MAX} caracteres.`)
  }
  const referenciaTicket = doc(db, 'supportTickets', ticketId)
  const referenciaMensaje = doc(collection(db, 'supportTickets', ticketId, 'messages'))
  try {
    const lote = writeBatch(db)
    lote.set(referenciaMensaje, {
      ticketId,
      autorUid: autor.uid,
      autorNombre: autor.nombre,
      autorRol: 'staff',
      texto: limpio,
      createdAt: serverTimestamp(),
    })
    lote.update(referenciaTicket, {
      lastMessageAt: serverTimestamp(),
      lastMessagePreview: recortar(limpio),
      updatedAt: serverTimestamp(),
      estado: 'en_atencion',
      asignadoA: autor.uid,
    })
    await lote.commit()
  } catch (err) {
    console.error('Error al enviar el mensaje de soporte:', err)
    throw traducir(err)
  }
}

/** Cambia el estado de la conversación (solo el equipo puede). */
export async function cambiarEstadoTicket(ticket: Ticket, nuevo: EstadoTicket): Promise<void> {
  if (!TRANSICIONES_TICKET[ticket.estado].includes(nuevo)) {
    throw new ErrorSoporte(`No es posible pasar de "${ticket.estado}" a "${nuevo}".`)
  }
  try {
    await updateDoc(doc(db, 'supportTickets', ticket.id), {
      estado: nuevo,
      updatedAt: serverTimestamp(),
    })
  } catch (err) {
    console.error('Error al cambiar el estado del ticket:', err)
    throw traducir(err)
  }
}

// ---------------------------------------------------------------------------
// Presentación
// ---------------------------------------------------------------------------

/** "09/10 16:59"; "Ahora" mientras el servidor no confirma la hora. */
export function formatearFecha(fecha: Date | null): string {
  if (!fecha) return 'Ahora'
  return fecha.toLocaleString('es-CL', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** "Hoy", "Ayer" o "9 de octubre de 2026": separador entre días de la conversación. */
export function etiquetaDia(fecha: Date | null): string {
  const dia = fecha ?? new Date()
  const hoy = new Date()
  const inicio = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const diferencia = Math.round((inicio(hoy) - inicio(dia)) / 86_400_000)
  if (diferencia === 0) return 'Hoy'
  if (diferencia === 1) return 'Ayer'
  return dia.toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' })
}

/** "MR" para "María Rojas"; las dos primeras letras si el nombre es una sola palabra. */
export function iniciales(nombre: string): string {
  const palabras = nombre.split(/\s+/).filter((p) => p.length > 0)
  if (palabras.length === 0) return '?'
  const letras = palabras.length === 1 ? palabras[0].slice(0, 2) : palabras[0][0] + palabras[1][0]
  return letras.toUpperCase()
}

/** "9 de octubre de 2026, 16:59": para el panel de detalles. */
export function formatearFechaLarga(fecha: Date | null): string {
  if (!fecha) return 'Ahora'
  return fecha.toLocaleString('es-CL', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
