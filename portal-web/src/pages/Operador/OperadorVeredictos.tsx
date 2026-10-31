import { useMemo, useState } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router-dom'
import { formatearDuracion, mediana } from '../../components/Reportes/tiempos'
import { useRequiereOperador } from '../../hooks/useRequiereOperador'
import Navbar from '../../components/Navbar/Navbar'
import DetalleReporte from '../../components/Reportes/DetalleReporte'
import FotoReporte from '../../components/Reportes/FotoReporte'
import { EstadoPildora } from '../../components/Reportes/TarjetaReporte'
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
  const [detalleId, setDetalleId] = useState<string | null>(null)

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

  const reporteDetalle = detalleId ? pendientes.reportes.find((r) => r.id === detalleId) ?? null : null

  if (!cargando && !autorizado) {
    return <Navigate to="/" replace />
  }

  const total = pendientes.reportes.length
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
            <span className={estadisticas.kpiEtiqueta}>Confirmados sin veredicto</span>
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
            <span className={estadisticas.kpiEtiqueta}>Espera de los pendientes</span>
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
            <span className={estadisticas.kpiEtiqueta}>Tiempo hasta el veredicto</span>
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
            <span className={estadisticas.kpiEtiqueta}>Revisión hasta el cierre</span>
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

        {/* Filtros */}
        <section className={comun.filtros} aria-label="Filtros">
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
          {visibles.map((reporte) => (
            <li key={reporte.id} className={styles.item}>
              <TarjetaPendiente
                reporte={reporte}
                ahora={ahora}
                categoria={etiqueta(reporte.categoria)}
                onAbrir={() => setDetalleId(reporte.id)}
              />
            </li>
          ))}
        </ul>
      </main>

      {reporteDetalle && (
        <DetalleReporte
          reporte={reporteDetalle}
          operadorNombre={operadorNombre}
          onCerrar={() => setDetalleId(null)}
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
  const { puntos, votos } = reporte.validacion

  return (
    <article className={`${styles.tarjeta} ${demorado ? styles.tarjetaDemorada : ''}`}>
      <div className={styles.foto}>
        <FotoReporte foto={reporte.foto} />
      </div>
      <div className={styles.cuerpo}>
        <div className={styles.cabecera}>
          <span className={styles.categoria}>{categoria}</span>
          <span className={styles.comuna}>{reporte.comuna || 'Sin comuna'}</span>
          <EstadoPildora estado={reporte.estado} />
          {demorado && (
            <span className={styles.demorado} title={`Lleva más de ${UMBRAL_DEMORADO_HORAS} horas esperando`}>
              Demorado
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
          <button type="button" className={comun.accionBoton} onClick={onAbrir}>
            Ver y dar veredicto
          </button>
        </div>
      </div>
    </article>
  )
}
