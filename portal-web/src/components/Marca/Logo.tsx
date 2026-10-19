import styles from './Logo.module.css'

/** Marca de Ciudad Alerta: pin dentro de un cuadrado, nombre en dos tonos y lema. */
export default function Logo() {
  return (
    <span className={styles.marca}>
      <span className={styles.icono} aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 21.5s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11Z" />
          <circle cx="12" cy="10.5" r="2.6" />
        </svg>
      </span>
      <span className={styles.textos}>
        <span className={styles.nombre}>
          Ciudad<span className={styles.acento}>Alerta</span>
        </span>
        <span className={styles.lema}>Plataforma comunitaria</span>
      </span>
    </span>
  )
}
