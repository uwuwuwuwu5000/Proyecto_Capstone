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
  COLOR_POR_ESTADO,
  ESTADOS_EN_ORDEN,
  ETIQUETA_POR_CATEGORIA,
  ETIQUETA_POR_ESTADO,
} from '../../constants/reportes'
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

const ESTADOS_FINALIZADOS = new Set(['resuelto', 'cerrado'])

function porcentaje(parte: number, total: number): string {
  return total > 0 ? `${Math.round((parte / total) * 100)}% del total` : '—'
}

export default function OperadorEstadisticas() {
  const { cargando, autorizado, operadorId, operadorNombre } = useRequiereOperador()

  const [reportes, setReportes] = useState<Reporte[]>([])
  const [cargandoReportes, setCargandoReportes] = useState(true)
  const [error, setError] = useState('')

  const [periodo, setPeriodo] = useState<Periodo>('mes')
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [detalleId, setDetalleId] = useState<string | null>(null)

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
        etiqueta: ETIQUETA_POR_CATEGORIA[categoria] ?? categoria,
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
  }, [enPeriodo])

  const serie = useMemo(() => construirSerie(enPeriodo, rango), [enPeriodo, rango])

  if (!cargando && !autorizado) {
    return <Navigate to="/" replace />
  }

  const reporteDetalle = detalleId ? reportes.find((r) => r.id === detalleId) ?? null : null
  const ultimos = enPeriodo.slice(0, 8)
  const cargandoTodo = cargando || cargandoReportes

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
        </div>

        <div className={styles.filtros} role="group" aria-label="Periodo">
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
        </div>

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
                            <th scope="col">
                              <span className={styles.soloLector}>Acciones</span>
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {ultimos.map((r) => (
                            <tr key={r.id}>
                              <td className={styles.nowrap}>{formatearFecha(r.fecha, true)}</td>
                              <td>{ETIQUETA_POR_CATEGORIA[r.categoria] ?? r.categoria}</td>
                              <td>{r.autorNombre ?? 'Sin nombre'}</td>
                              <td>
                                <EstadoPildora estado={r.estado} />
                              </td>
                              <td>
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
