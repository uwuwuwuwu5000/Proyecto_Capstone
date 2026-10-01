import { useEffect, useMemo, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { db } from '../../firebase/config'
import { useRequiereOperador } from '../../hooks/useRequiereOperador'
import Navbar from '../../components/Navbar/Navbar'
import OperadorTabs from './OperadorTabs'
import GraficoColumnas from '../../components/Graficos/GraficoColumnas'
import GraficoBarras from '../../components/Graficos/GraficoBarras'
import type { FilaBarra } from '../../components/Graficos/GraficoBarras'
import DetalleReporte from '../../components/Reportes/DetalleReporte'
import { EstadoPildora } from '../../components/Reportes/TarjetaReporte'
import { formatearFecha, mapearReporte } from '../../components/Reportes/reporte'
import type { Reporte } from '../../components/Reportes/reporte'
import {
  ESTADOS_FINALIZADOS,
  calcularTiempos,
  formatearDuracion,
  mediana,
  promedio,
} from '../../components/Reportes/tiempos'
import { COLOR_POR_ESTADO, ESTADOS_EN_ORDEN, ETIQUETA_POR_ESTADO } from '../../constants/reportes'
import { useCategorias } from '../../context/CategoriasContext'
import { useHistoriales } from '../../hooks/useHistoriales'
import {
  construirCsvReportes,
  descargarCsv,
  paraNombreArchivo,
} from '../../components/Reportes/exportar'
import { fechaInput } from '../../components/Reportes/rangosRapidos'
import {
  NOMBRE_GRANULARIDAD,
  PERIODOS,
  construirSerie,
  describirRango,
  estaEnRango,
  rangoDePeriodo,
} from './periodos'
import type { Periodo } from './periodos'
import comun from '../../components/Reportes/Reportes.module.css'
import styles from './OperadorEstadisticas.module.css'

function porcentaje(parte: number, total: number): string {
  return total > 0 ? `${Math.round((parte / total) * 100)}% del total` : '—'
}

export default function OperadorEstadisticas() {
  const { cargando, autorizado, operadorId, operadorNombre } = useRequiereOperador()
  const { etiqueta } = useCategorias()

  const [reportes, setReportes] = useState<Reporte[]>([])
  const [cargandoReportes, setCargandoReportes] = useState(true)
  const [error, setError] = useState('')

  const [periodo, setPeriodo] = useState<Periodo>('mes')
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [detalleId, setDetalleId] = useState<string | null>(null)
  const [progresoCsv, setProgresoCsv] = useState<{ hechos: number; total: number } | null>(null)
  const [errorExportar, setErrorExportar] = useState('')

  useEffect(() => {
    if (!autorizado || !operadorId) {
      return
    }
    const unsubscribe = onSnapshot(
      query(collection(db, 'reports'), where('operadorId', '==', operadorId)),
      (snapshot) => {
        setReportes(snapshot.docs.map(mapearReporte))
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

  const rango = useMemo(() => rangoDePeriodo(periodo, desde, hasta), [periodo, desde, hasta])

  const enPeriodo = useMemo(
    () =>
      reportes
        .filter((r) => estaEnRango(r, rango))
        .sort((a, b) => (b.fecha?.getTime() ?? 0) - (a.fecha?.getTime() ?? 0)),
    [reportes, rango],
  )

  const estadisticas = useMemo(() => {
    const autores = new Map<string, { nombre: string; cantidad: number }>()
    let finalizados = 0
    const porEstado: Record<string, number> = {}
    const porCategoria: Record<string, number> = {}

    for (const r of enPeriodo) {
      if (ESTADOS_FINALIZADOS.has(r.estado)) finalizados += 1
      porEstado[r.estado] = (porEstado[r.estado] ?? 0) + 1
      porCategoria[r.categoria] = (porCategoria[r.categoria] ?? 0) + 1
      const claveAutor = r.uid || r.autorNombre || 'desconocido'
      const autor = autores.get(claveAutor)
      if (autor) {
        autor.cantidad += 1
      } else {
        autores.set(claveAutor, { nombre: r.autorNombre ?? 'Usuario sin nombre', cantidad: 1 })
      }
    }

    const filasEstado: FilaBarra[] = ESTADOS_EN_ORDEN.map((estado) => ({
      clave: estado,
      etiqueta: ETIQUETA_POR_ESTADO[estado],
      valor: porEstado[estado] ?? 0,
      colorIdentidad: COLOR_POR_ESTADO[estado],
    }))

    const filasCategoria: FilaBarra[] = Object.entries(porCategoria)
      .map(([categoria, valor]) => ({
        clave: categoria,
        etiqueta: etiqueta(categoria),
        valor,
      }))
      .sort((a, b) => b.valor - a.valor)

    const topAutores = Array.from(autores.entries())
      .map(([clave, datos]) => ({ clave, ...datos }))
      .sort((a, b) => b.cantidad - a.cantidad)
      .slice(0, 5)

    return {
      total: enPeriodo.length,
      usuarios: autores.size,
      finalizados,
      sinResolver: enPeriodo.length - finalizados,
      filasEstado,
      filasCategoria,
      topAutores,
    }
  }, [enPeriodo, etiqueta])

  const serie = useMemo(() => construirSerie(enPeriodo, rango), [enPeriodo, rango])

  const {
    historiales,
    cargando: calculandoTiempos,
    error: errorTiempos,
  } = useHistoriales(enPeriodo)

  const tiempos = useMemo(() => {
    const primeras: number[] = []
    const resoluciones: number[] = []
    const porCategoria = new Map<
      string,
      { total: number; primeras: number[]; resoluciones: number[] }
    >()
    let sinRegistro = 0

    for (const r of enPeriodo) {
      const cambios = historiales.get(r.id)
      if (!cambios) {
        continue // su historial todavía no llega
      }
      const categoria = porCategoria.get(r.categoria) ?? { total: 0, primeras: [], resoluciones: [] }
      categoria.total += 1
      porCategoria.set(r.categoria, categoria)

      // Cambió de estado sin dejar registro: no hay cómo medirlo.
      if (r.estado !== 'reportado' && cambios.length === 0) {
        sinRegistro += 1
        continue
      }
      const { primeraAtencionMs, resolucionMs } = calcularTiempos(r, cambios)
      if (primeraAtencionMs !== null) {
        primeras.push(primeraAtencionMs)
        categoria.primeras.push(primeraAtencionMs)
      }
      if (resolucionMs !== null) {
        resoluciones.push(resolucionMs)
        categoria.resoluciones.push(resolucionMs)
      }
    }

    const filasCategoria = Array.from(porCategoria, ([id, datos]) => ({
      id,
      nombre: etiqueta(id),
      total: datos.total,
      primeraAtencion: mediana(datos.primeras),
      resolucion: mediana(datos.resoluciones),
    })).sort((a, b) => b.total - a.total)

    return {
      medianaPrimera: mediana(primeras),
      promedioPrimera: promedio(primeras),
      atendidos: primeras.length,
      medianaResolucion: mediana(resoluciones),
      promedioResolucion: promedio(resoluciones),
      resueltos: resoluciones.length,
      sinRegistro,
      filasCategoria,
    }
  }, [enPeriodo, historiales, etiqueta])

  if (!cargando && !autorizado) {
    return <Navigate to="/" replace />
  }

  const reporteDetalle = detalleId ? reportes.find((r) => r.id === detalleId) ?? null : null
  const ultimos = enPeriodo.slice(0, 8)
  const cargandoTodo = cargando || cargandoReportes
  const sinAtender = enPeriodo.filter((r) => r.estado === 'reportado').length
  const ahora = Date.now()
  const abiertosAntiguos = enPeriodo
    .filter((r): r is Reporte & { fecha: Date } => !ESTADOS_FINALIZADOS.has(r.estado) && r.fecha !== null)
    .sort((a, b) => a.fecha.getTime() - b.fecha.getTime())
    .slice(0, 5)
  const primeraVez = calculandoTiempos && tiempos.atendidos === 0 && tiempos.resueltos === 0

  // Partes del nombre de archivo: operador y rango (yyyy-mm-dd).
  const nombreBase = paraNombreArchivo(operadorNombre ?? operadorId ?? 'operador')
  const rangoArchivo =
    !rango.inicio && !rango.fin
      ? 'todo'
      : `${rango.inicio ? fechaInput(rango.inicio) : 'inicio'}_${fechaInput(rango.fin ?? new Date())}`

  async function exportarCsv() {
    setErrorExportar('')
    try {
      const csv = await construirCsvReportes(enPeriodo, {
        etiquetaCategoria: etiqueta,
        nombreOperador: () => operadorNombre ?? operadorId ?? '',
        historiales,
        onProgreso: (hechos, total) => setProgresoCsv({ hechos, total }),
      })
      descargarCsv(csv, `reportes_${nombreBase}_${rangoArchivo}.csv`)
    } catch (err) {
      console.error('Error al exportar el CSV:', err)
      setErrorExportar('No pudimos generar el CSV. Inténtalo nuevamente.')
    } finally {
      setProgresoCsv(null)
    }
  }

  // El navegador propone el título de la página como nombre del PDF.
  function exportarPdf() {
    const tituloOriginal = document.title
    document.title = `estadisticas_${nombreBase}_${rangoArchivo}`
    const restaurar = () => {
      document.title = tituloOriginal
    }
    window.addEventListener('afterprint', restaurar, { once: true })
    window.print()
  }

  return (
    <div className={styles.page}>
      <Navbar />
      <OperadorTabs />

      <main className={comun.main}>
        <div>
          <h1 className={styles.titulo}>Estadísticas</h1>
          <p className={styles.subtitulo}>
            Reportes asignados a {operadorNombre ?? 'tu operador'} · {describirRango(rango)}
          </p>
          <p className={`solo-impresion ${styles.subtitulo}`}>
            Generado el {new Date().toLocaleString('es-CL', { dateStyle: 'long', timeStyle: 'short' })}
          </p>
        </div>

        <div className={styles.filtros} role="group" aria-label="Periodo" data-no-imprimir>
          <div className={styles.periodos}>
            {PERIODOS.map(({ clave, etiqueta }) => (
              <button
                key={clave}
                type="button"
                className={`${styles.periodo} ${periodo === clave ? styles.periodoActivo : ''}`}
                aria-pressed={periodo === clave}
                onClick={() => setPeriodo(clave)}
              >
                {etiqueta}
              </button>
            ))}
          </div>
          {periodo === 'personalizado' && (
            <div className={styles.fechas}>
              <label className={comun.campo}>
                <span className={comun.etiqueta}>Desde</span>
                <input
                  type="date"
                  className={comun.entrada}
                  value={desde}
                  max={hasta || undefined}
                  onChange={(e) => setDesde(e.target.value)}
                />
              </label>
              <label className={comun.campo}>
                <span className={comun.etiqueta}>Hasta</span>
                <input
                  type="date"
                  className={comun.entrada}
                  value={hasta}
                  min={desde || undefined}
                  onChange={(e) => setHasta(e.target.value)}
                />
              </label>
            </div>
          )}
          <div className={styles.exportar}>
            <button
              type="button"
              className={comun.accionBoton}
              onClick={exportarCsv}
              disabled={cargandoTodo || enPeriodo.length === 0 || progresoCsv !== null}
              title="Listado de los reportes del periodo, sin imágenes"
            >
              {progresoCsv
                ? `Preparando CSV… ${progresoCsv.hechos}/${progresoCsv.total}`
                : 'Exportar CSV'}
            </button>
            <button
              type="button"
              className={comun.accionBoton}
              onClick={exportarPdf}
              disabled={cargandoTodo || primeraVez}
              title="Se abre el diálogo de impresión: elige «Guardar como PDF»"
            >
              Exportar PDF
            </button>
          </div>
        </div>
        {errorExportar && <p className={comun.errorTexto}>{errorExportar}</p>}

        {error && <p className={comun.errorTexto}>{error}</p>}
        {cargandoTodo && !error && <p className={comun.estadoCarga}>Cargando estadísticas…</p>}

        {!cargandoTodo && !error && (
          <>
            <section className={styles.kpis} aria-label="Resumen">
              <div className={styles.kpi}>
                <span className={styles.kpiEtiqueta}>Reportes</span>
                <span className={styles.kpiValor}>{estadisticas.total.toLocaleString('es-CL')}</span>
                <span className={styles.kpiNota}>en el periodo</span>
              </div>
              <div className={styles.kpi}>
                <span className={styles.kpiEtiqueta}>Usuarios que reportan</span>
                <span className={styles.kpiValor}>
                  {estadisticas.usuarios.toLocaleString('es-CL')}
                </span>
                <span className={styles.kpiNota}>autores distintos</span>
              </div>
              <div className={styles.kpi}>
                <span className={styles.kpiEtiqueta}>Sin resolver</span>
                <span className={styles.kpiValor}>
                  {estadisticas.sinResolver.toLocaleString('es-CL')}
                </span>
                <span className={styles.kpiNota}>
                  {porcentaje(estadisticas.sinResolver, estadisticas.total)}
                </span>
              </div>
              <div className={styles.kpi}>
                <span className={styles.kpiEtiqueta}>Resueltos o cerrados</span>
                <span className={styles.kpiValor}>
                  {estadisticas.finalizados.toLocaleString('es-CL')}
                </span>
                <span className={styles.kpiNota}>
                  {porcentaje(estadisticas.finalizados, estadisticas.total)}
                </span>
              </div>
            </section>

            {estadisticas.total === 0 ? (
              <p className={comun.estadoCarga}>No hay reportes asignados en este periodo.</p>
            ) : (
              <>
                <section className={styles.tarjeta}>
                  <h2 className={styles.tarjetaTitulo}>
                    Reportes {NOMBRE_GRANULARIDAD[serie.granularidad]}
                  </h2>
                  <GraficoColumnas datos={serie.puntos} medida="Reportes" />
                </section>

                <section
                  className={`${styles.seccion} ${calculandoTiempos && !primeraVez ? styles.recalculando : ''}`}
                  aria-labelledby="tiempo-respuesta-titulo"
                  aria-busy={calculandoTiempos}
                >
                  <div>
                    <h2 id="tiempo-respuesta-titulo" className={styles.seccionTitulo}>
                      Tiempo de respuesta
                    </h2>
                    <p className={styles.seccionNota}>
                      Mediana: la mitad de los reportes se atendió (o resolvió) en menos de ese
                      tiempo. Se mide desde que el ciudadano creó el reporte.
                    </p>
                  </div>

                  {errorTiempos && <p className={comun.errorTexto}>{errorTiempos}</p>}

                  <div className={styles.kpis}>
                    <div className={styles.kpi}>
                      <span className={styles.kpiEtiqueta}>Primera atención</span>
                      <span className={styles.kpiValor}>
                        {primeraVez
                          ? '…'
                          : tiempos.medianaPrimera !== null
                            ? formatearDuracion(tiempos.medianaPrimera)
                            : '—'}
                      </span>
                      <span className={styles.kpiNota}>
                        {tiempos.promedioPrimera !== null
                          ? `Promedio ${formatearDuracion(tiempos.promedioPrimera)} · ${tiempos.atendidos} atendidos`
                          : 'Aún no hay reportes atendidos'}
                        {sinAtender > 0 && ` · ${sinAtender} sin atender`}
                      </span>
                    </div>
                    <div className={styles.kpi}>
                      <span className={styles.kpiEtiqueta}>Hasta resolver o cerrar</span>
                      <span className={styles.kpiValor}>
                        {primeraVez
                          ? '…'
                          : tiempos.medianaResolucion !== null
                            ? formatearDuracion(tiempos.medianaResolucion)
                            : '—'}
                      </span>
                      <span className={styles.kpiNota}>
                        {tiempos.promedioResolucion !== null
                          ? `Promedio ${formatearDuracion(tiempos.promedioResolucion)} · ${tiempos.resueltos} finalizados`
                          : 'Aún no hay reportes finalizados'}
                      </span>
                    </div>
                    <div className={styles.kpi}>
                      <span className={styles.kpiEtiqueta}>Abierto más antiguo</span>
                      <span className={styles.kpiValor}>
                        {abiertosAntiguos[0]
                          ? formatearDuracion(ahora - abiertosAntiguos[0].fecha.getTime())
                          : '—'}
                      </span>
                      <span className={styles.kpiNota}>
                        {abiertosAntiguos[0]
                          ? `${etiqueta(abiertosAntiguos[0].categoria)} · ${
                              ETIQUETA_POR_ESTADO[abiertosAntiguos[0].estado] ??
                              abiertosAntiguos[0].estado
                            }`
                          : 'No hay reportes abiertos'}
                      </span>
                    </div>
                  </div>

                  <div className={styles.dosColumnasAncha}>
                    <section className={styles.tarjeta}>
                      <h3 className={styles.tarjetaTitulo}>Por categoría (mediana)</h3>
                      <div className={styles.tablaScroll}>
                        <table className={styles.tabla}>
                          <thead>
                            <tr>
                              <th scope="col">Categoría</th>
                              <th scope="col" className={styles.numero}>
                                Reportes
                              </th>
                              <th scope="col" className={styles.numero}>
                                Primera atención
                              </th>
                              <th scope="col" className={styles.numero}>
                                Hasta resolver o cerrar
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {tiempos.filasCategoria.map((fila) => (
                              <tr key={fila.id}>
                                <td>{fila.nombre}</td>
                                <td className={styles.numero}>{fila.total}</td>
                                <td className={styles.numero}>
                                  {fila.primeraAtencion !== null
                                    ? formatearDuracion(fila.primeraAtencion)
                                    : '—'}
                                </td>
                                <td className={styles.numero}>
                                  {fila.resolucion !== null ? formatearDuracion(fila.resolucion) : '—'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <p className={styles.tablaNota}>
                        "—": todavía no hay reportes de esa categoría atendidos o finalizados.
                        {tiempos.sinRegistro > 0 &&
                          ` Se excluyen ${tiempos.sinRegistro} reporte(s) que cambiaron de estado sin quedar registrados en el historial.`}
                      </p>
                    </section>

                    <section className={styles.tarjeta}>
                      <h3 className={styles.tarjetaTitulo}>Abiertos más antiguos</h3>
                      {abiertosAntiguos.length === 0 ? (
                        <p className={comun.estadoCarga}>No hay reportes abiertos en el periodo.</p>
                      ) : (
                        <ol className={styles.ranking}>
                          {abiertosAntiguos.map((r) => (
                            <li key={r.id}>
                              <button
                                type="button"
                                className={styles.enlaceFila}
                                onClick={() => setDetalleId(r.id)}
                              >
                                {etiqueta(r.categoria)}
                              </button>
                              <span className={styles.rankingValor}>
                                {formatearDuracion(ahora - r.fecha.getTime())}
                              </span>
                            </li>
                          ))}
                        </ol>
                      )}
                    </section>
                  </div>
                </section>

                <div className={styles.dosColumnas}>
                  <section className={styles.tarjeta}>
                    <h2 className={styles.tarjetaTitulo}>Por estado</h2>
                    <GraficoBarras filas={estadisticas.filasEstado} total={estadisticas.total} />
                  </section>
                  <section className={styles.tarjeta}>
                    <h2 className={styles.tarjetaTitulo}>Por categoría</h2>
                    <GraficoBarras filas={estadisticas.filasCategoria} total={estadisticas.total} />
                  </section>
                </div>

                <div className={styles.dosColumnasAncha}>
                  <section className={styles.tarjeta}>
                    <h2 className={styles.tarjetaTitulo}>Últimos reportes</h2>
                    <div className={styles.tablaScroll}>
                      <table className={styles.tabla}>
                        <thead>
                          <tr>
                            <th scope="col">Fecha y hora</th>
                            <th scope="col">Categoría</th>
                            <th scope="col">Autor</th>
                            <th scope="col">Estado</th>
                            <th scope="col" data-no-imprimir>
                              <span className={styles.soloLector}>Acciones</span>
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {ultimos.map((r) => (
                            <tr key={r.id}>
                              <td className={styles.nowrap}>{formatearFecha(r.fecha, true)}</td>
                              <td>{etiqueta(r.categoria)}</td>
                              <td>{r.autorNombre ?? 'Sin nombre'}</td>
                              <td>
                                <EstadoPildora estado={r.estado} />
                              </td>
                              <td data-no-imprimir>
                                <button
                                  type="button"
                                  className={comun.accionBoton}
                                  onClick={() => setDetalleId(r.id)}
                                >
                                  Ver
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>

                  <section className={styles.tarjeta}>
                    <h2 className={styles.tarjetaTitulo}>Usuarios que más reportan</h2>
                    <ol className={styles.ranking}>
                      {estadisticas.topAutores.map((autor) => (
                        <li key={autor.clave}>
                          <span className={styles.rankingNombre}>{autor.nombre}</span>
                          <span className={styles.rankingValor}>
                            {autor.cantidad} {autor.cantidad === 1 ? 'reporte' : 'reportes'}
                          </span>
                        </li>
                      ))}
                    </ol>
                  </section>
                </div>
              </>
            )}
          </>
        )}
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
