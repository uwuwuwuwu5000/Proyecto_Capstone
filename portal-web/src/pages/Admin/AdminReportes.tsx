import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router-dom'
import {
  collection,
  doc,
  onSnapshot,
  serverTimestamp,
  updateDoc,
  writeBatch,
} from 'firebase/firestore'
import { db } from '../../firebase/config'
import { useAuth } from '../../context/AuthContext'
import { useRequiereAdmin } from '../../hooks/useRequiereAdmin'
import TarjetaReporte from '../../components/Reportes/TarjetaReporte'
import DetalleReporte from '../../components/Reportes/DetalleReporte'
import FiltrosReportes from '../../components/Reportes/FiltrosReportes'
import { useNombresComunas } from '../../hooks/useNombresComunas'
import {
  FILTROS_VACIOS,
  filtrarReportes,
  hayFiltrosActivos,
  resumenListado,
  soloFiltrosLocales,
} from '../../components/Reportes/filtros'
import type { Filtros } from '../../components/Reportes/filtros'
import { cambiarEstadoReporte } from '../../components/Reportes/reporte'
import type { OperadorResumen, Reporte } from '../../components/Reportes/reporte'
import { construirCsvReportes, descargarCsv } from '../../components/Reportes/exportar'
import { eliminarReporte } from '../../components/Reportes/accionesLote'
import BarraSeleccion from '../../components/Reportes/BarraSeleccion'
import type { MensajeLote } from '../../components/Reportes/BarraSeleccion'
import CasillaTodos from '../../components/Reportes/CasillaTodos'
import { useSeleccion } from '../../components/Reportes/useSeleccion'
import Paginador from '../../components/Reportes/Paginador'
import {
  cargarReporte,
  cargarReportesSinOperador,
  descargarTodosLosReportes,
  useReportesPaginados,
} from '../../components/Reportes/useReportesPaginados'
import { useConfirmacion } from '../../components/Dialogo/useConfirmacion'
import { fechaInput } from '../../components/Reportes/rangosRapidos'
import { useCategorias } from '../../context/CategoriasContext'
import { ETIQUETA_POR_ESTADO, TRANSICIONES } from '../../constants/reportes'
import styles from './Admin.module.css'
import propios from '../../components/Reportes/Reportes.module.css'

/**
 * Filtros iniciales desde la URL (p. ej. los accesos del inicio del panel:
 * ?operador=__sin_operador__, ?desde=2026-10-07&hasta=2026-10-07).
 */
function filtrosDesdeUrl(params: URLSearchParams): Filtros {
  const filtros: Record<string, string> = { ...FILTROS_VACIOS }
  for (const clave of Object.keys(FILTROS_VACIOS)) {
    const valor = params.get(clave)
    if (valor !== null) filtros[clave] = valor
  }
  return filtros as unknown as Filtros
}

export default function AdminReportes() {
  const { cargando, autorizado } = useRequiereAdmin()
  const { user, perfil } = useAuth()
  const [params, setParams] = useSearchParams()
  const { confirmar, dialogo } = useConfirmacion()
  const comunas = useNombresComunas(autorizado)

  const [operadores, setOperadores] = useState<OperadorResumen[]>([])
  const [error, setError] = useState('')
  const [filtros, setFiltros] = useState<Filtros>(() => filtrosDesdeUrl(params))
  const [tamano, setTamano] = useState(24)

  // Una página de reportes a la vez, leída en Firestore (ver useReportesPaginados).
  const lista = useReportesPaginados({ activo: autorizado, filtros, tamano })
  const pagina = lista.reportes

  // ?reporte=<id> abre su detalle (p. ej. "Ver el reporte" tras crearlo).
  const [detalleId, setDetalleId] = useState<string | null>(() => params.get('reporte'))
  const [mensajeLote, setMensajeLote] = useState<MensajeLote | null>(null)

  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [estadoNuevo, setEstadoNuevo] = useState('')
  const [operadorNuevo, setOperadorNuevo] = useState('')
  const [comentario, setComentario] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [errorEdicion, setErrorEdicion] = useState('')

  const [eliminandoId, setEliminandoId] = useState<string | null>(null)

  const { etiqueta } = useCategorias()
  const [estadoCsv, setEstadoCsv] = useState<string | null>(null)
  const [errorExportar, setErrorExportar] = useState('')

  // Reportes sin operador encontrados por la herramienta de vinculación.
  const [pendientes, setPendientes] = useState<Reporte[] | null>(null)
  const [buscandoPendientes, setBuscandoPendientes] = useState(false)
  const [vinculando, setVinculando] = useState(false)
  const [vinculoError, setVinculoError] = useState('')
  const [vinculoAviso, setVinculoAviso] = useState('')

  useEffect(() => {
    if (!autorizado) {
      return
    }
    const unsubscribe = onSnapshot(collection(db, 'operadores'), (snapshot) => {
      const lista = snapshot.docs.map((operadorSnap) => {
        const data = operadorSnap.data()
        return {
          id: operadorSnap.id,
          nombre: typeof data.nombre === 'string' ? data.nombre : operadorSnap.id,
          organismoId: typeof data.organismoId === 'string' ? data.organismoId : '',
          activo: data.activo !== false,
        }
      })
      lista.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
      setOperadores(lista)
    })
    return unsubscribe
  }, [autorizado])

  const operadorPorId = useMemo(
    () => new Map(operadores.map((operador) => [operador.id, operador])),
    [operadores],
  )

  // Si dos operadores activos comparten organismo, se usa el primero por nombre.
  const operadorPorOrganismo = useMemo(() => {
    const mapa = new Map<string, OperadorResumen>()
    for (const operador of operadores) {
      if (operador.activo && operador.organismoId && !mapa.has(operador.organismoId)) {
        mapa.set(operador.organismoId, operador)
      }
    }
    return mapa
  }, [operadores])

  // Texto y foto filtran la página cargada; el resto ya lo filtró Firestore.
  const reportesFiltrados = useMemo(
    () => filtrarReportes(pagina, soloFiltrosLocales(filtros)),
    [pagina, filtros],
  )
  const seleccion = useSeleccion(reportesFiltrados)

  // La selección vale para la página que se ve: al cambiar de página o de filtros, se limpia.
  const { limpiar: limpiarSeleccion } = seleccion
  useEffect(() => {
    limpiarSeleccion()
  }, [lista.claveConsulta, lista.pagina, limpiarSeleccion])

  // ?reporte=<id> puede no estar en la página cargada: se pide aparte.
  const [reporteAparte, setReporteAparte] = useState<Reporte | null>(null)
  useEffect(() => {
    if (!autorizado || !detalleId || lista.cargando) {
      return
    }
    if (pagina.some((r) => r.id === detalleId)) {
      setReporteAparte(null)
      return
    }
    let vigente = true
    cargarReporte(detalleId)
      .then((r) => vigente && setReporteAparte(r))
      .catch((err) => console.error('Error al leer el reporte:', err))
    return () => {
      vigente = false
    }
  }, [autorizado, detalleId, pagina, lista.cargando])

  if (!cargando && !autorizado) {
    return <Navigate to="/" replace />
  }

  function nombreOperador(reporte: Reporte): string | null {
    return reporte.operadorId ? operadorPorId.get(reporte.operadorId)?.nombre ?? null : null
  }

  const reporteDetalle = detalleId
    ? pagina.find((r) => r.id === detalleId) ?? (reporteAparte?.id === detalleId ? reporteAparte : null)
    : null

  function cerrarDetalle() {
    setDetalleId(null)
    // Desde el detalle se pueden cambiar estados: la página se vuelve a leer.
    lista.recargar()
    if (params.has('reporte')) {
      const siguientes = new URLSearchParams(params)
      siguientes.delete('reporte')
      setParams(siguientes, { replace: true })
    }
  }

  function iniciarEdicion(reporte: Reporte) {
    setEditandoId(reporte.id)
    setEstadoNuevo(reporte.estado)
    setOperadorNuevo(reporte.operadorId ?? '')
    setComentario('')
    setErrorEdicion('')
  }

  // Estado y operador van en escrituras separadas: las reglas solo aceptan
  // un cambio de estado (rama de gestión) o de operadorId (rama de admin),
  // nunca ambos en la misma escritura.
  async function guardarEdicion(reporte: Reporte) {
    if (!user) {
      return
    }
    setGuardando(true)
    setErrorEdicion('')
    try {
      if (operadorNuevo !== (reporte.operadorId ?? '')) {
        await updateDoc(doc(db, 'reports', reporte.id), {
          operadorId: operadorNuevo || null,
          updatedAt: serverTimestamp(),
        })
      }
      if (estadoNuevo !== reporte.estado) {
        await cambiarEstadoReporte(reporte, estadoNuevo, comentario, {
          uid: user.uid,
          nombre: perfil?.displayName ?? null,
          rol: perfil?.role ?? null,
        })
      }
      setEditandoId(null)
      lista.recargar()
    } catch (err) {
      console.error('Error al guardar el reporte:', err)
      setErrorEdicion('No pudimos guardar los cambios. Inténtalo nuevamente.')
    } finally {
      setGuardando(false)
    }
  }

  async function eliminar(reporte: Reporte) {
    const aceptado = await confirmar({
      titulo: 'Eliminar reporte',
      mensaje: (
        <p>
          Se eliminará junto con su <strong>foto, confirmaciones e historial de estados</strong>.
          Desaparece del mapa y de la app del ciudadano. Esta acción no se puede deshacer.
        </p>
      ),
      confirmar: 'Eliminar',
      peligroso: true,
    })
    if (!aceptado) {
      return
    }
    setEliminandoId(reporte.id)
    setError('')
    try {
      await eliminarReporte(reporte)
      lista.recargar()
    } catch (err) {
      console.error('Error al eliminar el reporte:', err)
      setError('No pudimos eliminar el reporte. Inténtalo nuevamente.')
    } finally {
      setEliminandoId(null)
    }
  }

  async function exportarCsv() {
    setErrorExportar('')
    try {
      // Todos los que cumplen los filtros (no solo la página), por tandas de 500.
      setEstadoCsv('Descargando reportes…')
      const { reportes: todos, truncado } = await descargarTodosLosReportes(
        filtros,
        undefined,
        (descargados) => setEstadoCsv(`Descargando reportes… ${descargados.toLocaleString('es-CL')}`),
      )
      const aExportar = filtrarReportes(todos, soloFiltrosLocales(filtros))
      const csv = await construirCsvReportes(aExportar, {
        etiquetaCategoria: etiqueta,
        nombreOperador: (operadorId) =>
          operadorId ? operadorPorId.get(operadorId)?.nombre ?? operadorId : 'Sin asignar',
        onProgreso: (hechos, total) => setEstadoCsv(`Preparando CSV… ${hechos}/${total}`),
      })
      const sufijo = hayFiltrosActivos(filtros) ? '_filtrados' : ''
      descargarCsv(csv, `reportes_${fechaInput(new Date())}${sufijo}.csv`)
      if (truncado) {
        setErrorExportar(
          'El archivo incluye solo los 20.000 reportes más recientes. Acota con filtros para exportar el resto.',
        )
      }
    } catch (err) {
      console.error('Error al exportar el CSV:', err)
      setErrorExportar('No pudimos generar el CSV. Inténtalo nuevamente.')
    } finally {
      setEstadoCsv(null)
    }
  }

  // PENDIENTE DE ELIMINAR: herramienta de migración para reportes creados
  // antes de que la app asignara operador. Se quita cuando se implemente el
  // nuevo flujo de acceso por organismo y categoría (ver notas de
  // implementación futura).
  async function buscarPendientes() {
    setBuscandoPendientes(true)
    setVinculoError('')
    setVinculoAviso('')
    try {
      const sinOperador = await cargarReportesSinOperador()
      setPendientes(
        sinOperador.filter((r) => r.organismoId && operadorPorOrganismo.has(r.organismoId)),
      )
    } catch (err) {
      console.error('Error al buscar reportes sin operador:', err)
      setVinculoError('No pudimos buscar los reportes. Inténtalo nuevamente.')
    } finally {
      setBuscandoPendientes(false)
    }
  }

  async function vincularReportesExistentes() {
    setVinculando(true)
    setVinculoError('')
    setVinculoAviso('')
    try {
      let lote = writeBatch(db)
      let enLote = 0
      let vinculados = 0
      for (const reporte of pendientes ?? []) {
        const operador = reporte.organismoId ? operadorPorOrganismo.get(reporte.organismoId) : null
        if (!operador) {
          continue
        }
        lote.update(doc(db, 'reports', reporte.id), {
          operadorId: operador.id,
          updatedAt: serverTimestamp(),
        })
        enLote += 1
        vinculados += 1
        // Los batch de Firestore admiten hasta 500 escrituras.
        if (enLote === 400) {
          await lote.commit()
          lote = writeBatch(db)
          enLote = 0
        }
      }
      if (enLote > 0) {
        await lote.commit()
      }
      setVinculoAviso(`Se vincularon ${vinculados} reporte(s) con su operador.`)
      setPendientes(null)
      lista.recargar()
    } catch (err) {
      console.error('Error al vincular reportes con operadores:', err)
      setVinculoError('No pudimos vincular los reportes. Inténtalo nuevamente.')
    } finally {
      setVinculando(false)
    }
  }

  const renderPaginador = (conAviso: boolean) => (
    <Paginador
      pagina={lista.pagina}
      totalPaginas={lista.totalPaginas}
      total={lista.total}
      tamano={lista.tamano}
      enPagina={pagina.length}
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
    <>
      <main className={propios.main}>
        <div>
          <div className={styles.encabezadoAcciones}>
            <h1 className={styles.title}>Administrar reportes</h1>
            <Link to="/admin/reportes/nuevo" className={styles.botonCrear}>
              + Crear reporte
            </Link>
          </div>
        </div>

        <FiltrosReportes
          filtros={filtros}
          onChange={setFiltros}
          operadores={operadores}
          comunas={comunas}
          resumen={resumenListado(lista.total, pagina.length, reportesFiltrados.length, filtros)}
        />

        <div className={propios.barraExportar}>
          <button
            type="button"
            className={styles.editarBoton}
            onClick={exportarCsv}
            disabled={lista.cargando || lista.total === 0 || estadoCsv !== null}
          >
            {estadoCsv ?? `Exportar CSV (${lista.total === null ? '…' : lista.total.toLocaleString('es-CL')} reportes)`}
          </button>
          <span className={propios.estadoCarga}>
            Incluye todos los reportes que cumplen los filtros, no solo esta página; sin imágenes.
          </span>
          <span className={propios.barraEspacio} />
          <CasillaTodos
            total={reportesFiltrados.length}
            todos={seleccion.todos}
            algunos={seleccion.algunos}
            onAlternar={seleccion.alternarTodos}
          />
        </div>
        {mensajeLote && (
          <p
            className={`${propios.mensajeLote} ${mensajeLote.tipo === 'error' ? propios.mensajeError : propios.mensajeAviso}`}
            role="status"
          >
            {mensajeLote.texto}
          </p>
        )}
        {errorExportar && <p className={styles.error}>{errorExportar}</p>}

        {error && <p className={styles.error}>{error}</p>}
        {lista.error && (
          <p className={styles.error}>
            {lista.error.mensaje}{' '}
            {lista.error.enlaceIndice && (
              <a href={lista.error.enlaceIndice} target="_blank" rel="noreferrer" className={styles.footerLink}>
                Crear el índice
              </a>
            )}
          </p>
        )}

        {renderPaginador(true)}
        {lista.cargando && pagina.length === 0 && !lista.error && (
          <p className={propios.estadoCarga}>Cargando reportes…</p>
        )}
        {!lista.cargando && reportesFiltrados.length === 0 && !lista.error && (
          <p className={propios.estadoCarga}>
            {hayFiltrosActivos(filtros)
              ? 'Ningún reporte de esta página coincide con los filtros.'
              : 'No hay reportes para mostrar.'}
          </p>
        )}

        <div className={propios.grid} style={{ opacity: lista.cargando && pagina.length > 0 ? 0.6 : 1 }}>
          {reportesFiltrados.map((reporte) => {
            const editando = editandoId === reporte.id
            const siguientes = TRANSICIONES[reporte.estado] ?? []

            return (
              <TarjetaReporte
                key={reporte.id}
                reporte={reporte}
                operadorNombre={nombreOperador(reporte)}
                seleccionado={seleccion.estaSeleccionado(reporte.id)}
                onAlternarSeleccion={() => seleccion.alternar(reporte.id)}
              >
                {editando ? (
                  <div className={propios.edicion}>
                    <label className={styles.field}>
                      <span className={styles.label}>Estado</span>
                      <select
                        className={styles.input}
                        value={estadoNuevo}
                        onChange={(e) => setEstadoNuevo(e.target.value)}
                      >
                        <option value={reporte.estado}>
                          {ETIQUETA_POR_ESTADO[reporte.estado] ?? reporte.estado} (actual)
                        </option>
                        {siguientes.map((estado) => (
                          <option key={estado} value={estado}>
                            {ETIQUETA_POR_ESTADO[estado] ?? estado}
                          </option>
                        ))}
                      </select>
                    </label>

                    {estadoNuevo !== reporte.estado && (
                      <label className={styles.field}>
                        <span className={styles.label}>Comentario (opcional)</span>
                        <input
                          type="text"
                          className={styles.input}
                          value={comentario}
                          maxLength={512}
                          onChange={(e) => setComentario(e.target.value)}
                        />
                      </label>
                    )}

                    <label className={styles.field}>
                      <span className={styles.label}>Operador asignado</span>
                      <select
                        className={styles.input}
                        value={operadorNuevo}
                        onChange={(e) => setOperadorNuevo(e.target.value)}
                      >
                        <option value="">Sin asignar</option>
                        {operadores.map((op) => (
                          <option key={op.id} value={op.id}>
                            {op.nombre}
                            {op.activo ? '' : ' (inactivo)'}
                          </option>
                        ))}
                      </select>
                    </label>

                    {errorEdicion && <p className={styles.error}>{errorEdicion}</p>}

                    <div className={propios.acciones}>
                      <button
                        type="button"
                        className={styles.editarBoton}
                        onClick={() => guardarEdicion(reporte)}
                        disabled={guardando}
                      >
                        {guardando ? 'Guardando…' : 'Guardar'}
                      </button>
                      <button
                        type="button"
                        className={styles.cancelar}
                        onClick={() => setEditandoId(null)}
                        disabled={guardando}
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className={propios.acciones}>
                    <button
                      type="button"
                      className={styles.editarBoton}
                      onClick={() => setDetalleId(reporte.id)}
                    >
                      Ver detalle
                    </button>
                    <button
                      type="button"
                      className={styles.editarBoton}
                      onClick={() => iniciarEdicion(reporte)}
                      disabled={eliminandoId === reporte.id}
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      className={propios.eliminarBoton}
                      onClick={() => eliminar(reporte)}
                      disabled={eliminandoId === reporte.id}
                    >
                      {eliminandoId === reporte.id ? 'Eliminando…' : 'Eliminar'}
                    </button>
                  </div>
                )}
              </TarjetaReporte>
            )
          })}
        </div>

        {pagina.length > 0 && renderPaginador(false)}

        <BarraSeleccion
          seleccionados={seleccion.seleccionados}
          autor={
            user ? { uid: user.uid, nombre: perfil?.displayName ?? null, rol: perfil?.role ?? null } : null
          }
          onLimpiar={seleccion.limpiar}
          onResultado={(mensaje) => {
            setMensajeLote(mensaje)
            lista.recargar()
          }}
          operadores={operadores}
          permitirEliminar
        />

        <section className={styles.card}>
          <h2 className={styles.cardTitle}>Vincular reportes existentes a un operador</h2>
          <p className={styles.subtitle}>
            Asigna operador a los reportes que todavía no tienen uno, cuando su Organismo ID
            coincide con el organismo responsable de un operador activo. No modifica los reportes
            que ya tienen operador.
          </p>
          {vinculoError && <p className={styles.error}>{vinculoError}</p>}
          {vinculoAviso && <p className={styles.aviso}>{vinculoAviso}</p>}
          {pendientes === null ? (
            <button
              type="button"
              className={`${styles.submit} ${propios.vincularBoton}`}
              onClick={buscarPendientes}
              disabled={buscandoPendientes}
            >
              {buscandoPendientes ? 'Buscando…' : 'Buscar reportes sin operador'}
            </button>
          ) : pendientes.length > 0 ? (
            <button
              type="button"
              className={`${styles.submit} ${propios.vincularBoton}`}
              onClick={vincularReportesExistentes}
              disabled={vinculando}
            >
              {vinculando ? 'Vinculando…' : `Vincular ${pendientes.length} reporte(s)`}
            </button>
          ) : (
            <p className={propios.estadoCarga}>
              No hay reportes pendientes: ninguno de los sin operador tiene un Organismo ID que
              corresponda a un operador activo.
            </p>
          )}
        </section>
      </main>

      {reporteDetalle && (
        <DetalleReporte
          reporte={reporteDetalle}
          operadorNombre={nombreOperador(reporteDetalle)}
          onCerrar={cerrarDetalle}
          gestionable
        />
      )}
      {dialogo}
    </>
  )
}
