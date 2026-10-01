import styles from './Carga.module.css'

/**
 * Se muestra mientras se descarga el código de una página. Aparece con un
 * pequeño retraso (ver CSS) para no parpadear cuando la descarga es rápida.
 */
export default function CargandoPagina({ alto = 'pagina' }: { alto?: 'pagina' | 'bloque' }) {
  return (
    <div
      className={alto === 'pagina' ? styles.pagina : styles.bloque}
      role="status"
      aria-live="polite"
    >
      <span className={styles.spinner} aria-hidden="true" />
      <span>Cargando…</span>
    </div>
  )
}
