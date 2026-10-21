import { useEffect, useRef, useState } from 'react'
import { collection, getCountFromServer } from 'firebase/firestore'
import { FirebaseError } from 'firebase/app'
import { db } from '../../firebase/config'
import { useAuth } from '../../context/AuthContext'
import { ETIQUETA_POR_ESTADO, TRANSICIONES } from '../../constants/reportes'
import { ErrorSinVeredicto, motivoSinVeredicto, siguientesEstados } from '../../confianza/exigirVeredicto'
import { useCategorias } from '../../context/CategoriasContext'
import FotoReporte from './FotoReporte'
import { EstadoPildora } from './TarjetaReporte'
import { cambiarEstadoReporte, formatearFecha } from './reporte'
import type { Reporte } from './reporte'
import { cargarHistorial } from './historial'
import { cargarReporte } from './useReportesPaginados'
import { textoResolucion } from './tiempos'
import HistorialEstados from './HistorialEstados'
import type { CambioEstado } from './historial'
import BarraVerificacion from '../../confianza/BarraVerificacion'
import VeredictoReporte from '../../confianza/VeredictoReporte'
import ModeracionReporte from '../../confianza/ModeracionReporte'
import styles from './Reportes.module.css'

interface DetalleReporteProps {
  reporte: Reporte
  operadorNombre: string | null
  onCerrar: () => void
  /** Muestra el cambio rápido de estado (las reglas deciden si se permite). */
  gestionable?: boolean
  /**
   * Nombre del organismo de la cuenta operador que gestiona, con el que firma
   * los cambios de estado (ver useRequiereOperador). No aplica a un admin.
   */
  organismoNombre?: string | null
  /**
   * 'gestion' (paneles de admin y operador) muestra los datos internos del
   * reporte; 'ciudadano' (historial del usuario) los oculta y muestra en su
   * lugar el organismo responsable con su nombre.
   */
  vista?: 'gestion' | 'ciudadano'
}

export default function DetalleReporte({
  reporte: reporteDelPadre,
  operadorNombre,
  onCerrar,
  gestionable = false,
  organismoNombre = null,
  vista = 'gestion',
}: DetalleReporteProps) {
  const { user, perfil } = useAuth()
  const { etiqueta } = useCategorias()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [confirmaciones, setConfirmaciones] = useState<number | null>(null)
  const [historial, setHistorial] = useState<CambioEstado[] | null>(null)
  const [error, setError] = useState('')

  // El estado que ve este detalle. Lo cambia el propio detalle al guardar: el
  // listado de donde viene el reporte puede no recargarse hasta cerrarlo, y con
  // un estado viejo el segundo cambio se rechazaría (`desde` no coincidiría con
  // el estado real). Si el padre sí actualiza el reporte, se sigue al padre.
  const [estadoActual, setEstadoActual] = useState(reporteDelPadre.estado)
  useEffect(() => {
    setEstadoActual(reporteDelPadre.estado)
  }, [reporteDelPadre.estado])
  // Tras guardar se vuelve a leer el reporte: así aparecen de inmediato los datos
  // que pone el servidor (fecha de resolución, tiempo) sin depender del listado.
  const [refrescado, setRefrescado] = useState<Reporte | null>(null)
  const reporte: Reporte = { ...(refrescado ?? reporteDelPadre), estado: estadoActual }

  const sinVeredicto = motivoSinVeredicto(reporte, user?.uid)
  const siguientes = siguientesEstados(reporte, user?.uid)
  // Igual que la app: con los datos guardados al resolver y, en los reportes
  // anteriores a esos datos, con el historial de estados.
  const resolucion = textoResolucion(reporte, historial)
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
      await cambiarEstadoReporte(reporte, hacia, comentario, {
        uid: user.uid,
        // Un operador firma con el nombre de su organismo, nunca con su
        // displayName (que la propia cuenta puede editar): así lo exige
        // firmaHistorialValida. Si aún no cargó, se omite la firma.
        nombre:
          perfil?.role === 'operador' ? organismoNombre : (perfil?.displayName ?? null),
        rol: perfil?.role ?? null,
      })
      setComentario('')
      setEstadoActual(hacia)
      setAvisoCambio(`Estado cambiado a "${ETIQUETA_POR_ESTADO[hacia] ?? hacia}".`)
      void cargarReporte(reporte.id)
        .then((fresco) => fresco && setRefrescado(fresco))
        .catch((e) => console.error('No se pudo refrescar el reporte:', e))
    } catch (err) {
      console.error('Error al cambiar el estado del reporte:', err)
      if (err instanceof ErrorSinVeredicto) {
        setErrorCambio(err.message)
        return
      }
      const code = err instanceof FirebaseError ? err.code : ''
      if (code === 'permission-denied') {
        // Antes de culpar a los permisos, se comprueba si el reporte ya cambió de
        // estado (en otra pestaña o por otra persona): en ese caso se actualiza.
        const actual = await cargarReporte(reporte.id).catch(() => null)
        if (actual && actual.estado !== reporte.estado) {
          setEstadoActual(actual.estado)
          setErrorCambio(
            `Este reporte ya cambió de estado (ahora está «${ETIQUETA_POR_ESTADO[actual.estado] ?? actual.estado}»). Revisa y vuelve a intentarlo.`,
          )
          return
        }
        setErrorCambio('No tienes permiso para cambiar este reporte.')
      } else {
        setErrorCambio('No pudimos cambiar el estado. Inténtalo nuevamente.')
      }
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
    Promise.all([
      getCountFromServer(collection(db, 'reports', reporte.id, 'confirmations')),
      cargarHistorial(reporte.id),
    ])
      .then(([conteo, cambios]) => {
        if (cancelado) return
        setConfirmaciones(conteo.data().count)
        setHistorial(cambios)
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
            {etiqueta(reporte.categoria)}
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
              <dd>
                {reporte.autorNombre ?? 'Sin nombre registrado'}
                {reporte.origen === 'portal_admin' && ' · creado desde el portal'}
              </dd>
              <dt>Fecha y hora</dt>
              <dd>{formatearFecha(reporte.fecha, true)}</dd>
              <dt>Estado actual</dt>
              <dd>{ETIQUETA_POR_ESTADO[reporte.estado] ?? reporte.estado}</dd>
              {resolucion && (
                <>
                  <dt>Resolución</dt>
                  <dd>{resolucion}</dd>
                </>
              )}
              <dt>Confirmaciones</dt>
              <dd>{confirmaciones ?? (error ? '—' : 'Cargando…')}</dd>
              <dt>Verificación</dt>
              <dd>
                <BarraVerificacion validacion={reporte.validacion} compacta />
              </dd>
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
              {vista === 'ciudadano' ? (
                <>
                  <dt>Organismo responsable</dt>
                  <dd>{reporte.organismoNombre ?? 'Por asignar'}</dd>
                </>
              ) : (
                <>
                  <dt>Operador</dt>
                  <dd>{operadorNombre ?? reporte.operadorId ?? 'Sin asignar'}</dd>
                  <dt>Organismo ID</dt>
                  <dd>{reporte.organismoId ?? '—'}</dd>
                  <dt>Id</dt>
                  <dd>{reporte.id}</dd>
                </>
              )}
            </dl>

            {gestionable && (
              <div className={styles.cambioRapido}>
                <span className={styles.etiqueta}>Cambiar estado</span>
                {sinVeredicto ? (
                  <p className={styles.estadoCarga}>{sinVeredicto}</p>
                ) : siguientes.length === 0 ? (
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

            {gestionable && vista === 'gestion' && <ModeracionReporte reporte={reporte} />}

            {gestionable && vista === 'gestion' && (
              <VeredictoReporte
                reporte={reporte}
                onAplicado={() => {
                  void cargarReporte(reporte.id)
                    .then((fresco) => fresco && setRefrescado(fresco))
                    .catch((e) => console.error('No se pudo refrescar el reporte:', e))
                }}
              />
            )}
          </div>
        </div>

        <h3 className={styles.historialTitulo}>Historial de estados</h3>
        {error && <p className={styles.estadoCarga}>{error}</p>}
        {!error && historial === null && <p className={styles.estadoCarga}>Cargando…</p>}
        {historial && <HistorialEstados cambios={historial} fechaCreacion={reporte.fecha} />}
      </div>
    </dialog>
  )
}
