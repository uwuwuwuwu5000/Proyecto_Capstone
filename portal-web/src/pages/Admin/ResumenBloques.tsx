import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { collection, limit, onSnapshot, orderBy, query } from 'firebase/firestore'
import { db } from '../../firebase/config'
import { COLOR_POR_ESTADO, ESTADOS_EN_ORDEN, ETIQUETA_POR_ESTADO } from '../../constants/reportes'
import { useCategorias } from '../../context/CategoriasContext'
import { mapearReporte } from '../../components/Reportes/reporte'
import type { Reporte } from '../../components/Reportes/reporte'
import { EstadoPildora } from '../../components/Reportes/TarjetaReporte'
import DetalleReporte from '../../components/Reportes/DetalleReporte'
import IconoSeccion from '../../components/AdminLayout/IconoSeccion'
import styles from './Resumen.module.css'

function Flecha() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M7 17 17 7M8 7h9v9" />
    </svg>
  )
}

// ---------------------------------------------------------------------------
// A. Alertas: lo que requiere una acción
// ---------------------------------------------------------------------------

export interface AlertaResumen {
  clave: string
  cantidad: number
  texto: string
  ruta: string
  accion: string
}

/** Franja de alertas; solo muestra las que tienen algo pendiente. */
export function Alertas({ alertas, cargando }: { alertas: AlertaResumen[]; cargando: boolean }) {
  const activas = alertas.filter((a) => a.cantidad > 0)
  if (cargando) return null
  return (
    <section className={styles.alertas} aria-label="Alertas">
      {activas.length === 0 ? (
        <p className={styles.alertaOk}>
          <span aria-hidden="true">✓</span> Todo al día: no hay nada que requiera tu atención.
        </p>
      ) : (
        activas.map((a) => (
          <Link key={a.clave} to={a.ruta} className={styles.alerta}>
            <span className={styles.alertaCantidad}>{a.cantidad.toLocaleString('es-CL')}</span>
            <span className={styles.alertaTexto}>{a.texto}</span>
            <span className={styles.alertaAccion}>
              {a.accion} <Flecha />
            </span>
          </Link>
        ))
      )}
    </section>
  )
}

// ---------------------------------------------------------------------------
// B. Estado de los reportes
// ---------------------------------------------------------------------------

export function EstadoReportes({
  conteos,
}: {
  conteos: Record<string, number> | null | undefined
}) {
  const total = conteos ? Object.values(conteos).reduce((s, n) => s + n, 0) : 0
  // Cerrado es el estado final del caso, haya pasado o no por «Resuelto».
  const cerrados = conteos?.cerrado ?? 0
  const porcentaje = total > 0 ? Math.round((cerrados / total) * 100) : 0

  return (
    <section className={styles.panel} aria-labelledby="estado-reportes">
      <p className={styles.sobretitulo}>Seguimiento</p>
      <h2 id="estado-reportes" className={styles.panelTitulo}>
        Estado de los reportes
      </h2>

      {conteos === undefined && <p className={styles.panelNota}>Cargando…</p>}
      {conteos === null && <p className={styles.panelNota}>No pudimos cargar los conteos.</p>}
      {conteos && total === 0 && <p className={styles.panelNota}>Todavía no hay reportes.</p>}

      {conteos && total > 0 && (
        <>
          <p className={styles.resolucion}>
            <span className={styles.resolucionValor}>{porcentaje}%</span>
            <span className={styles.resolucionTexto}>
              cerrados · {cerrados.toLocaleString('es-CL')} de {total.toLocaleString('es-CL')}{' '}
              reportes
            </span>
          </p>

          <div className={styles.barra} role="img" aria-label="Distribución de reportes por estado">
            {ESTADOS_EN_ORDEN.filter((e) => conteos[e] > 0).map((e) => (
              <span
                key={e}
                className={styles.barraTramo}
                style={{ width: `${(conteos[e] / total) * 100}%`, background: COLOR_POR_ESTADO[e] }}
                title={`${ETIQUETA_POR_ESTADO[e]}: ${conteos[e]}`}
              />
            ))}
          </div>

          <ul className={styles.leyenda}>
            {ESTADOS_EN_ORDEN.map((e) => (
              <li key={e}>
                <Link to={`/admin/reportes?estado=${e}`} className={styles.leyendaItem}>
                  <span
                    className={styles.leyendaPunto}
                    style={{ background: COLOR_POR_ESTADO[e] }}
                  />
                  <span className={styles.leyendaNombre}>{ETIQUETA_POR_ESTADO[e]}</span>
                  <span className={styles.leyendaValor}>{conteos[e].toLocaleString('es-CL')}</span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}

// ---------------------------------------------------------------------------
// D. Actividad reciente
// ---------------------------------------------------------------------------

const ACTIVIDAD_MAXIMA = 6

/** "Ahora", "hace 12 min", "hace 3 h", "hace 2 d". */
function haceTiempo(fecha: Date | null): string {
  if (!fecha) return 'Ahora'
  const minutos = Math.max(0, Math.round((Date.now() - fecha.getTime()) / 60_000))
  if (minutos < 1) return 'Ahora'
  if (minutos < 60) return `hace ${minutos} min`
  if (minutos < 1440) return `hace ${Math.floor(minutos / 60)} h`
  return `hace ${Math.floor(minutos / 1440)} d`
}

/** Los últimos reportes, en vivo. */
export function ActividadReciente({
  activo,
  nombreOperador,
  alCerrarDetalle,
}: {
  activo: boolean
  nombreOperador: (operadorId: string | null) => string | null
  /** El detalle permite cambiar estados: el Resumen vuelve a leer sus conteos al cerrarlo. */
  alCerrarDetalle: () => void
}) {
  const { etiqueta } = useCategorias()
  const [reportes, setReportes] = useState<Reporte[] | null>(null)
  const [error, setError] = useState(false)
  // Reporte abierto en el detalle; se toma de la lista en vivo para que refleje los cambios.
  const [abierto, setAbierto] = useState<Reporte | null>(null)
  // El botón que abrió el detalle: al cerrarlo, el foco vuelve a él.
  const disparador = useRef<HTMLElement | null>(null)
  const reporteDetalle = abierto ? (reportes?.find((r) => r.id === abierto.id) ?? abierto) : null

  useEffect(() => {
    if (!activo) return
    return onSnapshot(
      query(collection(db, 'reports'), orderBy('createdAt', 'desc'), limit(ACTIVIDAD_MAXIMA)),
      (snapshot) => {
        setReportes(snapshot.docs.map((d) => mapearReporte(d)))
        setError(false)
      },
      (err) => {
        console.error('Error al leer la actividad reciente:', err)
        setError(true)
      },
    )
  }, [activo])

  return (
    <section className={styles.panel} aria-labelledby="actividad-reciente">
      <p className={styles.sobretitulo}>Seguimiento en tiempo real</p>
      <h2 id="actividad-reciente" className={styles.panelTitulo}>
        Actividad reciente
      </h2>

      {error && <p className={styles.panelNota}>No pudimos cargar la actividad.</p>}
      {!error && reportes === null && <p className={styles.panelNota}>Cargando…</p>}
      {reportes && reportes.length === 0 && (
        <p className={styles.panelNota}>Todavía no hay reportes.</p>
      )}

      {reportes && reportes.length > 0 && (
        <ul className={styles.actividad}>
          {reportes.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                className={styles.actividadItem}
                onClick={(e) => {
                  disparador.current = e.currentTarget
                  setAbierto(r)
                }}
              >
                <span className={styles.actividadCuerpo}>
                  <span className={styles.actividadTitulo}>{etiqueta(r.categoria)}</span>
                  <span className={styles.actividadDetalle}>
                    {r.comuna || 'Sin comuna'} · {haceTiempo(r.fecha)}
                  </span>
                </span>
                <EstadoPildora estado={r.estado} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <Link to="/admin/reportes" className={styles.panelEnlace}>
        Ver todos los reportes <Flecha />
      </Link>

      {reporteDetalle && (
        <DetalleReporte
          reporte={reporteDetalle}
          operadorNombre={nombreOperador(reporteDetalle.operadorId)}
          onCerrar={() => {
            setAbierto(null)
            alCerrarDetalle()
            disparador.current?.focus()
          }}
          gestionable
        />
      )}
    </section>
  )
}

// ---------------------------------------------------------------------------
// Accesos rápidos (compactos). Prueba: si no aportan, se borra este bloque y su
// uso en Admin.tsx.
// ---------------------------------------------------------------------------

const ACCESOS: { ruta: string; titulo: string }[] = [
  { ruta: '/admin/reportes', titulo: 'Administrar reportes' },
  { ruta: '/admin/reportes/nuevo', titulo: 'Crear reporte' },
  { ruta: '/admin/estadisticas', titulo: 'Estadísticas' },
  { ruta: '/admin/soporte', titulo: 'Soporte' },
]

export function AccesosRapidos() {
  return (
    <nav className={styles.accesos} aria-label="Accesos rápidos">
      <span className={styles.sobretitulo}>Accesos rápidos</span>
      {ACCESOS.map((a) => (
        <Link key={a.ruta} to={a.ruta} className={styles.acceso}>
          <IconoSeccion ruta={a.ruta} tamano={16} />
          {a.titulo}
        </Link>
      ))}
    </nav>
  )
}
