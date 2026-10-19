import styles from './PaginadorPaginas.module.css'

interface PaginadorPaginasProps {
  /** Página actual, desde 0. */
  pagina: number
  totalPaginas: number
  /** Filas que cumplen los filtros, en total. */
  total: number
  tamano: number
  /** Tamaños de página disponibles; si se entrega junto con `onTamano`, se muestra el selector. */
  tamanos?: number[]
  onTamano?: (tamano: number) => void
  /** Identificador del selector (único en la pantalla). */
  idSelector?: string
  /** Nombre de la navegación para lectores de pantalla («Paginación de organismos»). */
  etiqueta: string
  onCambiar: (pagina: number) => void
}

/**
 * Barra de páginas para listas que ya están en memoria (a diferencia del
 * paginador de reportes, que pide cada página a Firestore con cursores): permite
 * saltar a la primera y a la última. No se dibuja si todo cabe en la página más
 * pequeña; si cabe en la elegida pero no en la menor, queda el selector para volver.
 */
export default function PaginadorPaginas({
  pagina,
  totalPaginas,
  total,
  tamano,
  tamanos,
  onTamano,
  idSelector = 'filas-por-pagina',
  etiqueta,
  onCambiar,
}: PaginadorPaginasProps) {
  const menor = tamanos?.length ? Math.min(...tamanos) : tamano
  if (total <= menor) return null
  const inicio = pagina * tamano + 1
  const fin = Math.min(total, (pagina + 1) * tamano)
  const formato = (n: number) => n.toLocaleString('es-CL')

  return (
    <nav className={styles.paginador} aria-label={etiqueta}>
      <span className={styles.rango} aria-live="polite">
        {formato(inicio)}–{formato(fin)} de {formato(total)}
      </span>

      {totalPaginas > 1 && (
        <div className={styles.controles}>
          <button
            type="button"
            className={styles.boton}
            onClick={() => onCambiar(0)}
            disabled={pagina === 0}
            aria-label="Primera página"
          >
            «<span className={styles.texto}> Primera</span>
          </button>
          <button
            type="button"
            className={styles.boton}
            onClick={() => onCambiar(pagina - 1)}
            disabled={pagina === 0}
            aria-label="Página anterior"
          >
            ‹<span className={styles.texto}> Anterior</span>
          </button>
          <span className={styles.pagina} aria-current="page">
            Página {formato(pagina + 1)} de {formato(totalPaginas)}
          </span>
          <button
            type="button"
            className={styles.boton}
            onClick={() => onCambiar(pagina + 1)}
            disabled={pagina >= totalPaginas - 1}
            aria-label="Página siguiente"
          >
            <span className={styles.texto}>Siguiente </span>›
          </button>
          <button
            type="button"
            className={styles.boton}
            onClick={() => onCambiar(totalPaginas - 1)}
            disabled={pagina >= totalPaginas - 1}
            aria-label="Última página"
          >
            <span className={styles.texto}>Última </span>»
          </button>
        </div>
      )}

      {tamanos && onTamano && (
        <label className={styles.tamano} htmlFor={idSelector}>
          Por página
          <select
            id={idSelector}
            className={styles.selector}
            value={tamano}
            onChange={(e) => onTamano(Number(e.target.value))}
          >
            {tamanos.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      )}
    </nav>
  )
}
