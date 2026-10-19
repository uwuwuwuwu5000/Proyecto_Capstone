import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { useRequiereAdmin } from '../../hooks/useRequiereAdmin'
import ConversacionSoporte, { PildoraEstadoTicket } from '../../components/Soporte/ConversacionSoporte'
import {
  ETIQUETAS_ESTADO,
  ETIQUETAS_TIPO,
  MAXIMO_BANDEJA,
  escucharBandeja,
  formatearFecha,
} from '../../components/Soporte/soporte'
import type { EstadoTicket, Ticket, TipoTicket } from '../../components/Soporte/soporte'
import admin from './Admin.module.css'
import styles from '../../components/Soporte/Soporte.module.css'

/**
 * Soporte: bandeja de quejas y sugerencias de los vecinos y su conversación.
 * Mismo comportamiento que la bandeja y el chat del equipo en la app móvil.
 * Escritorio: lista a la izquierda y conversación a la derecha. Teléfono: una
 * de las dos a la vez (/admin/soporte = lista, /admin/soporte/:id = chat).
 */
export default function AdminSoporte() {
  const { cargando, autorizado } = useRequiereAdmin()
  const { ticketId } = useParams()

  const [tipo, setTipo] = useState<TipoTicket | 'todos'>('todos')
  const [estado, setEstado] = useState<EstadoTicket | 'todos'>('todos')
  const [busqueda, setBusqueda] = useState('')
  const [tickets, setTickets] = useState<Ticket[] | null>(null)
  const [error, setError] = useState('')

  // La bandeja se mantiene en vivo: llegan quejas nuevas sin recargar.
  useEffect(() => {
    if (!autorizado) {
      return
    }
    setTickets(null)
    return escucharBandeja(
      tipo,
      (lista) => {
        setTickets(lista)
        setError('')
      },
      (err) => {
        console.error('Error al leer la bandeja de soporte:', err)
        setError('No pudimos cargar las conversaciones. Inténtalo nuevamente.')
      },
    )
  }, [autorizado, tipo])

  // El estado y la búsqueda se filtran aquí (el tipo ya viene filtrado desde Firestore).
  const visibles = useMemo(() => {
    const texto = busqueda.trim().toLowerCase()
    return (tickets ?? []).filter(
      (t) =>
        (estado === 'todos' || t.estado === estado) &&
        (!texto ||
          `${t.asunto} ${t.autorNombre} ${t.autorEmail} ${t.lastMessagePreview}`
            .toLowerCase()
            .includes(texto)),
    )
  }, [tickets, estado, busqueda])

  if (!cargando && !autorizado) {
    return <Navigate to="/" replace />
  }

  return (
      <main className={`${admin.main} ${styles.principal}`}>
        <div>
          <h1 className={admin.title}>Chat de Soporte</h1>
          <p className={admin.subtitle}>Responde aquí tus mensajes.</p>
        </div>

        <div className={`${styles.diseno} ${ticketId ? styles.conChat : ''}`}>
          <section className={styles.bandeja} aria-label="Conversaciones">
            <div className={styles.filtros}>
              <label className={styles.campoFiltro}>
                <span className={styles.etiquetaFiltro}>Buscar</span>
                <input
                  type="search"
                  className={styles.entrada}
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  placeholder="Asunto, vecino o mensaje…"
                />
              </label>
              <label className={styles.campoFiltro}>
                <span className={styles.etiquetaFiltro}>Tipo</span>
                <select
                  className={styles.entrada}
                  value={tipo}
                  onChange={(e) => setTipo(e.target.value as TipoTicket | 'todos')}
                >
                  <option value="todos">Todos</option>
                  {Object.entries(ETIQUETAS_TIPO).map(([clave, etiqueta]) => (
                    <option key={clave} value={clave}>
                      {etiqueta}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.campoFiltro}>
                <span className={styles.etiquetaFiltro}>Estado</span>
                <select
                  className={styles.entrada}
                  value={estado}
                  onChange={(e) => setEstado(e.target.value as EstadoTicket | 'todos')}
                >
                  <option value="todos">Todos</option>
                  {Object.entries(ETIQUETAS_ESTADO).map(([clave, etiqueta]) => (
                    <option key={clave} value={clave}>
                      {etiqueta}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {error && (
              <p className={styles.error} role="alert">
                {error}
              </p>
            )}
            {tickets === null && !error && <p className={styles.estado}>Cargando conversaciones…</p>}
            {tickets !== null && visibles.length === 0 && (
              <p className={styles.estado}>
                {tickets.length === 0
                  ? 'Todavía no hay conversaciones de soporte.'
                  : 'Ninguna conversación coincide con los filtros.'}
              </p>
            )}

            <ul className={styles.lista}>
              {visibles.map((t) => (
                <li key={t.id}>
                  <Link
                    to={`/admin/soporte/${t.id}`}
                    className={`${styles.ticket} ${t.id === ticketId ? styles.ticketActivo : ''} ${t.estado === 'abierto' ? styles.ticketAbierto : ''}`}
                    aria-current={t.id === ticketId ? 'page' : undefined}
                  >
                    <span className={styles.ticketCuerpo}>
                      <span className={styles.ticketFila}>
                        <span className={styles.ticketAsunto}>{t.asunto}</span>
                        <span className={styles.ticketHora}>{formatearFecha(t.lastMessageAt)}</span>
                      </span>
                      <span className={styles.ticketAutor}>
                        {t.autorNombre} · {ETIQUETAS_TIPO[t.tipo]}
                      </span>
                      <span className={styles.ticketVista}>{t.lastMessagePreview}</span>
                      <PildoraEstadoTicket estado={t.estado} />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
            {tickets !== null && tickets.length >= MAXIMO_BANDEJA && (
              <p className={styles.nota}>
                Se muestran las {MAXIMO_BANDEJA} conversaciones con actividad más reciente.
              </p>
            )}
          </section>

          <div className={styles.panelChat}>
            {ticketId ? (
              <ConversacionSoporte key={ticketId} ticketId={ticketId} />
            ) : (
              <div className={styles.vacio}>
                <p>Elige una conversación para leerla y responder.</p>
              </div>
            )}
          </div>
        </div>
      </main>
  )
}
