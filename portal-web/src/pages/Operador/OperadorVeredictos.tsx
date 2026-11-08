import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router-dom'
import { formatearDuracion, mediana } from '../../components/Reportes/tiempos'
import { useRequiereOperador } from '../../hooks/useRequiereOperador'
import Navbar from '../../components/Navbar/Navbar'
import DetalleReporte from '../../components/Reportes/DetalleReporte'
import IconoKpi from '../../components/Iconos/IconoKpi'
import FotoReporte from '../../components/Reportes/FotoReporte'
import { EstadoPildora } from '../../components/Reportes/TarjetaReporte'
import type { ResultadoAplicado } from '../../confianza/VeredictoReporte'
import type { Reporte } from '../../components/Reportes/reporte'
import { useCategorias } from '../../context/CategoriasContext'
import OperadorTabs from './OperadorTabs'
import { PERIODOS, rangoDePeriodo } from './periodos'
import type { Periodo } from './periodos'
import {
  FILTROS_PENDIENTES_VACIOS,
  esperaActual,
  estaDemorado,
  filtrarPendientes,
  filtrosAUrl,
  filtrosDeUrl,
  hayFiltrosActivos,
  ordenarPendientes,
  resumenDeTiempos,
  tiempoHastaVeredicto,
  MAXIMO_HISTORIALES_REVISION,
  UMBRAL_DEMORADO_HORAS,
} from './veredictos'
import type { FiltrosPendientes } from './veredictos'
import { MAXIMO_CON_VEREDICTO, useReportesConVeredicto, useReportesPorVeredicto } from './useReportesPorVeredicto'
import { useRevisionACierre } from './useRevisionACierre'
import comun from '../../components/Reportes/Reportes.module.css'
import estadisticas from './OperadorEstadisticas.module.css'
import styles from './OperadorVeredictos.module.css'

/** Los periodos fijos de Estadísticas; el personalizado no se ofrece aquí. */
const PERIODOS_FIJOS = PERIODOS.filter((p) => p.clave !== 'personalizado')

/** Cuánto se queda el aviso «Veredicto guardado» antes de cerrarse solo (también se puede cerrar antes con su botón). */
const HORA_MS = 3_600_000
const DURACION_AVISO_MS = 8_000
/** Cuánto dura la salida animada de una tarjeta que recibió su veredicto. */
const DURACION_SALIDA_MS = 250

const reducirMovimiento = () =>
  typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

const corto = (texto: string, largo = 60) => (texto.length > largo ? `${texto.slice(0, largo - 1)}…` : texto)

const plural = (n: number, uno: string, varios: string) => `${n.toLocaleString('es-CL')} ${n === 1 ? uno : varios}`

/**
 * «Por veredicto»: los reportes del operador que la comunidad ya confirmó y que esperan que él dé el
 * veredicto (real o falso), con cuánto llevan esperando y cuánto tarda en responderse.
 */
export default function OperadorVeredictos() {
  const { cargando, autorizado, operadorId, operadorNombre, organismoNombre } = useRequiereOperador()
  const { etiqueta, categorias } = useCategorias()
  const [params, setParams] = useSearchParams()
  const [periodo, setPeriodo] = useState<Periodo>('mes')
  // En un teléfono los filtros se pliegan tras un botón; en escritorio siempre se ven (ver el CSS).
  const [filtrosAbiertos, setFiltrosAbiertos] = useState(false)
  // Copia del reporte al abrir el detalle: aunque reciba su veredicto y salga de la lista en vivo, el detalle sigue
  // abierto y muestra el resultado hasta que se cierre.
  const [detalle, setDetalle] = useState<Reporte | null>(null)
  const [dado, setDado] = useState<ResultadoAplicado | null>(null)
  const [aviso, setAviso] = useState<{ texto: string; id: number } | null>(null)
  const avisoRef = useRef<HTMLDivElement>(null)
  const anteriores = useRef<Map<string, Reporte> | null>(null)
  const [saliendo, setSaliendo] = useState<Map<string, { reporte: Reporte; indice: number }>>(new Map())

  const filtros = useMemo(() => filtrosDeUrl(params), [params])
  // El estado de la pantalla vive en la URL: se puede compartir y sobrevive a recargar.
  function cambiar(cambio: Partial<FiltrosPendientes>) {
    setParams(filtrosAUrl({ ...filtros, ...cambio }), { replace: true })
  }

  const idOperador = autorizado ? operadorId : null
  const pendientes = useReportesPorVeredicto(idOperador)
  const rango = useMemo(() => rangoDePeriodo(periodo, '', ''), [periodo])
  const conVeredicto = useReportesConVeredicto(idOperador, rango)
  const revision = useRevisionACierre(idOperador, rango)

  // `ahora` se fija al cargar la lista: las esperas no «corren» con cada tecla.
  const ahora = useMemo(() => Date.now(), [pendientes.reportes])

  const comunas = useMemo(
    () => [...new Set(pendientes.reportes.map((r) => r.comuna).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es')),
    [pendientes.reportes],
  )
  const visibles = useMemo(
    () => ordenarPendientes(filtrarPendientes(pendientes.reportes, filtros, ahora), filtros.orden),
    [pendientes.reportes, filtros, ahora],
  )

  const esperas = pendientes.reportes.map((r) => esperaActual(r, ahora)).filter((e): e is number => e !== null)
  const medianaEspera = mediana(esperas)
  const masAntigua = esperas.length ? Math.max(...esperas) : null
  const sinFecha = pendientes.reportes.length - esperas.length
  const tiempos = useMemo(() => resumenDeTiempos(conVeredicto.reportes.map(tiempoHastaVeredicto)), [conVeredicto.reportes])

  // Un pendiente que sale de la lista recibió su veredicto: se vuelven a leer los tiempos (para que lo incluyan) y, si
  // se puede, la tarjeta se desvanece en vez de desaparecer de golpe. Un reporte que sale por un filtro no cuenta.
  const { recargar } = conVeredicto
  useEffect(() => {
    if (pendientes.cargando) return
    const actuales = new Map(pendientes.reportes.map((r) => [r.id, r]))
    const previos = anteriores.current
    anteriores.current = actuales
    if (!previos) return // primera carga
    const salieron = [...previos.values()].filter((r) => !actuales.has(r.id))
    if (salieron.length === 0) return
    recargar()
    if (reducirMovimiento()) return
    const ordenPrevio = ordenarPendientes(filtrarPendientes([...previos.values()], filtros, ahora), filtros.orden).map((r) => r.id)
    const visiblesQueSalen = salieron.filter((r) => ordenPrevio.includes(r.id))
    if (visiblesQueSalen.length === 0) return
    setSaliendo((m) => {
      const nuevo = new Map(m)
      for (const r of visiblesQueSalen) nuevo.set(r.id, { reporte: r, indice: ordenPrevio.indexOf(r.id) })
      return nuevo
    })
    const t = window.setTimeout(() => {
      setSaliendo((m) => {
        const nuevo = new Map(m)
        for (const r of visiblesQueSalen) nuevo.delete(r.id)
        return nuevo
      })
    }, DURACION_SALIDA_MS)
    return () => window.clearTimeout(t)
    // Solo cuando cambian los datos: los filtros y la hora se leen tal como estaban.
  }, [pendientes.reportes, pendientes.cargando]) // eslint-disable-line react-hooks/exhaustive-deps

  // Lo que se pinta: la lista visible y, en su lugar, las tarjetas que se están yendo.
  const lista = useMemo(() => {
    const filas = visibles.map((reporte) => ({ reporte, saliendo: false }))
    const yendose = [...saliendo.values()].sort((a, b) => a.indice - b.indice)
    for (const e of yendose) filas.splice(Math.min(e.indice, filas.length), 0, { reporte: e.reporte, saliendo: true })
    return filas
  }, [visibles, saliendo])

  // El aviso se cierra solo; al aparecer recibe el foco para que quien usa teclado o lector de pantalla no pierda el lugar.
  useEffect(() => {
    if (!aviso) return
    avisoRef.current?.focus()
    const t = window.setTimeout(() => setAviso(null), DURACION_AVISO_MS)
    return () => window.clearTimeout(t)
  }, [aviso])

  function cerrarDetalle() {
    const abierto = detalle
    setDetalle(null)
    if (abierto && dado) {
      setAviso({
        texto: `Veredicto «${dado.veredicto}» guardado para «${corto(abierto.descripcion)}»: el reporte salió de la lista.`,
        id: Date.now(),
      })
    }
    setDado(null)
  }

  if (!cargando && !autorizado) {
    return <Navigate to="/" replace />
  }

  const total = pendientes.reportes.length
  const filtrosEnUso = [filtros.categoria, filtros.comuna, filtros.espera, filtros.foto, filtros.texto].filter(Boolean).length
  const mostrado = pendientes.hayMas && pendientes.total !== null ? pendientes.total : total

  return (
    <div className={estadisticas.page}>
      <Navbar />
      <OperadorTabs />

      <main className={comun.main}>
        <div>
          <h1 className={estadisticas.titulo}>Por veredicto</h1>
          <p className={estadisticas.subtitulo}>
            Reportes de {operadorNombre ?? 'tu operador'} que la comunidad ya confirmó y esperan tu veredicto: real o falso.
          </p>
        </div>

        {aviso && (
          <div key={aviso.id} ref={avisoRef} className={styles.aviso} role="status" tabIndex={-1}>
            <span>{aviso.texto}</span>
            <button type="button" className={styles.avisoCerrar} aria-label="Cerrar aviso" onClick={() => setAviso(null)}>
              ×
            </button>
          </div>
        )}

        {/* Indicadores */}
        <label className={styles.periodo}>
          <span className={styles.periodoEtiqueta}>Periodo de los tiempos</span>
          <select className={comun.entrada} value={periodo} onChange={(e) => setPeriodo(e.target.value as Periodo)}>
            {PERIODOS_FIJOS.map(({ clave, etiqueta: texto }) => (
              <option key={clave} value={clave}>
                {texto}
              </option>
            ))}
          </select>
        </label>
        <section className={estadisticas.kpis} aria-label="Indicadores">
          <div className={estadisticas.kpi} role="group" aria-label="Confirmados sin veredicto">
            <span className={estadisticas.kpiEtiqueta}>
              <IconoKpi tipo="pendientes" />
              Confirmados sin veredicto
            </span>
            <span className={estadisticas.kpiValor}>
              {cargando || pendientes.cargando ? '…' : `${mostrado.toLocaleString('es-CL')}${pendientes.hayMas && pendientes.total === null ? '+' : ''}`}
            </span>
            <span className={estadisticas.kpiNota}>
              {pendientes.hayMas
                ? `Se leen hasta ${plural(pendientes.reportes.length, 'reporte', 'reportes')}; puede haber más.`
                : 'esperando que des el veredicto'}
            </span>
          </div>

          <div className={estadisticas.kpi} role="group" aria-label="Espera de los pendientes">
            <span className={estadisticas.kpiEtiqueta}>
              <IconoKpi tipo="espera" />
              Espera de los pendientes
            </span>
            <span className={estadisticas.kpiValor}>
              {pendientes.cargando ? '…' : medianaEspera !== null ? formatearDuracion(medianaEspera) : '—'}
            </span>
            <span className={estadisticas.kpiNota}>
              {masAntigua !== null ? `Mediana · Más antigua: ${formatearDuracion(masAntigua)}` : 'Mediana desde que la comunidad los confirmó'}
              {sinFecha > 0 && ` · ${sinFecha} sin fecha de validación`}
            </span>
          </div>

          <div
            className={`${estadisticas.kpi} ${conVeredicto.cargando ? styles.recalculando : ''}`}
            role="group"
            aria-label="Tiempo hasta el veredicto"
            aria-busy={conVeredicto.cargando}
          >
            <span className={estadisticas.kpiEtiqueta}>
              <IconoKpi tipo="veredicto" />
              Tiempo hasta el veredicto
            </span>
            <span className={estadisticas.kpiValor}>
              {conVeredicto.cargando && tiempos.cantidad === 0 ? '…' : tiempos.mediana !== null ? formatearDuracion(tiempos.mediana) : '—'}
            </span>
            <span className={estadisticas.kpiNota}>
              {tiempos.promedio !== null
                ? `Promedio ${formatearDuracion(tiempos.promedio)} · ${plural(tiempos.cantidad, 'reporte', 'reportes')}`
                : 'Aún no hay veredictos en el periodo'}
              {tiempos.excluidos > 0 && ` · ${tiempos.excluidos} sin fechas`}
              {conVeredicto.hayMas && ' · hay más antiguos sin contar'}
            </span>
          </div>

          <div
            className={`${estadisticas.kpi} ${revision.cargando ? styles.recalculando : ''}`}
            role="group"
            aria-label="Revisión hasta el cierre"
            aria-busy={revision.cargando}
          >
            <span className={estadisticas.kpiEtiqueta}>
              <IconoKpi tipo="revision" />
              Revisión hasta el cierre
            </span>
            <span className={estadisticas.kpiValor}>
              {revision.cargando && revision.cierre.cantidad === 0 ? '…' : revision.cierre.mediana !== null ? formatearDuracion(revision.cierre.mediana) : '—'}
            </span>
            <span className={estadisticas.kpiNota}>
              {revision.cierre.promedio !== null
                ? `Promedio ${formatearDuracion(revision.cierre.promedio)} · ${plural(revision.cierre.cantidad, 'reporte', 'reportes')}`
                : 'Aún no hay reportes cerrados con revisión'}
              {revision.sinRevision > 0 && ` · ${revision.sinRevision} sin «En revisión»`}
              {revision.resuelto.mediana !== null && ` · Hasta resolver: mediana ${formatearDuracion(revision.resuelto.mediana)}`}
              {revision.hayMas && ` · se midieron los ${MAXIMO_HISTORIALES_REVISION} cerrados más recientes del periodo`}
            </span>
          </div>
        </section>
        {conVeredicto.error && <p className={comun.errorTexto}>{conVeredicto.error}</p>}
        {revision.error && <p className={comun.errorTexto}>{revision.error}</p>}
        <p className={styles.notaTiempos}>
          El tiempo hasta el veredicto se mide desde que la comunidad confirma el reporte, según la fecha del veredicto
          (hasta {MAXIMO_CON_VEREDICTO} reportes por resultado). La revisión hasta el cierre, desde que el reporte pasa a
          «En revisión» hasta que se cierra, según la fecha del cierre.
        </p>

        {/* Filtros: en escritorio siempre se ven; en un teléfono se pliegan tras un botón. */}
        <button
          type="button"
          className={styles.botonFiltros}
          aria-expanded={filtrosAbiertos}
          aria-controls="filtros-veredicto"
          onClick={() => setFiltrosAbiertos((abierto) => !abierto)}
        >
          Filtros
          {filtrosEnUso > 0 && <span className={styles.contadorFiltros}>{filtrosEnUso}</span>}
        </button>
        <section
          id="filtros-veredicto"
          className={`${comun.filtros} ${filtrosAbiertos ? '' : styles.plegado}`}
          aria-label="Filtros"
        >
          <label className={comun.campo}>
            <span className={comun.etiqueta}>Categoría</span>
            <select className={comun.entrada} value={filtros.categoria} onChange={(e) => cambiar({ categoria: e.target.value })}>
              <option value="">Todas</option>
              {categorias.map((c) => (
                <option key={c.id} value={c.id}>
                  {etiqueta(c.id)}
                </option>
              ))}
            </select>
          </label>
          <label className={comun.campo}>
            <span className={comun.etiqueta}>Comuna</span>
            <select className={comun.entrada} value={filtros.comuna} onChange={(e) => cambiar({ comuna: e.target.value })}>
              <option value="">Todas</option>
              {comunas.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
              {filtros.comuna && !comunas.includes(filtros.comuna) && <option value={filtros.comuna}>{filtros.comuna}</option>}
            </select>
          </label>
          <label className={comun.campo}>
            <span className={comun.etiqueta}>Tiempo de espera</span>
            <select
              className={comun.entrada}
              value={filtros.espera}
              onChange={(e) => cambiar({ espera: e.target.value as FiltrosPendientes['espera'] })}
            >
              <option value="">Todos</option>
              <option value="24h">Más de 24 horas</option>
              <option value="48h">Más de 48 horas</option>
              <option value="7d">Más de 7 días</option>
            </select>
          </label>
          <label className={comun.campo}>
            <span className={comun.etiqueta}>Foto</span>
            <select
              className={comun.entrada}
              value={filtros.foto}
              onChange={(e) => cambiar({ foto: e.target.value as FiltrosPendientes['foto'] })}
            >
              <option value="">Con o sin foto</option>
              <option value="con">Con foto</option>
              <option value="sin">Sin foto</option>
            </select>
          </label>
          <label className={comun.campo}>
            <span className={comun.etiqueta}>Ordenar por</span>
            <select
              className={comun.entrada}
              value={filtros.orden}
              onChange={(e) => cambiar({ orden: e.target.value as FiltrosPendientes['orden'] })}
            >
              <option value="antiguos">Más antiguos primero</option>
              <option value="votos">Más votos primero</option>
              <option value="recientes">Más recientes primero</option>
            </select>
          </label>
          <label className={`${comun.campo} ${comun.filtroAncho}`}>
            <span className={comun.etiqueta}>Buscar en la descripción</span>
            <input
              type="search"
              className={comun.entrada}
              value={filtros.texto}
              placeholder="Por ejemplo: poste, basura, árbol…"
              onChange={(e) => cambiar({ texto: e.target.value })}
            />
          </label>
          <div className={`${comun.filtrosPie} ${comun.filtroAncho}`}>
            <p className={styles.resumen} role="status">
              {pendientes.cargando
                ? 'Cargando reportes…'
                : `Mostrando ${visibles.length.toLocaleString('es-CL')} de ${plural(total, 'reporte', 'reportes')}`}
            </p>
            {hayFiltrosActivos(filtros) && (
              <button type="button" className={comun.accionBoton} onClick={() => setParams(filtrosAUrl({ ...FILTROS_PENDIENTES_VACIOS, orden: filtros.orden }), { replace: true })}>
                Limpiar filtros
              </button>
            )}
          </div>
        </section>

        {pendientes.error && <p className={comun.errorTexto}>{pendientes.error}</p>}

        {/* Lista */}
        {!pendientes.cargando && !pendientes.error && total === 0 && (
          <div className={styles.vacio}>
            <p>No tienes reportes confirmados esperando veredicto.</p>
            <Link to="/operador/reportes" className={comun.enlaceBoton}>
              Ver todos mis reportes
            </Link>
          </div>
        )}
        {!pendientes.cargando && total > 0 && visibles.length === 0 && (
          <p className={comun.estadoCarga}>Ningún reporte coincide con los filtros.</p>
        )}

        <ul className={styles.lista} aria-label="Reportes pendientes de veredicto">
          {lista.map(({ reporte, saliendo: yendose }) => (
            <li key={reporte.id} className={`${styles.item} ${yendose ? styles.itemSaliendo : ''}`} aria-hidden={yendose || undefined}>
              <TarjetaPendiente
                reporte={reporte}
                ahora={ahora}
                categoria={etiqueta(reporte.categoria)}
                onAbrir={() => {
                  setDado(null)
                  setDetalle(reporte)
                }}
              />
            </li>
          ))}
        </ul>
      </main>

      {detalle && (
        <DetalleReporte
          reporte={detalle}
          operadorNombre={operadorNombre}
          onCerrar={cerrarDetalle}
          onVeredicto={setDado}
          gestionable
          organismoNombre={organismoNombre}
        />
      )}
    </div>
  )
}

function TarjetaPendiente({
  reporte,
  ahora,
  categoria,
  onAbrir,
}: {
  reporte: Reporte
  ahora: number
  categoria: string
  onAbrir: () => void
}) {
  const espera = esperaActual(reporte, ahora)
  const demorado = estaDemorado(reporte, ahora)
  // Cuánto lleva esperando, en tres tramos: menos de 24 h, más de 24 h y «Demorado» (el umbral de siempre).
  const urgencia: 'reciente' | 'atencion' | 'demorado' | null = demorado
    ? 'demorado'
    : espera === null
      ? null
      : espera >= 24 * HORA_MS
        ? 'atencion'
        : 'reciente'
  const { puntos, votos } = reporte.validacion

  return (
    <article className={`${styles.tarjeta} ${demorado ? styles.tarjetaDemorada : ''}`} data-urgencia={urgencia ?? undefined}>
      <div className={styles.foto}>
        <FotoReporte foto={reporte.foto} />
      </div>
      <div className={styles.cuerpo}>
        <div className={styles.cabecera}>
          <span className={styles.categoria}>{categoria}</span>
          <span className={styles.comuna}>{reporte.comuna || 'Sin comuna'}</span>
          <EstadoPildora estado={reporte.estado} />
          {urgencia && (
            <span
              className={styles.urgencia}
              data-urgencia={urgencia}
              title={urgencia === 'demorado' ? `Lleva más de ${UMBRAL_DEMORADO_HORAS} horas esperando` : 'Tiempo que lleva esperando el veredicto'}
            >
              {urgencia === 'demorado' ? 'Demorado' : urgencia === 'atencion' ? 'Más de 24 h' : 'Menos de 24 h'}
            </span>
          )}
        </div>
        <p className={styles.descripcion}>{reporte.descripcion || 'Sin descripción'}</p>
        <p className={styles.espera}>
          {espera !== null ? `Validado hace ${formatearDuracion(espera)}` : 'Validado sin fecha registrada'}
          <span className={styles.apoyo}>
            {' · '}
            {plural(Math.round(puntos), 'punto', 'puntos')} · {plural(votos, 'persona', 'personas')}
          </span>
        </p>
        <div className={styles.acciones}>
          <button type="button" className={styles.botonPrincipal} onClick={onAbrir}>
            Ver y dar veredicto
          </button>
        </div>
      </div>
    </article>
  )
}
