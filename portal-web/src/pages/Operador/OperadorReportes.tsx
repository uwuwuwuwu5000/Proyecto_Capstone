import { useEffect, useMemo, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { FirebaseError } from 'firebase/app'
import { useAuth } from '../../context/AuthContext'
import { useRequiereOperador } from '../../hooks/useRequiereOperador'
import Navbar from '../../components/Navbar/Navbar'
import OperadorTabs from './OperadorTabs'
import TarjetaReporte from '../../components/Reportes/TarjetaReporte'
import DetalleReporte from '../../components/Reportes/DetalleReporte'
import FiltrosReportes from '../../components/Reportes/FiltrosReportes'
import {
  FILTROS_VACIOS,
  filtrarReportes,
  hayFiltrosActivos,
  resumenListado,
  soloFiltrosLocales,
} from '../../components/Reportes/filtros'
import type { Filtros } from '../../components/Reportes/filtros'
import { cambiarEstadoReporte } from '../../components/Reportes/reporte'
import type { Reporte } from '../../components/Reportes/reporte'
import { ETIQUETA_POR_ESTADO, TRANSICIONES } from '../../constants/reportes'
import BarraSeleccion from '../../components/Reportes/BarraSeleccion'
import type { MensajeLote } from '../../components/Reportes/BarraSeleccion'
import CasillaTodos from '../../components/Reportes/CasillaTodos'
import { useSeleccion } from '../../components/Reportes/useSeleccion'
import Paginador from '../../components/Reportes/Paginador'
import { useReportesPaginados } from '../../components/Reportes/useReportesPaginados'
import styles from '../../components/Reportes/Reportes.module.css'
import pagina from './OperadorReportes.module.css'

export default function OperadorReportes() {
  const { cargando, autorizado, operadorId, operadorNombre, organismoNombre } =
    useRequiereOperador()
  const { user, perfil } = useAuth()

  const [filtros, setFiltros] = useState<Filtros>(FILTROS_VACIOS)
  const [tamano, setTamano] = useState(24)

  // Solo los reportes de este operador, una página a la vez (índice operadorId + createdAt).
  const lista = useReportesPaginados({
    activo: autorizado && !!operadorId,
    filtros,
    operadorFijo: operadorId ?? undefined,
    tamano,
  })
  const reportes = lista.reportes

  const [detalleId, setDetalleId] = useState<string | null>(null)

  const [cambiandoId, setCambiandoId] = useState<string | null>(null)
  const [estadoNuevo, setEstadoNuevo] = useState('')
  const [comentario, setComentario] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [errorCambio, setErrorCambio] = useState('')
  const [mensajeLote, setMensajeLote] = useState<MensajeLote | null>(null)

  // Texto y foto filtran la página cargada; el resto ya lo filtró Firestore.
  const reportesFiltrados = useMemo(
    () => filtrarReportes(reportes, soloFiltrosLocales(filtros)),
    [reportes, filtros],
  )
  const seleccion = useSeleccion(reportesFiltrados)

  // La selección vale para la página que se ve: al cambiar de página o de filtros, se limpia.
  const { limpiar: limpiarSeleccion } = seleccion
  useEffect(() => {
    limpiarSeleccion()
  }, [lista.claveConsulta, lista.pagina, limpiarSeleccion])

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
      await cambiarEstadoReporte(reporte, estadoNuevo, comentario, {
        uid: user.uid,
        // Firma con el nombre del organismo (lo exige firmaHistorialValida).
        nombre: organismoNombre,
        rol: perfil?.role ?? null,
      })
      setCambiandoId(null)
      lista.recargar()
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

  const renderPaginador = (conAviso: boolean) => (
    <Paginador
      pagina={lista.pagina}
      totalPaginas={lista.totalPaginas}
      total={lista.total}
      tamano={lista.tamano}
      enPagina={reportes.length}
      hayAnterior={lista.hayAnterior}
      haySiguiente={lista.haySiguiente}
      cargando={lista.cargando}
      nuevos={lista.nuevos}
      onTamano={setTamano}
      onPrimera={lista.irPrimera}
      onAnterior={lista.irAnterior}
      onSiguiente={lista.irSiguiente}
      onRecargar={lista.recargar}
      onVerNuevos={lista.verNuevos}
      mostrarAviso={conAviso}
      idSelector={conAviso ? 'tamano-pagina-arriba' : 'tamano-pagina-abajo'}
    />
  )

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
          resumen={resumenListado(lista.total, reportes.length, reportesFiltrados.length, filtros)}
        />

        <div className={styles.barraExportar}>
          <span className={styles.barraEspacio} />
          <CasillaTodos
            total={reportesFiltrados.length}
            todos={seleccion.todos}
            algunos={seleccion.algunos}
            onAlternar={seleccion.alternarTodos}
          />
        </div>
        {mensajeLote && (
          <p
            className={`${styles.mensajeLote} ${mensajeLote.tipo === 'error' ? styles.mensajeError : styles.mensajeAviso}`}
            role="status"
          >
            {mensajeLote.texto}
          </p>
        )}

        {lista.error && (
          <p className={styles.errorTexto}>
            {lista.error.mensaje}{' '}
            {lista.error.enlaceIndice && (
              <a href={lista.error.enlaceIndice} target="_blank" rel="noreferrer">
                Crear el índice
              </a>
            )}
          </p>
        )}

        {renderPaginador(true)}
        {(cargando || lista.cargando) && reportes.length === 0 && !lista.error && (
          <p className={styles.estadoCarga}>Cargando reportes…</p>
        )}
        {!cargando && !lista.cargando && reportesFiltrados.length === 0 && !lista.error && (
          <p className={styles.estadoCarga}>
            {hayFiltrosActivos(filtros)
              ? 'Ningún reporte de esta página coincide con los filtros.'
              : 'Todavía no tienes reportes asignados.'}
          </p>
        )}

        <div className={styles.grid} style={{ opacity: lista.cargando && reportes.length > 0 ? 0.6 : 1 }}>
          {reportesFiltrados.map((reporte) => {
            const siguientes = TRANSICIONES[reporte.estado] ?? []
            const cambiando = cambiandoId === reporte.id

            return (
              <TarjetaReporte
                key={reporte.id}
                reporte={reporte}
                operadorNombre={operadorNombre}
                seleccionado={seleccion.estaSeleccionado(reporte.id)}
                onAlternarSeleccion={() => seleccion.alternar(reporte.id)}
              >
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

        {reportes.length > 0 && renderPaginador(false)}

        {/* El operador solo cambia estados: eliminar y reasignar son del admin. */}
        <BarraSeleccion
          seleccionados={seleccion.seleccionados}
          autor={
            user
              ? {
                  uid: user.uid,
                  // Firma con el nombre del organismo (lo exige firmaHistorialValida).
                  nombre: organismoNombre,
                  rol: perfil?.role ?? null,
                }
              : null
          }
          onLimpiar={seleccion.limpiar}
          onResultado={(mensaje) => {
            setMensajeLote(mensaje)
            lista.recargar()
          }}
        />
      </main>

      {reporteDetalle && (
        <DetalleReporte
          reporte={reporteDetalle}
          operadorNombre={operadorNombre}
          onCerrar={() => {
            setDetalleId(null)
            // Desde el detalle se pueden cambiar estados: la página se vuelve a leer.
            lista.recargar()
          }}
          gestionable
          organismoNombre={organismoNombre}
        />
      )}
    </div>
  )
}
