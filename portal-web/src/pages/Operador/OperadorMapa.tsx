import { useEffect, useMemo, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { MapContainer, Marker, TileLayer, Tooltip } from 'react-leaflet'
import { collection, getCountFromServer, onSnapshot, query, where } from 'firebase/firestore'
import { db } from '../../firebase/config'
import { useRequiereOperador } from '../../hooks/useRequiereOperador'
import Navbar from '../../components/Navbar/Navbar'
import OperadorTabs from './OperadorTabs'
import DetalleReporte from '../../components/Reportes/DetalleReporte'
import FotoReporte from '../../components/Reportes/FotoReporte'
import { formatearFecha, mapearReporte } from '../../components/Reportes/reporte'
import type { Reporte } from '../../components/Reportes/reporte'
import { RANGOS_RAPIDOS, rangoRapido } from '../../components/Reportes/rangosRapidos'
import { ICONOS_POR_ESTADO, ICONO_ESTADO_DESCONOCIDO } from '../../components/Map/estadoIconos'
import {
  ESTADOS_EN_ORDEN,
  ETIQUETA_POR_CATEGORIA,
  ETIQUETA_POR_ESTADO,
  COLOR_POR_ESTADO,
} from '../../constants/reportes'
import styles from './OperadorMapa.module.css'

const CENTRO_SANTIAGO: [number, number] = [-33.4372, -70.6506]

type ReporteUbicado = Reporte & { lat: number; lng: number }

function tieneUbicacion(reporte: Reporte): reporte is ReporteUbicado {
  return reporte.lat !== null && reporte.lng !== null
}

export default function OperadorMapa() {
  const { cargando, autorizado, operadorId, operadorNombre } = useRequiereOperador()

  const [detalleId, setDetalleId] = useState<string | null>(null)
  const [reportes, setReportes] = useState<ReporteUbicado[]>([])
  const [cargandoReportes, setCargandoReportes] = useState(true)
  const [error, setError] = useState('')

  const [estadosSeleccionados, setEstadosSeleccionados] = useState<Set<string>>(
    () => new Set(ESTADOS_EN_ORDEN),
  )
  const [categoriaFiltro, setCategoriaFiltro] = useState('')
  const [texto, setTexto] = useState('')
  const [desde, setDesde] = useState(() => rangoRapido('tresMeses').desde)
  const [hasta, setHasta] = useState(() => rangoRapido('tresMeses').hasta)

  // Conteo de confirmaciones para el resumen del pin, pedido la primera vez
  // que se pasa el mouse por él (no para todos los reportes de golpe).
  const [confirmaciones, setConfirmaciones] = useState<Record<string, number | 'cargando' | 'error'>>(
    {},
  )

  function cargarConfirmaciones(reporteId: string) {
    if (confirmaciones[reporteId] !== undefined) {
      return
    }
    setConfirmaciones((prev) => ({ ...prev, [reporteId]: 'cargando' }))
    getCountFromServer(collection(db, 'reports', reporteId, 'confirmations'))
      .then((snap) => setConfirmaciones((prev) => ({ ...prev, [reporteId]: snap.data().count })))
      .catch((err) => {
        console.error('Error al contar confirmaciones:', err)
        setConfirmaciones((prev) => ({ ...prev, [reporteId]: 'error' }))
      })
  }

  useEffect(() => {
    if (!autorizado || !operadorId) {
      return
    }
    setCargandoReportes(true)
    const unsubscribe = onSnapshot(
      query(collection(db, 'reports'), where('operadorId', '==', operadorId)),
      (snapshot) => {
        setReportes(snapshot.docs.map(mapearReporte).filter(tieneUbicacion))
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

  // Todos los filtros menos el de estado: de aquí salen los contadores de los
  // chips, para que coincidan con lo que el mapa puede mostrar en el rango.
  const reportesSinFiltroEstado = useMemo(() => {
    const textoNormalizado = texto.trim().toLowerCase()
    const desdeFecha = desde ? new Date(`${desde}T00:00:00`) : null
    const hastaFecha = hasta ? new Date(`${hasta}T23:59:59`) : null

    return reportes.filter((reporte) => {
      if (categoriaFiltro && reporte.categoria !== categoriaFiltro) return false
      if (
        textoNormalizado &&
        !reporte.descripcion.toLowerCase().includes(textoNormalizado) &&
        !reporte.comuna.toLowerCase().includes(textoNormalizado)
      ) {
        return false
      }
      if (desdeFecha && (!reporte.fecha || reporte.fecha < desdeFecha)) return false
      if (hastaFecha && (!reporte.fecha || reporte.fecha > hastaFecha)) return false
      return true
    })
  }, [reportes, categoriaFiltro, texto, desde, hasta])

  const conteoPorEstado = useMemo(() => {
    const conteo: Record<string, number> = {}
    for (const estado of ESTADOS_EN_ORDEN) {
      conteo[estado] = 0
    }
    for (const reporte of reportesSinFiltroEstado) {
      conteo[reporte.estado] = (conteo[reporte.estado] ?? 0) + 1
    }
    return conteo
  }, [reportesSinFiltroEstado])

  const categoriasPresentes = useMemo(() => {
    const set = new Set(reportes.map((r) => r.categoria))
    return Array.from(set).sort((a, b) =>
      (ETIQUETA_POR_CATEGORIA[a] ?? a).localeCompare(ETIQUETA_POR_CATEGORIA[b] ?? b, 'es'),
    )
  }, [reportes])

  const reportesFiltrados = useMemo(
    () => reportesSinFiltroEstado.filter((reporte) => estadosSeleccionados.has(reporte.estado)),
    [reportesSinFiltroEstado, estadosSeleccionados],
  )

  if (!cargando && !autorizado) {
    return <Navigate to="/" replace />
  }

  // Se busca en la lista completa (no en la filtrada): si el cambio de estado
  // hace que el reporte salga del filtro, el detalle no se cierra solo.
  const reporteDetalle = detalleId ? reportes.find((r) => r.id === detalleId) ?? null : null

  // El acceso rápido activo se deduce de las fechas: si el usuario las edita
  // a mano, ninguno queda marcado.
  const hoy = new Date()
  const rangoActivo = RANGOS_RAPIDOS.find((rango) => {
    const calculado = rango.calcular(hoy)
    return calculado.desde === desde && calculado.hasta === hasta
  })?.clave

  function aplicarRango(clave: string) {
    const rango = rangoRapido(clave)
    setDesde(rango.desde)
    setHasta(rango.hasta)
  }

  function alternarEstado(estado: string) {
    setEstadosSeleccionados((prev) => {
      const siguiente = new Set(prev)
      if (siguiente.has(estado)) {
        siguiente.delete(estado)
      } else {
        siguiente.add(estado)
      }
      return siguiente
    })
  }

  return (
    <div className={styles.page}>
      <Navbar />
      <OperadorTabs />

      <div className={styles.cuerpo}>
        <aside className={styles.panel}>
          <h1 className={styles.title}>Mis reportes</h1>
          <p className={styles.subtitle}>
            Reportes asignados a tu operador. Usa los filtros para acotar lo que ves en el mapa.
          </p>

          {error && <p className={styles.error}>{error}</p>}
          {cargando && <p className={styles.hint}>Cargando…</p>}
          {!cargando && cargandoReportes && <p className={styles.hint}>Cargando reportes…</p>}

          <div className={styles.stats}>
            {ESTADOS_EN_ORDEN.map((estado) => (
              <button
                key={estado}
                type="button"
                className={`${styles.statChip} ${
                  estadosSeleccionados.has(estado) ? styles.statChipActivo : ''
                }`}
                style={{ borderColor: COLOR_POR_ESTADO[estado] }}
                onClick={() => alternarEstado(estado)}
              >
                <span className={styles.statPunto} style={{ background: COLOR_POR_ESTADO[estado] }} />
                {ETIQUETA_POR_ESTADO[estado]}
                <span className={styles.statNumero}>{conteoPorEstado[estado] ?? 0}</span>
              </button>
            ))}
          </div>

          <label className={styles.field}>
            <span className={styles.label}>Buscar</span>
            <input
              type="text"
              className={styles.input}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="Descripción o comuna…"
            />
          </label>

          <label className={styles.field}>
            <span className={styles.label}>Categoría</span>
            <select
              className={styles.input}
              value={categoriaFiltro}
              onChange={(e) => setCategoriaFiltro(e.target.value)}
            >
              <option value="">Todas</option>
              {categoriasPresentes.map((categoria) => (
                <option key={categoria} value={categoria}>
                  {ETIQUETA_POR_CATEGORIA[categoria] ?? categoria}
                </option>
              ))}
            </select>
          </label>

          <fieldset className={styles.fechas}>
            <legend className={styles.label}>Fecha</legend>
            <div className={styles.rangos}>
              {RANGOS_RAPIDOS.map((rango) => (
                <button
                  key={rango.clave}
                  type="button"
                  className={`${styles.rango} ${rangoActivo === rango.clave ? styles.rangoActivo : ''}`}
                  aria-pressed={rangoActivo === rango.clave}
                  onClick={() => aplicarRango(rango.clave)}
                >
                  {rango.etiqueta}
                </button>
              ))}
            </div>
            <label className={styles.fechaFila}>
              <span className={styles.fechaEtiqueta}>Desde</span>
              <input
                type="date"
                className={styles.input}
                value={desde}
                max={hasta || undefined}
                onChange={(e) => setDesde(e.target.value)}
              />
            </label>
            <label className={styles.fechaFila}>
              <span className={styles.fechaEtiqueta}>Hasta</span>
              <input
                type="date"
                className={styles.input}
                value={hasta}
                min={desde || undefined}
                onChange={(e) => setHasta(e.target.value)}
              />
            </label>
          </fieldset>

          <p className={styles.resumen}>
            Mostrando {reportesFiltrados.length} de {reportes.length} reportes.
          </p>
        </aside>

        <main className={styles.mapaWrap}>
          <MapContainer
            center={CENTRO_SANTIAGO}
            zoom={12}
            scrollWheelZoom
            className={styles.mapa}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {reportesFiltrados.map((reporte) => (
              <Marker
                key={reporte.id}
                position={[reporte.lat, reporte.lng]}
                icon={ICONOS_POR_ESTADO[reporte.estado] ?? ICONO_ESTADO_DESCONOCIDO}
                eventHandlers={{
                  click: () => setDetalleId(reporte.id),
                  mouseover: () => cargarConfirmaciones(reporte.id),
                }}
              >
                <Tooltip direction="top" offset={[0, -10]}>
                  {reporte.foto && (
                    <div className={styles.tooltipFoto}>
                      <FotoReporte foto={reporte.foto} inmediata />
                    </div>
                  )}
                  <strong>{ETIQUETA_POR_CATEGORIA[reporte.categoria] ?? reporte.categoria}</strong>
                  {' · '}
                  {ETIQUETA_POR_ESTADO[reporte.estado] ?? reporte.estado}
                  <br />
                  {reporte.autorNombre ?? 'Autor sin nombre'} · {formatearFecha(reporte.fecha, true)}
                  <br />
                  Confirmaciones:{' '}
                  {confirmaciones[reporte.id] === undefined || confirmaciones[reporte.id] === 'cargando'
                    ? '…'
                    : confirmaciones[reporte.id] === 'error'
                      ? '—'
                      : confirmaciones[reporte.id]}
                  <br />
                  <em>Clic para ver el detalle y la foto</em>
                </Tooltip>
              </Marker>
            ))}
          </MapContainer>
        </main>
      </div>

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
