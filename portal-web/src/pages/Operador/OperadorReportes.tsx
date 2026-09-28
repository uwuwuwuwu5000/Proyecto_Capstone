import { useEffect, useMemo, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { FirebaseError } from 'firebase/app'
import { db } from '../../firebase/config'
import { useAuth } from '../../context/AuthContext'
import { useRequiereOperador } from '../../hooks/useRequiereOperador'
import Navbar from '../../components/Navbar/Navbar'
import OperadorTabs from './OperadorTabs'
import TarjetaReporte from '../../components/Reportes/TarjetaReporte'
import DetalleReporte from '../../components/Reportes/DetalleReporte'
import FiltrosReportes from '../../components/Reportes/FiltrosReportes'
import { FILTROS_VACIOS, filtrarReportes, hayFiltrosActivos } from '../../components/Reportes/filtros'
import type { Filtros } from '../../components/Reportes/filtros'
import { cambiarEstadoReporte, mapearReporte } from '../../components/Reportes/reporte'
import type { Reporte } from '../../components/Reportes/reporte'
import { ETIQUETA_POR_ESTADO, TRANSICIONES } from '../../constants/reportes'
import styles from '../../components/Reportes/Reportes.module.css'
import pagina from './OperadorReportes.module.css'

export default function OperadorReportes() {
  const { cargando, autorizado, operadorId, operadorNombre } = useRequiereOperador()
  const { user } = useAuth()

  const [reportes, setReportes] = useState<Reporte[]>([])
  const [cargandoReportes, setCargandoReportes] = useState(true)
  const [error, setError] = useState('')
  const [filtros, setFiltros] = useState<Filtros>(FILTROS_VACIOS)

  const [detalleId, setDetalleId] = useState<string | null>(null)

  const [cambiandoId, setCambiandoId] = useState<string | null>(null)
  const [estadoNuevo, setEstadoNuevo] = useState('')
  const [comentario, setComentario] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [errorCambio, setErrorCambio] = useState('')

  useEffect(() => {
    if (!autorizado || !operadorId) {
      return
    }
    const unsubscribe = onSnapshot(
      query(collection(db, 'reports'), where('operadorId', '==', operadorId)),
      (snapshot) => {
        const lista = snapshot.docs.map(mapearReporte)
        lista.sort((a, b) => (b.fecha?.getTime() ?? 0) - (a.fecha?.getTime() ?? 0))
        setReportes(lista)
        setCargandoReportes(false)
        setError('')
      },
      (err) => {
        console.error('Error al leer los reportes del operador:', err)
        setError('No pudimos cargar tus reportes. Intenta más tarde.')
        setCargandoReportes(false)
      },
    )
    return unsubscribe
  }, [autorizado, operadorId])

  const reportesFiltrados = useMemo(() => filtrarReportes(reportes, filtros), [reportes, filtros])

  if (!cargando && !autorizado) {
    return <Navigate to="/" replace />
  }

  const reporteDetalle = detalleId ? reportes.find((r) => r.id === detalleId) ?? null : null

  function iniciarCambio(reporte: Reporte) {
    const siguientes = TRANSICIONES[reporte.estado] ?? []
    setCambiandoId(reporte.id)
    setEstadoNuevo(siguientes[0] ?? '')
    setComentario('')
    setErrorCambio('')
  }

  async function guardarCambio(reporte: Reporte) {
    if (!user || !estadoNuevo) {
      return
    }
    setGuardando(true)
    setErrorCambio('')
    try {
      await cambiarEstadoReporte(reporte, estadoNuevo, comentario, user.uid)
      setCambiandoId(null)
    } catch (err) {
      console.error('Error al cambiar el estado del reporte:', err)
      const code = err instanceof FirebaseError ? err.code : ''
      setErrorCambio(
        code === 'permission-denied'
          ? 'No tienes permiso para cambiar este reporte (puede que ya no esté asignado a tu operador).'
          : 'No pudimos cambiar el estado. Inténtalo nuevamente.',
      )
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className={pagina.page}>
      <Navbar />
      <OperadorTabs />

      <main className={styles.main}>
        <div>
          <h1 className={pagina.titulo}>Mis reportes</h1>
          <p className={pagina.subtitulo}>
            Reportes asignados a {operadorNombre ?? 'tu operador'}. Puedes ver su detalle y
            avanzarlos de estado.
          </p>
        </div>

        <FiltrosReportes
          filtros={filtros}
          onChange={setFiltros}
          visibles={reportesFiltrados.length}
          total={reportes.length}
        />

        {error && <p className={styles.errorTexto}>{error}</p>}
        {(cargando || cargandoReportes) && !error && (
          <p className={styles.estadoCarga}>Cargando reportes…</p>
        )}
        {!cargando && !cargandoReportes && reportesFiltrados.length === 0 && !error && (
          <p className={styles.estadoCarga}>
            {hayFiltrosActivos(filtros)
              ? 'Ningún reporte coincide con los filtros.'
              : 'Todavía no tienes reportes asignados.'}
          </p>
        )}

        <div className={styles.grid}>
          {reportesFiltrados.map((reporte) => {
            const siguientes = TRANSICIONES[reporte.estado] ?? []
            const cambiando = cambiandoId === reporte.id

            return (
              <TarjetaReporte key={reporte.id} reporte={reporte} operadorNombre={operadorNombre}>
                {cambiando ? (
                  <div className={styles.edicion}>
                    <label className={styles.campo}>
                      <span className={styles.etiqueta}>Nuevo estado</span>
                      <select
                        className={styles.entrada}
                        value={estadoNuevo}
                        onChange={(e) => setEstadoNuevo(e.target.value)}
                      >
                        {siguientes.map((estado) => (
                          <option key={estado} value={estado}>
                            {ETIQUETA_POR_ESTADO[estado] ?? estado}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className={styles.campo}>
                      <span className={styles.etiqueta}>Comentario (opcional)</span>
                      <input
                        type="text"
                        className={styles.entrada}
                        value={comentario}
                        maxLength={512}
                        onChange={(e) => setComentario(e.target.value)}
                      />
                    </label>
                    {errorCambio && <p className={styles.errorTexto}>{errorCambio}</p>}
                    <div className={styles.acciones}>
                      <button
                        type="button"
                        className={styles.accionBoton}
                        onClick={() => guardarCambio(reporte)}
                        disabled={guardando}
                      >
                        {guardando ? 'Guardando…' : 'Guardar'}
                      </button>
                      <button
                        type="button"
                        className={styles.enlaceBoton}
                        onClick={() => setCambiandoId(null)}
                        disabled={guardando}
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className={styles.acciones}>
                    <button
                      type="button"
                      className={styles.accionBoton}
                      onClick={() => setDetalleId(reporte.id)}
                    >
                      Ver detalle
                    </button>
                    {siguientes.length > 0 ? (
                      <button
                        type="button"
                        className={styles.accionBoton}
                        onClick={() => iniciarCambio(reporte)}
                      >
                        Cambiar estado
                      </button>
                    ) : (
                      <span className={styles.estadoCarga}>Estado final</span>
                    )}
                  </div>
                )}
              </TarjetaReporte>
            )
          })}
        </div>
      </main>

      {reporteDetalle && (
        <DetalleReporte
          reporte={reporteDetalle}
          operadorNombre={operadorNombre}
          onCerrar={() => setDetalleId(null)}
          gestionable
        />
      )}
    </div>
  )
}
