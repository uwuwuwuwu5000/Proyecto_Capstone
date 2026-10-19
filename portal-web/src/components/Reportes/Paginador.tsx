import { TAMANOS_PAGINA } from './useReportesPaginados'
import styles from './Reportes.module.css'

interface PaginadorProps {
  /** Página actual, desde 0. */
  pagina: number
  totalPaginas: number | null
  /** Reportes que cumplen los filtros en total (null mientras se cuenta). */
  total: number | null
  tamano: number
  /** Tarjetas en esta página. */
  enPagina: number
  hayAnterior: boolean
  haySiguiente: boolean
  cargando: boolean
  nuevos: number
  onTamano: (tamano: number) => void
  onPrimera: () => void
  onAnterior: () => void
  onSiguiente: () => void
  /** Vuelve a leer la página actual. */
  onRecargar: () => void
  /** Va a la primera página con los reportes nuevos. */
  onVerNuevos: () => void
  /** Solo uno de los paginadores de la pantalla muestra el aviso de nuevos. */
  mostrarAviso?: boolean
  idSelector: string
}

/**
 * Controles de paginación por cursor. Firestore no salta a una página
 * cualquiera, así que solo hay Primera / Anterior / Siguiente.
 */
export default function Paginador({
  pagina,
  totalPaginas,
  total,
  tamano,
  enPagina,
  hayAnterior,
  haySiguiente,
  cargando,
  nuevos,
  onTamano,
  onPrimera,
  onAnterior,
  onSiguiente,
  onRecargar,
  onVerNuevos,
  mostrarAviso = true,
  idSelector,
}: PaginadorProps) {
  const inicio = pagina * tamano + 1
  const rango =
    total === null
      ? 'Contando…'
      : total === 0
        ? 'Sin reportes'
        : `${inicio.toLocaleString('es-CL')}–${(pagina * tamano + enPagina).toLocaleString('es-CL')} de ${total.toLocaleString('es-CL')}`

  return (
    <div>
      {mostrarAviso && nuevos > 0 && (
        <p className={`${styles.mensajeLote} ${styles.mensajeAviso} ${styles.avisoNuevos}`} role="status">
          {nuevos >= 50 ? 'Más de 50 reportes nuevos' : nuevos === 1 ? '1 reporte nuevo' : `${nuevos} reportes nuevos`}
          <button type="button" className={styles.enlaceBoton} onClick={onVerNuevos}>
            Actualizar
          </button>
        </p>
      )}

      <nav className={styles.paginador} aria-label="Paginación de reportes" aria-busy={cargando}>
        <span className={styles.paginadorRango} aria-live="polite">
          {rango}
        </span>

        <div className={styles.paginadorControles}>
          <button
            type="button"
            className={`${styles.accionBoton} ${styles.paginadorPrimera}`}
            onClick={onPrimera}
            disabled={!hayAnterior || cargando}
          >
            « Primera
          </button>
          <button type="button" className={styles.accionBoton} onClick={onAnterior} disabled={!hayAnterior || cargando}>
            ‹ Anterior
          </button>
          <span className={styles.paginadorPagina} aria-current="page">
            Página {pagina + 1}
            {totalPaginas !== null && ` de ${totalPaginas.toLocaleString('es-CL')}`}
          </span>
          <button type="button" className={styles.accionBoton} onClick={onSiguiente} disabled={!haySiguiente || cargando}>
            Siguiente ›
          </button>
        </div>

        <div className={styles.paginadorOpciones}>
          <label className={styles.paginadorTamano} htmlFor={idSelector}>
            Por página
            <select
              id={idSelector}
              className={styles.entrada}
              value={tamano}
              onChange={(e) => onTamano(Number(e.target.value))}
            >
              {TAMANOS_PAGINA.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className={styles.accionBoton} onClick={onRecargar} disabled={cargando}>
            {cargando ? 'Cargando…' : '↻ Actualizar'}
          </button>
        </div>
      </nav>
    </div>
  )
}
