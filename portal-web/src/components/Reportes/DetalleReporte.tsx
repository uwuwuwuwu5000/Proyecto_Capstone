import { useEffect, useRef, useState } from 'react'
import { collection, getCountFromServer, getDocs, orderBy, query } from 'firebase/firestore'
import { FirebaseError } from 'firebase/app'
import { db } from '../../firebase/config'
import { useAuth } from '../../context/AuthContext'
import { ETIQUETA_POR_CATEGORIA, ETIQUETA_POR_ESTADO, TRANSICIONES } from '../../constants/reportes'
import FotoReporte from './FotoReporte'
import { EstadoPildora } from './TarjetaReporte'
import { cambiarEstadoReporte, formatearFecha } from './reporte'
import type { Reporte } from './reporte'
import styles from './Reportes.module.css'

interface CambioEstado {
  id: string
  desde: string
  hacia: string
  comentario: string
  fecha: Date | null
}

interface DetalleReporteProps {
  reporte: Reporte
  operadorNombre: string | null
  onCerrar: () => void
  /** Muestra el cambio rápido de estado (las reglas deciden si se permite). */
  gestionable?: boolean
}

export default function DetalleReporte({
  reporte,
  operadorNombre,
  onCerrar,
  gestionable = false,
}: DetalleReporteProps) {
  const { user } = useAuth()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [confirmaciones, setConfirmaciones] = useState<number | null>(null)
  const [historial, setHistorial] = useState<CambioEstado[] | null>(null)
  const [error, setError] = useState('')

  const siguientes = TRANSICIONES[reporte.estado] ?? []
  const [estadoNuevo, setEstadoNuevo] = useState('')
  const [comentario, setComentario] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [errorCambio, setErrorCambio] = useState('')
  const [avisoCambio, setAvisoCambio] = useState('')

  // Al cambiar el estado (aquí o desde otra pestaña) se reinicia la selección
  // a la primera transición disponible desde el estado nuevo.
  useEffect(() => {
    setEstadoNuevo((TRANSICIONES[reporte.estado] ?? [])[0] ?? '')
  }, [reporte.estado])

  async function guardarCambio() {
    if (!user || !estadoNuevo) {
      return
    }
    setGuardando(true)
    setErrorCambio('')
    setAvisoCambio('')
    try {
      const hacia = estadoNuevo
      await cambiarEstadoReporte(reporte, hacia, comentario, user.uid)
      setComentario('')
      setAvisoCambio(`Estado cambiado a "${ETIQUETA_POR_ESTADO[hacia] ?? hacia}".`)
    } catch (err) {
      console.error('Error al cambiar el estado del reporte:', err)
      const code = err instanceof FirebaseError ? err.code : ''
      setErrorCambio(
        code === 'permission-denied'
          ? 'No tienes permiso para cambiar este reporte.'
          : 'No pudimos cambiar el estado. Inténtalo nuevamente.',
      )
    } finally {
      setGuardando(false)
    }
  }

  useEffect(() => {
    dialogRef.current?.showModal()
  }, [])

  // El historial cambia al cambiar el estado, así que se vuelve a leer si el
  // estado del reporte abierto cambia mientras el detalle está visible.
  useEffect(() => {
    let cancelado = false
    const reporteRef = collection(db, 'reports', reporte.id, 'confirmations')
    Promise.all([
      getCountFromServer(reporteRef),
      getDocs(
        query(collection(db, 'reports', reporte.id, 'statusHistory'), orderBy('createdAt', 'desc')),
      ),
    ])
      .then(([conteo, historialSnap]) => {
        if (cancelado) return
        setConfirmaciones(conteo.data().count)
        setHistorial(
          historialSnap.docs.map((d) => {
            const data = d.data()
            return {
              id: d.id,
              desde: typeof data.desde === 'string' ? data.desde : '',
              hacia: typeof data.hacia === 'string' ? data.hacia : '',
              comentario: typeof data.comentario === 'string' ? data.comentario : '',
              fecha: typeof data.createdAt?.toDate === 'function' ? data.createdAt.toDate() : null,
            }
          }),
        )
      })
      .catch((err) => {
        console.error('Error al cargar el detalle del reporte:', err)
        if (!cancelado) setError('No pudimos cargar las confirmaciones y el historial.')
      })
    return () => {
      cancelado = true
    }
  }, [reporte.id, reporte.estado])

  return (
    <dialog
      ref={dialogRef}
      className={styles.dialogo}
      onClose={onCerrar}
      onClick={(e) => {
        // Clic en el fondo oscuro (fuera del contenido) cierra el detalle.
        if (e.target === dialogRef.current) dialogRef.current?.close()
      }}
      aria-labelledby="detalle-reporte-titulo"
    >
      <div className={styles.dialogoContenido}>
        <div className={styles.dialogoCabecera}>
          <h2 id="detalle-reporte-titulo" className={styles.dialogoTitulo}>
            {ETIQUETA_POR_CATEGORIA[reporte.categoria] ?? reporte.categoria}
          </h2>
          <button
            type="button"
            className={styles.cerrarBoton}
            onClick={() => dialogRef.current?.close()}
            aria-label="Cerrar detalle"
          >
            ✕
          </button>
        </div>

        <div className={styles.dialogoCuerpo}>
          <div className={styles.dialogoFoto}>
            <FotoReporte foto={reporte.foto} inmediata />
          </div>

          <div className={styles.dialogoInfo}>
            <EstadoPildora estado={reporte.estado} />
            <p className={styles.descripcionCompleta}>
              {reporte.descripcion || 'Sin descripción'}
            </p>

            <dl className={styles.datos}>
              <dt>Autor</dt>
              <dd>{reporte.autorNombre ?? 'Sin nombre registrado'}</dd>
              <dt>Fecha y hora</dt>
              <dd>{formatearFecha(reporte.fecha, true)}</dd>
              <dt>Estado actual</dt>
              <dd>{ETIQUETA_POR_ESTADO[reporte.estado] ?? reporte.estado}</dd>
              <dt>Confirmaciones</dt>
              <dd>{confirmaciones ?? (error ? '—' : 'Cargando…')}</dd>
              <dt>Comuna</dt>
              <dd>{reporte.comuna || '—'}</dd>
              <dt>Región</dt>
              <dd>{reporte.region || '—'}</dd>
              <dt>Ubicación</dt>
              <dd>
                {reporte.lat !== null && reporte.lng !== null ? (
                  <a
                    href={`https://www.openstreetmap.org/?mlat=${reporte.lat}&mlon=${reporte.lng}#map=18/${reporte.lat}/${reporte.lng}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {reporte.lat.toFixed(5)}, {reporte.lng.toFixed(5)}
                  </a>
                ) : (
                  '—'
                )}
              </dd>
              <dt>Operador</dt>
              <dd>{operadorNombre ?? reporte.operadorId ?? 'Sin asignar'}</dd>
              <dt>Organismo ID</dt>
              <dd>{reporte.organismoId ?? '—'}</dd>
              <dt>Id</dt>
              <dd>{reporte.id}</dd>
            </dl>

            {gestionable && (
              <div className={styles.cambioRapido}>
                <span className={styles.etiqueta}>Cambiar estado</span>
                {siguientes.length === 0 ? (
                  <p className={styles.estadoCarga}>
                    Este reporte está en su estado final: ya no se puede mover.
                  </p>
                ) : (
                  <>
                    <div className={styles.cambioRapidoFila}>
                      <select
                        className={styles.entrada}
                        value={estadoNuevo}
                        onChange={(e) => setEstadoNuevo(e.target.value)}
                        aria-label="Nuevo estado"
                      >
                        {siguientes.map((estado) => (
                          <option key={estado} value={estado}>
                            {ETIQUETA_POR_ESTADO[estado] ?? estado}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        className={styles.accionBoton}
                        onClick={guardarCambio}
                        disabled={guardando || !estadoNuevo}
                      >
                        {guardando ? 'Guardando…' : 'Aplicar'}
                      </button>
                    </div>
                    <input
                      type="text"
                      className={styles.entrada}
                      value={comentario}
                      maxLength={512}
                      onChange={(e) => setComentario(e.target.value)}
                      placeholder="Comentario (opcional)"
                      aria-label="Comentario del cambio de estado"
                    />
                  </>
                )}
                {errorCambio && <p className={styles.errorTexto}>{errorCambio}</p>}
                {avisoCambio && <p className={styles.avisoTexto}>{avisoCambio}</p>}
              </div>
            )}
          </div>
        </div>

        <h3 className={styles.historialTitulo}>Historial de estados</h3>
        {error && <p className={styles.estadoCarga}>{error}</p>}
        {!error && historial === null && <p className={styles.estadoCarga}>Cargando…</p>}
        {historial?.length === 0 && (
          <p className={styles.estadoCarga}>Todavía no hay cambios de estado.</p>
        )}
        {historial && historial.length > 0 && (
          <ol className={styles.historial}>
            {historial.map((cambio) => (
              <li key={cambio.id}>
                <span className={styles.historialFecha}>{formatearFecha(cambio.fecha, true)}</span>
                <span>
                  {ETIQUETA_POR_ESTADO[cambio.desde] ?? cambio.desde} →{' '}
                  <strong>{ETIQUETA_POR_ESTADO[cambio.hacia] ?? cambio.hacia}</strong>
                </span>
                {cambio.comentario && (
                  <span className={styles.historialComentario}>“{cambio.comentario}”</span>
                )}
              </li>
            ))}
          </ol>
        )}
      </div>
    </dialog>
  )
}
