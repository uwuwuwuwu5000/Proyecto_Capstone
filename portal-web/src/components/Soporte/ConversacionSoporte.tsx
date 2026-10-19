import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useConfirmacion } from '../Dialogo/useConfirmacion'
import AvatarSoporte from './AvatarSoporte'
import {
  COLORES_ESTADO,
  ETIQUETAS_ESTADO,
  ETIQUETAS_TIPO,
  MENSAJE_MAX,
  MENSAJE_MIN,
  TRANSICIONES_TICKET,
  cambiarEstadoTicket,
  enviarMensajeStaff,
  escucharMensajes,
  escucharTicket,
  etiquetaDia,
  formatearFecha,
} from './soporte'
import type { EstadoTicket, Mensaje, Ticket } from './soporte'
import styles from './Soporte.module.css'

export function PildoraEstadoTicket({ estado }: { estado: EstadoTicket }) {
  return (
    <span className={styles.pildora} style={{ borderColor: COLORES_ESTADO[estado] }}>
      <span className={styles.pildoraPunto} style={{ background: COLORES_ESTADO[estado] }} />
      {ETIQUETAS_ESTADO[estado]}
    </span>
  )
}

/** Mensajes seguidos del mismo autor, con menos de 5 minutos entre sí, se agrupan. */
const VENTANA_AGRUPACION_MS = 5 * 60_000

function textoAccion(actual: EstadoTicket, destino: EstadoTicket): string {
  if (destino === 'cerrado') return 'Cerrar conversación'
  if (actual === 'cerrado') return 'Reabrir'
  return 'Tomar el caso'
}

function IconoEnviar() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path
        d="M4 12 20 4l-4 16-4.5-6.5L4 12Zm7.5 1.5L20 4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** Conversación de un ticket: mensajes en tiempo real, respuesta, cambio de estado y detalles. */
export default function ConversacionSoporte({ ticketId }: { ticketId: string }) {
  const { user, perfil } = useAuth()
  const { confirmar, dialogo } = useConfirmacion()

  const [ticket, setTicket] = useState<Ticket | null | undefined>(undefined) // undefined = cargando
  const [mensajes, setMensajes] = useState<Mensaje[] | null>(null)
  const [error, setError] = useState('')
  const [borrador, setBorrador] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [errorEnvio, setErrorEnvio] = useState('')
  const [cambiando, setCambiando] = useState(false)
  const [alFinal, setAlFinal] = useState(true)

  const registroRef = useRef<HTMLDivElement>(null)
  const campoRef = useRef<HTMLTextAreaElement>(null)
  const cercaDelFinal = useRef(true)

  // Cada ticket empieza de cero; las dos suscripciones se cierran al cambiar o salir.
  useEffect(() => {
    setTicket(undefined)
    setMensajes(null)
    setError('')
    setBorrador('')
    setErrorEnvio('')
    setAlFinal(true)
    cercaDelFinal.current = true
    const fallar = (err: unknown) => {
      console.error('Error al leer la conversación:', err)
      setError('No pudimos cargar la conversación. Inténtalo nuevamente.')
    }
    const cierraTicket = escucharTicket(ticketId, setTicket, fallar)
    const cierraMensajes = escucharMensajes(ticketId, setMensajes, fallar)
    return () => {
      cierraTicket()
      cierraMensajes()
    }
  }, [ticketId])

  // Al llegar mensajes, baja al último; si quien lee subió, no lo arrastra.
  useEffect(() => {
    const registro = registroRef.current
    if (registro && cercaDelFinal.current) {
      registro.scrollTop = registro.scrollHeight
    }
  }, [mensajes])

  // La caja de respuesta crece con el texto, hasta un máximo.
  useLayoutEffect(() => {
    const campo = campoRef.current
    if (campo) {
      campo.style.height = 'auto'
      campo.style.height = `${Math.min(campo.scrollHeight, 160)}px`
    }
  }, [borrador])

  const nombreEquipo = perfil?.displayName?.trim() || user?.email?.split('@')[0] || 'Soporte'

  const grupos = useMemo(() => {
    const resultado: { dia: string; mensajes: Mensaje[] }[] = []
    for (const m of mensajes ?? []) {
      const dia = etiquetaDia(m.createdAt)
      const ultimo = resultado[resultado.length - 1]
      if (ultimo && ultimo.dia === dia) ultimo.mensajes.push(m)
      else resultado.push({ dia, mensajes: [m] })
    }
    return resultado
  }, [mensajes])

  function irAlFinal() {
    const registro = registroRef.current
    if (registro) {
      registro.scrollTo({ top: registro.scrollHeight, behavior: 'smooth' })
    }
  }

  async function enviar() {
    const texto = borrador.trim()
    if (texto.length < MENSAJE_MIN || enviando || !user || !ticket) return
    setEnviando(true)
    setErrorEnvio('')
    const respaldo = borrador
    setBorrador('')
    cercaDelFinal.current = true
    try {
      await enviarMensajeStaff(ticket.id, texto, { uid: user.uid, nombre: nombreEquipo })
    } catch (err) {
      // El texto vuelve al campo para no perderlo.
      setBorrador(respaldo)
      setErrorEnvio(err instanceof Error ? err.message : 'No pudimos enviar tu mensaje.')
    } finally {
      setEnviando(false)
      campoRef.current?.focus()
    }
  }

  function alPresionar(e: KeyboardEvent<HTMLTextAreaElement>) {
    // Enter envía; Shift+Enter hace un salto de línea.
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void enviar()
    }
  }

  async function cambiarEstado(nuevo: EstadoTicket) {
    if (!ticket) return
    const aceptado = await confirmar({
      titulo: `Marcar como «${ETIQUETAS_ESTADO[nuevo]}»`,
      mensaje: (
        <p>
          La conversación de <strong>{ticket.autorNombre}</strong> pasará de «
          {ETIQUETAS_ESTADO[ticket.estado]}» a «{ETIQUETAS_ESTADO[nuevo]}».
        </p>
      ),
      confirmar: 'Confirmar',
    })
    if (!aceptado) return
    setCambiando(true)
    setErrorEnvio('')
    try {
      await cambiarEstadoTicket(ticket, nuevo)
    } catch (err) {
      setErrorEnvio(err instanceof Error ? err.message : 'No pudimos cambiar el estado.')
    } finally {
      setCambiando(false)
    }
  }

  if (error) {
    return (
      <div className={styles.vacio} role="alert">
        <p>{error}</p>
      </div>
    )
  }
  if (ticket === undefined || mensajes === null) {
    return (
      <div className={styles.vacio}>
        <p>Cargando conversación…</p>
      </div>
    )
  }
  if (ticket === null) {
    return (
      <div className={styles.vacio}>
        <p>Esta conversación ya no existe.</p>
        <Link to="/admin/soporte" className={styles.enlace}>
          Volver a la bandeja
        </Link>
      </div>
    )
  }

  const asignacion =
    ticket.asignadoA === null
      ? 'Sin asignar'
      : ticket.asignadoA === user?.uid
        ? 'Asignado a ti'
        : 'Asignado a otro funcionario'

  const transiciones = TRANSICIONES_TICKET[ticket.estado]

  return (
    <section className={styles.conversacion} aria-label={`Conversación: ${ticket.asunto}`}>
      <div className={styles.columnaChat}>
        <header className={styles.cabecera}>
          <Link to="/admin/soporte" className={styles.volverLista}>
            ← Conversaciones
          </Link>
          <div className={styles.cabeceraFila}>
            <AvatarSoporte nombre={ticket.autorNombre} grande />
            <div className={styles.cabeceraTexto}>
              <h2 className={styles.asunto}>{ticket.asunto}</h2>
              <p className={styles.meta}>
                {ticket.autorNombre}
                <span className={styles.chipTipo}>{ETIQUETAS_TIPO[ticket.tipo]}</span>
                <span className={styles.metaAsignacion}>{asignacion}</span>
              </p>
            </div>
            <div className={styles.cabeceraAcciones}>
              <PildoraEstadoTicket estado={ticket.estado} />
              {transiciones.map((destino) => (
                <button
                  key={destino}
                  type="button"
                  className={`${styles.botonSecundario} ${destino === 'cerrado' ? styles.botonCerrar : ''}`}
                  onClick={() => cambiarEstado(destino)}
                  disabled={cambiando}
                >
                  {textoAccion(ticket.estado, destino)}
                </button>
              ))}
            </div>
          </div>
        </header>

        <div className={styles.areaMensajes}>
          <div
            ref={registroRef}
            className={styles.mensajes}
            role="log"
            aria-live="polite"
            aria-relevant="additions"
            aria-label="Mensajes"
            tabIndex={0}
            onScroll={(e) => {
              const el = e.currentTarget
              const cerca = el.scrollHeight - el.scrollTop - el.clientHeight < 80
              cercaDelFinal.current = cerca
              setAlFinal((previo) => (previo === cerca ? previo : cerca))
            }}
          >
            {grupos.length === 0 && <p className={styles.sinMensajes}>Aún no hay mensajes.</p>}
            {grupos.map((grupo) => (
              <div key={grupo.dia}>
                <p className={styles.separadorDia}>
                  <span>{grupo.dia}</span>
                </p>
                {grupo.mensajes.map((m, i) => {
                  const anterior = grupo.mensajes[i - 1]
                  const delEquipo = m.autorRol === 'staff'
                  const propio = m.autorUid === user?.uid
                  const agrupado =
                    !!anterior &&
                    anterior.autorUid === m.autorUid &&
                    (!m.createdAt ||
                      !anterior.createdAt ||
                      m.createdAt.getTime() - anterior.createdAt.getTime() < VENTANA_AGRUPACION_MS)
                  return (
                    <div
                      key={m.id}
                      className={`${styles.fila} ${delEquipo ? styles.filaEquipo : ''} ${agrupado ? styles.filaAgrupada : ''}`}
                    >
                      {agrupado ? (
                        <span className={styles.avatarEspacio} />
                      ) : (
                        <AvatarSoporte nombre={m.autorNombre} equipo={delEquipo} />
                      )}
                      <div className={styles.columnaMensaje}>
                        {!agrupado && (
                          <p className={styles.autorMensaje}>
                            <strong>{propio ? 'Tú' : m.autorNombre}</strong>
                            {delEquipo && !propio && <span className={styles.etiquetaEquipo}>Equipo</span>}
                            <time>{formatearFecha(m.createdAt)}</time>
                          </p>
                        )}
                        <div
                          className={`${styles.burbuja} ${delEquipo ? styles.burbujaEquipo : ''} ${agrupado ? styles.burbujaAgrupada : ''}`}
                          title={agrupado ? formatearFecha(m.createdAt) : undefined}
                        >
                          <p className={styles.textoMensaje}>{m.texto}</p>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
          {!alFinal && (
            <button type="button" className={styles.irAlFinal} onClick={irAlFinal}>
              ↓ Ir al último mensaje
            </button>
          )}
        </div>

        <footer className={styles.redaccion}>
          {ticket.estado === 'cerrado' && (
            <p className={styles.aviso}>
              La conversación está cerrada: si respondes, se reabrirá y quedará asignada a ti.
            </p>
          )}
          {errorEnvio && (
            <p className={styles.errorEnvio} role="alert">
              {errorEnvio}
            </p>
          )}
          <div className={styles.caja}>
            <label className={styles.etiquetaOculta} htmlFor="respuesta-soporte">
              Tu respuesta
            </label>
            <textarea
              id="respuesta-soporte"
              ref={campoRef}
              className={styles.campoTexto}
              value={borrador}
              maxLength={MENSAJE_MAX}
              rows={1}
              placeholder="Escribe tu respuesta…"
              onChange={(e) => setBorrador(e.target.value)}
              onKeyDown={alPresionar}
              disabled={enviando}
            />
            <div className={styles.cajaPie}>
              <span className={styles.contador}>
                Enter envía · Shift+Enter agrega una línea · {borrador.length}/{MENSAJE_MAX}
              </span>
              <button
                type="button"
                className={styles.botonEnviar}
                onClick={() => void enviar()}
                disabled={enviando || borrador.trim().length < MENSAJE_MIN}
                aria-label="Enviar respuesta"
              >
                <IconoEnviar />
                {enviando ? 'Enviando…' : 'Enviar'}
              </button>
            </div>
          </div>
          <p className={styles.firma}>Respondes como «{nombreEquipo}»</p>
        </footer>
      </div>

      {dialogo}
    </section>
  )
}
