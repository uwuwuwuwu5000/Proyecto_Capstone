import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { collection, onSnapshot } from 'firebase/firestore'
import { db } from '../../firebase/config'
import { useRequiereAdmin } from '../../hooks/useRequiereAdmin'
import GraficoColumnas from '../../components/Graficos/GraficoColumnas'
import GraficoBarras from '../../components/Graficos/GraficoBarras'
import type { FilaBarra } from '../../components/Graficos/GraficoBarras'
import DetalleReporte from '../../components/Reportes/DetalleReporte'
import { EstadoPildora } from '../../components/Reportes/TarjetaReporte'
import { mapearReporte } from '../../components/Reportes/reporte'
import type { Reporte } from '../../components/Reportes/reporte'
import {
  ESTADOS_FINALIZADOS,
  calcularTiempos,
  formatearDuracion,
  mediana,
} from '../../components/Reportes/tiempos'
import { COLOR_POR_ESTADO, ESTADOS_EN_ORDEN, ETIQUETA_POR_ESTADO } from '../../constants/reportes'
import { useCategorias } from '../../context/CategoriasContext'
import { useHistoriales } from '../../hooks/useHistoriales'
import { construirCsvReportes, descargarCsv } from '../../components/Reportes/exportar'
import { fechaInput } from '../../components/Reportes/rangosRapidos'
import {
  NOMBRE_GRANULARIDAD,
  PERIODOS,
  construirSerie,
  describirRango,
  estaEnRango,
  rangoDePeriodo,
} from '../Operador/periodos'
import type { Periodo } from '../Operador/periodos'
import { useOperadores } from './operadores'
import comun from '../../components/Reportes/Reportes.module.css'
import styles from '../Operador/OperadorEstadisticas.module.css'
import admin from './Admin.module.css'

const SIN_OPERADOR = '__sin_operador__'

function porcentaje(parte: number, total: number): string {
  return total > 0 ? `${Math.round((parte / total) * 100)}% del total` : '—'
}

interface FilaOperador {
  clave: string
  nombre: string
  total: number
  abiertos: number
  sinAtender: number
  primeraAtencion: number | null
  resolucion: number | null
  /** Antigüedad del abierto más antiguo, en ms. */
  masAntiguo: number | null
}

/**
 * Estadísticas de todo el sistema, para monitorear desde la administración:
 * volumen, reportes sin operador, tiempos de atención por operador y dónde
 * se concentran los reportes.
 */
export default function AdminEstadisticas() {
  const { cargando, autorizado } = useRequiereAdmin()
  const { etiqueta } = useCategorias()
  const { operadores } = useOperadores(autorizado)

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
    if (!autorizado) {
      return
    }
    return onSnapshot(
      collection(db, 'reports'),
      (snapshot) => {
        setReportes(snapshot.docs.map(mapearReporte))
        setCargandoReportes(false)
        setError('')
      },
      (err) => {
        console.error('Error al leer los reportes:', err)
        setError('No pudimos cargar los reportes. Intenta más tarde.')
        setCargandoReportes(false)
      },
    )
  }, [autorizado])

  const nombreOperador = useMemo(() => {
    const mapa = new Map(operadores.map((o) => [o.id, o.nombre]))
    return (id: string | null) => (id ? mapa.get(id) ?? id : 'Sin operador')
  }, [operadores])

  const rango = useMemo(() => rangoDePeriodo(periodo, desde, hasta), [periodo, desde, hasta])

  const enPeriodo = useMemo(
    () =>
      reportes
        .filter((r) => estaEnRango(r, rango))
        .sort((a, b) => (b.fecha?.getTime() ?? 0) - (a.fecha?.getTime() ?? 0)),
    [reportes, rango],
  )

  const estadisticas = useMemo(() => {
    let finalizados = 0
    let sinOperador = 0
    const porEstado: Record<string, number> = {}
    const porCategoria: Record<string, number> = {}
    const porComuna: Record<string, number> = {}

    for (const r of enPeriodo) {
      if (ESTADOS_FINALIZADOS.has(r.estado)) finalizados += 1
      if (!r.operadorId) sinOperador += 1
      porEstado[r.estado] = (porEstado[r.estado] ?? 0) + 1
      porCategoria[r.categoria] = (porCategoria[r.categoria] ?? 0) + 1
      const comuna = r.comuna || 'Sin comuna'
      porComuna[comuna] = (porComuna[comuna] ?? 0) + 1
    }

    const filasEstado: FilaBarra[] = ESTADOS_EN_ORDEN.map((estado) => ({
      clave: estado,
      etiqueta: ETIQUETA_POR_ESTADO[estado],
      valor: porEstado[estado] ?? 0,
      colorIdentidad: COLOR_POR_ESTADO[estado],
    }))

    const ordenar = (registro: Record<string, number>, nombre: (clave: string) => string) =>
      Object.entries(registro)
        .map(([clave, valor]) => ({ clave, etiqueta: nombre(clave), valor }))
        .sort((a, b) => b.valor - a.valor)

    return {
      total: enPeriodo.length,
      finalizados,
      sinResolver: enPeriodo.length - finalizados,
      sinOperador,
      filasEstado,
      filasCategoria: ordenar(porCategoria, etiqueta),
      // Las 10 comunas con más reportes: con todas, el gráfico no se lee.
      filasComuna: ordenar(porComuna, (c) => c).slice(0, 10),
      comunasDistintas: Object.keys(porComuna).length,
    }
  }, [enPeriodo, etiqueta])

  const serie = useMemo(() => construirSerie(enPeriodo, rango), [enPeriodo, rango])

  const { historiales, cargando: calculandoTiempos, error: errorTiempos } = useHistoriales(enPeriodo)

  // Tiempos globales y por operador (con una fila para los sin operador).
  const tiempos = useMemo(() => {
    const ahora = Date.now()
    const primeras: number[] = []
    const resoluciones: number[] = []
    const grupos = new Map<
      string,
      { total: number; abiertos: number; sinAtender: number; primeras: number[]; resoluciones: number[]; masAntiguo: number | null }
    >()

    for (const r of enPeriodo) {
      const clave = r.operadorId ?? SIN_OPERADOR
      const grupo = grupos.get(clave) ?? {
        total: 0,
        abiertos: 0,
        sinAtender: 0,
        primeras: [],
        resoluciones: [],
        masAntiguo: null,
      }
      grupo.total += 1
      if (!ESTADOS_FINALIZADOS.has(r.estado)) {
        grupo.abiertos += 1
        if (r.fecha) {
          const edad = ahora - r.fecha.getTime()
          grupo.masAntiguo = Math.max(grupo.masAntiguo ?? 0, edad)
        }
      }
      if (r.estado === 'reportado') grupo.sinAtender += 1
      grupos.set(clave, grupo)

      const cambios = historiales.get(r.id)
      if (!cambios || (r.estado !== 'reportado' && cambios.length === 0)) continue
      const { primeraAtencionMs, resolucionMs } = calcularTiempos(r, cambios)
      if (primeraAtencionMs !== null) {
        primeras.push(primeraAtencionMs)
        grupo.primeras.push(primeraAtencionMs)
      }
      if (resolucionMs !== null) {
        resoluciones.push(resolucionMs)
        grupo.resoluciones.push(resolucionMs)
      }
    }

    const filas: FilaOperador[] = Array.from(grupos, ([clave, g]) => ({
      clave,
      nombre: clave === SIN_OPERADOR ? 'Sin operador' : nombreOperador(clave),
      total: g.total,
      abiertos: g.abiertos,
      sinAtender: g.sinAtender,
      primeraAtencion: mediana(g.primeras),
      resolucion: mediana(g.resoluciones),
      masAntiguo: g.masAntiguo,
    })).sort((a, b) => b.abiertos - a.abiertos || b.total - a.total)

    return {
      medianaPrimera: mediana(primeras),
      medianaResolucion: mediana(resoluciones),
      atendidos: primeras.length,
      resueltos: resoluciones.length,
      filas,
    }
  }, [enPeriodo, historiales, nombreOperador])

  if (!cargando && !autorizado) {
    return <Navigate to="/" replace />
  }

  const reporteDetalle = detalleId ? reportes.find((r) => r.id === detalleId) ?? null : null
  const cargandoTodo = cargando || cargandoReportes
  const primeraVez = calculandoTiempos && tiempos.atendidos === 0 && tiempos.resueltos === 0
  const ahora = Date.now()
  const abiertosAntiguos = enPeriodo
    .filter((r): r is Reporte & { fecha: Date } => !ESTADOS_FINALIZADOS.has(r.estado) && r.fecha !== null)
    .sort((a, b) => a.fecha.getTime() - b.fecha.getTime())
    .slice(0, 8)

  const rangoArchivo =
    !rango.inicio && !rango.fin
      ? 'todo'
      : `${rango.inicio ? fechaInput(rango.inicio) : 'inicio'}_${fechaInput(rango.fin ?? new Date())}`

  async function exportarCsv() {
    setErrorExportar('')
    try {
      const csv = await construirCsvReportes(enPeriodo, {
        etiquetaCategoria: etiqueta,
        nombreOperador,
        historiales,
        onProgreso: (hechos, total) => setProgresoCsv({ hechos, total }),
      })
      descargarCsv(csv, `reportes_global_${rangoArchivo}.csv`)
    } catch (err) {
      console.error('Error al exportar el CSV:', err)
      setErrorExportar('No pudimos generar el CSV. Inténtalo nuevamente.')
    } finally {
      setProgresoCsv(null)
    }
  }

  function exportarPdf() {
    const tituloOriginal = document.title
    document.title = `estadisticas_global_${rangoArchivo}`
    window.addEventListener('afterprint', () => (document.title = tituloOriginal), { once: true })
    window.print()
  }

  const duracion = (ms: number | null) => (ms !== null ? formatearDuracion(ms) : '—')

  return (
    <>
      <main className={comun.main}>
        <div>
          <h1 className={styles.titulo}>Estadísticas globales</h1>
          <p className={styles.subtitulo}>Todos los reportes del sistema · {describirRango(rango)}</p>
          <p className={`solo-impresion ${styles.subtitulo}`}>
            Generado el {new Date().toLocaleString('es-CL', { dateStyle: 'long', timeStyle: 'short' })}
          </p>
        </div>

        <div className={styles.filtros} role="group" aria-label="Periodo" data-no-imprimir>
          <div className={styles.periodos}>
            {PERIODOS.map(({ clave, etiqueta: nombre }) => (
              <button
                key={clave}
                type="button"
                className={`${styles.periodo} ${periodo === clave ? styles.periodoActivo : ''}`}
                aria-pressed={periodo === clave}
                onClick={() => setPeriodo(clave)}
              >
                {nombre}
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
                <span className={styles.kpiNota}>
                  en {estadisticas.comunasDistintas} comuna(s)
                </span>
              </div>
              <div className={styles.kpi}>
                <span className={styles.kpiEtiqueta}>Sin operador</span>
                <span className={styles.kpiValor}>
                  {estadisticas.sinOperador.toLocaleString('es-CL')}
                </span>
                <span className={styles.kpiNota}>
                  {estadisticas.sinOperador > 0 ? (
                    <Link
                      to={`/admin/reportes?operador=${SIN_OPERADOR}`}
                      className={admin.footerLink}
                      data-no-imprimir
                    >
                      Asignarlos
                    </Link>
                  ) : (
                    'todos tienen quien los gestione'
                  )}
                </span>
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
              <p className={comun.estadoCarga}>No hay reportes en este periodo.</p>
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
                  aria-labelledby="tiempos-globales-titulo"
                  aria-busy={calculandoTiempos}
                >
                  <div>
                    <h2 id="tiempos-globales-titulo" className={styles.seccionTitulo}>
                      Atención por operador
                    </h2>
                    <p className={styles.seccionNota}>
                      Mediana: la mitad de los reportes se atendió (o resolvió) en menos de ese
                      tiempo, desde que el ciudadano lo creó. Ordenado por reportes abiertos.
                    </p>
                  </div>

                  {errorTiempos && <p className={comun.errorTexto}>{errorTiempos}</p>}

                  <div className={styles.kpis}>
                    <div className={styles.kpi}>
                      <span className={styles.kpiEtiqueta}>Primera atención (global)</span>
                      <span className={styles.kpiValor}>
                        {primeraVez ? '…' : duracion(tiempos.medianaPrimera)}
                      </span>
                      <span className={styles.kpiNota}>{tiempos.atendidos} atendidos</span>
                    </div>
                    <div className={styles.kpi}>
                      <span className={styles.kpiEtiqueta}>Hasta resolver o cerrar (global)</span>
                      <span className={styles.kpiValor}>
                        {primeraVez ? '…' : duracion(tiempos.medianaResolucion)}
                      </span>
                      <span className={styles.kpiNota}>{tiempos.resueltos} finalizados</span>
                    </div>
                  </div>

                  <section className={styles.tarjeta}>
                    <div className={styles.tablaScroll}>
                      <table className={styles.tabla}>
                        <thead>
                          <tr>
                            <th scope="col">Operador</th>
                            <th scope="col" className={styles.numero}>
                              Reportes
                            </th>
                            <th scope="col" className={styles.numero}>
                              Abiertos
                            </th>
                            <th scope="col" className={styles.numero}>
                              Sin atender
                            </th>
                            <th scope="col" className={styles.numero}>
                              Primera atención
                            </th>
                            <th scope="col" className={styles.numero}>
                              Hasta resolver
                            </th>
                            <th scope="col" className={styles.numero}>
                              Abierto más antiguo
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {tiempos.filas.map((fila) => (
                            <tr key={fila.clave}>
                              <td>{fila.nombre}</td>
                              <td className={styles.numero}>{fila.total}</td>
                              <td className={styles.numero}>{fila.abiertos}</td>
                              <td className={styles.numero}>{fila.sinAtender}</td>
                              <td className={styles.numero}>{duracion(fila.primeraAtencion)}</td>
                              <td className={styles.numero}>{duracion(fila.resolucion)}</td>
                              <td className={styles.numero}>{duracion(fila.masAntiguo)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <p className={styles.tablaNota}>
                      "—": todavía no hay reportes atendidos o finalizados de ese operador en el
                      periodo.
                    </p>
                  </section>
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

                <div className={styles.dosColumnas}>
                  <section className={styles.tarjeta}>
                    <h2 className={styles.tarjetaTitulo}>Comunas con más reportes</h2>
                    <GraficoBarras filas={estadisticas.filasComuna} total={estadisticas.total} />
                  </section>
                  <section className={styles.tarjeta}>
                    <h2 className={styles.tarjetaTitulo}>Abiertos más antiguos</h2>
                    {abiertosAntiguos.length === 0 ? (
                      <p className={comun.estadoCarga}>No hay reportes abiertos en el periodo.</p>
                    ) : (
                      <ol className={styles.ranking}>
                        {abiertosAntiguos.map((r) => (
                          <li key={r.id}>
                            <span className={`${styles.rankingNombre} ${admin.rankingConEstado}`}>
                              <button
                                type="button"
                                className={styles.enlaceFila}
                                onClick={() => setDetalleId(r.id)}
                              >
                                {etiqueta(r.categoria)} · {r.comuna || 'Sin comuna'}
                              </button>
                              <EstadoPildora estado={r.estado} />
                            </span>
                            <span className={styles.rankingValor}>
                              {formatearDuracion(ahora - r.fecha.getTime())}
                            </span>
                          </li>
                        ))}
                      </ol>
                    )}
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
          operadorNombre={reporteDetalle.operadorId ? nombreOperador(reporteDetalle.operadorId) : null}
          onCerrar={() => setDetalleId(null)}
          gestionable
        />
      )}
    </>
  )
}
