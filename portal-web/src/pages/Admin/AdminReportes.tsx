import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  serverTimestamp,
  updateDoc,
  writeBatch,
} from 'firebase/firestore'
import { db } from '../../firebase/config'
import { useAuth } from '../../context/AuthContext'
import { useRequiereAdmin } from '../../hooks/useRequiereAdmin'
import Navbar from '../../components/Navbar/Navbar'
import TarjetaReporte from '../../components/Reportes/TarjetaReporte'
import DetalleReporte from '../../components/Reportes/DetalleReporte'
import FiltrosReportes from '../../components/Reportes/FiltrosReportes'
import { FILTROS_VACIOS, filtrarReportes, hayFiltrosActivos } from '../../components/Reportes/filtros'
import type { Filtros } from '../../components/Reportes/filtros'
import { cambiarEstadoReporte, mapearReporte } from '../../components/Reportes/reporte'
import type { OperadorResumen, Reporte } from '../../components/Reportes/reporte'
import { construirCsvReportes, descargarCsv } from '../../components/Reportes/exportar'
import { fechaInput } from '../../components/Reportes/rangosRapidos'
import { useCategorias } from '../../context/CategoriasContext'
import { ETIQUETA_POR_ESTADO, TRANSICIONES } from '../../constants/reportes'
import styles from './Admin.module.css'
import propios from '../../components/Reportes/Reportes.module.css'

export default function AdminReportes() {
  const { cargando, autorizado } = useRequiereAdmin()
  const { user, perfil } = useAuth()

  const [reportes, setReportes] = useState<Reporte[]>([])
  const [cargandoReportes, setCargandoReportes] = useState(true)
  const [operadores, setOperadores] = useState<OperadorResumen[]>([])
  const [error, setError] = useState('')
  const [filtros, setFiltros] = useState<Filtros>(FILTROS_VACIOS)

  const [detalleId, setDetalleId] = useState<string | null>(null)

  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [estadoNuevo, setEstadoNuevo] = useState('')
  const [operadorNuevo, setOperadorNuevo] = useState('')
  const [comentario, setComentario] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [errorEdicion, setErrorEdicion] = useState('')

  const [eliminandoId, setEliminandoId] = useState<string | null>(null)

  const { etiqueta } = useCategorias()
  const [progresoCsv, setProgresoCsv] = useState<{ hechos: number; total: number } | null>(null)
  const [errorExportar, setErrorExportar] = useState('')

  const [vinculando, setVinculando] = useState(false)
  const [vinculoError, setVinculoError] = useState('')
  const [vinculoAviso, setVinculoAviso] = useState('')

  useEffect(() => {
    if (!autorizado) {
      return
    }
    const unsubscribe = onSnapshot(
      collection(db, 'reports'),
      (snapshot) => {
        const lista = snapshot.docs.map(mapearReporte)
        lista.sort((a, b) => (b.fecha?.getTime() ?? 0) - (a.fecha?.getTime() ?? 0))
        setReportes(lista)
        setCargandoReportes(false)
        setError('')
      },
      (err) => {
        console.error('Error al leer reportes:', err)
        setError('No pudimos cargar los reportes. Inténtalo nuevamente.')
        setCargandoReportes(false)
      },
    )
    return unsubscribe
  }, [autorizado])

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

  const reportesFiltrados = useMemo(() => filtrarReportes(reportes, filtros), [reportes, filtros])

  const pendientesDeVincular = useMemo(
    () =>
      reportes.filter(
        (r) => !r.operadorId && r.organismoId && operadorPorOrganismo.has(r.organismoId),
      ),
    [reportes, operadorPorOrganismo],
  )

  if (!cargando && !autorizado) {
    return <Navigate to="/" replace />
  }

  function nombreOperador(reporte: Reporte): string | null {
    return reporte.operadorId ? operadorPorId.get(reporte.operadorId)?.nombre ?? null : null
  }

  const reporteDetalle = detalleId ? reportes.find((r) => r.id === detalleId) ?? null : null

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
    } catch (err) {
      console.error('Error al guardar el reporte:', err)
      setErrorEdicion('No pudimos guardar los cambios. Inténtalo nuevamente.')
    } finally {
      setGuardando(false)
    }
  }

  async function eliminarReporte(reporte: Reporte) {
    const confirmado = window.confirm(
      'Se eliminará el reporte junto con su foto, confirmaciones e historial de estados. Esta acción no se puede deshacer. ¿Continuar?',
    )
    if (!confirmado) {
      return
    }
    setEliminandoId(reporte.id)
    setError('')
    const reporteRef = doc(db, 'reports', reporte.id)
    try {
      const [confirmaciones, historial] = await Promise.all([
        getDocs(collection(reporteRef, 'confirmations')),
        getDocs(collection(reporteRef, 'statusHistory')),
      ])
      const lote = writeBatch(db)
      confirmaciones.forEach((d) => lote.delete(d.ref))
      historial.forEach((d) => lote.delete(d.ref))
      if (reporte.foto?.tipo === 'firestore') {
        lote.delete(doc(db, reporte.foto.path))
      }
      lote.delete(reporteRef)
      await lote.commit()
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
      const csv = await construirCsvReportes(reportesFiltrados, {
        etiquetaCategoria: etiqueta,
        nombreOperador: (operadorId) =>
          operadorId ? operadorPorId.get(operadorId)?.nombre ?? operadorId : 'Sin asignar',
        onProgreso: (hechos, total) => setProgresoCsv({ hechos, total }),
      })
      const sufijo = hayFiltrosActivos(filtros) ? '_filtrados' : ''
      descargarCsv(csv, `reportes_${fechaInput(new Date())}${sufijo}.csv`)
    } catch (err) {
      console.error('Error al exportar el CSV:', err)
      setErrorExportar('No pudimos generar el CSV. Inténtalo nuevamente.')
    } finally {
      setProgresoCsv(null)
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
      for (const reporte of pendientesDeVincular) {
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
    } catch (err) {
      console.error('Error al vincular reportes con operadores:', err)
      setVinculoError('No pudimos vincular los reportes. Inténtalo nuevamente.')
    } finally {
      setVinculando(false)
    }
  }

  return (
    <div className={styles.page}>
      <Navbar />

      <main className={propios.main}>
        <div>
          <Link to="/admin" className={styles.volver}>
            ← Panel de administración
          </Link>
          <h1 className={styles.title}>Administrar reportes</h1>
        </div>

        <FiltrosReportes
          filtros={filtros}
          onChange={setFiltros}
          operadores={operadores}
          visibles={reportesFiltrados.length}
          total={reportes.length}
        />

        <div className={propios.barraExportar}>
          <button
            type="button"
            className={styles.editarBoton}
            onClick={exportarCsv}
            disabled={cargandoReportes || reportesFiltrados.length === 0 || progresoCsv !== null}
          >
            {progresoCsv
              ? `Preparando CSV… ${progresoCsv.hechos}/${progresoCsv.total}`
              : `Exportar CSV (${reportesFiltrados.length} reportes)`}
          </button>
          <span className={propios.estadoCarga}>
            Incluye los reportes que cumplen los filtros actuales, sin imágenes.
          </span>
        </div>
        {errorExportar && <p className={styles.error}>{errorExportar}</p>}

        {error && <p className={styles.error}>{error}</p>}
        {cargandoReportes && <p className={propios.estadoCarga}>Cargando reportes…</p>}
        {!cargandoReportes && reportesFiltrados.length === 0 && !error && (
          <p className={propios.estadoCarga}>
            {hayFiltrosActivos(filtros)
              ? 'Ningún reporte coincide con los filtros.'
              : 'No hay reportes para mostrar.'}
          </p>
        )}

        <div className={propios.grid}>
          {reportesFiltrados.map((reporte) => {
            const editando = editandoId === reporte.id
            const siguientes = TRANSICIONES[reporte.estado] ?? []

            return (
              <TarjetaReporte
                key={reporte.id}
                reporte={reporte}
                operadorNombre={nombreOperador(reporte)}
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
                      onClick={() => eliminarReporte(reporte)}
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

        <section className={styles.card}>
          <h2 className={styles.cardTitle}>Vincular reportes existentes a un operador</h2>
          <p className={styles.subtitle}>
            Asigna operador a los reportes que todavía no tienen uno, cuando su Organismo ID
            coincide con el organismo responsable de un operador activo. No modifica los reportes
            que ya tienen operador.
          </p>
          {vinculoError && <p className={styles.error}>{vinculoError}</p>}
          {vinculoAviso && <p className={styles.aviso}>{vinculoAviso}</p>}
          {pendientesDeVincular.length > 0 ? (
            <button
              type="button"
              className={`${styles.submit} ${propios.vincularBoton}`}
              onClick={vincularReportesExistentes}
              disabled={vinculando}
            >
              {vinculando ? 'Vinculando…' : `Vincular ${pendientesDeVincular.length} reporte(s)`}
            </button>
          ) : (
            !cargandoReportes && (
              <p className={propios.estadoCarga}>
                No hay reportes pendientes: ninguno sin operador tiene un Organismo ID que
                corresponda a un operador activo.
              </p>
            )
          )}
        </section>
      </main>

      {reporteDetalle && (
        <DetalleReporte
          reporte={reporteDetalle}
          operadorNombre={nombreOperador(reporteDetalle)}
          onCerrar={() => setDetalleId(null)}
          gestionable
        />
      )}
    </div>
  )
}
