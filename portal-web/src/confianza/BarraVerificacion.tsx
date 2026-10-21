import { porcentajeVerificacion } from './reglas'
import type { Validacion } from './tipos'
import styles from './BarraVerificacion.module.css'

interface Props {
  validacion: Validacion
  /** Versión sin el título, para espacios reducidos. */
  compacta?: boolean
}

/** Avance de la verificación de la comunidad, con su validación y el veredicto del organismo. */
export default function BarraVerificacion({ validacion, compacta = false }: Props) {
  const pct = porcentajeVerificacion(validacion.puntos)
  return (
    <div className={styles.raiz}>
      <div className={styles.fila}>
        {!compacta && <span className={styles.titulo}>Verificación de la comunidad</span>}
        <span className={styles.pct}>{pct} %</span>
      </div>
      <div
        className={`${styles.barra} ${validacion.validado ? styles.barraValidada : ''}`}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-label="Verificación de la comunidad"
      >
        <div className={styles.relleno} style={{ width: `${pct}%` }} />
      </div>
      <div className={styles.insignias}>
        {validacion.validado && <span className={styles.validado}>✓ Validado por la comunidad</span>}
        {validacion.veredicto === 'real' && <span className={styles.real}>Confirmado como real por el organismo</span>}
        {validacion.veredicto === 'falso' && <span className={styles.falso}>Marcado como falso por el organismo</span>}
      </div>
    </div>
  )
}
