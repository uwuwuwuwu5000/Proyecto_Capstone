import type { Validacion } from './tipos'
import styles from './InsigniasReporte.module.css'

/**
 * Insignias de verificación para las tarjetas y tablas: «Validado» cuando la
 * comunidad lo validó, y el veredicto del organismo si ya lo dio. Sin nada
 * que mostrar, no ocupa espacio.
 */
export default function InsigniasReporte({ validacion }: { validacion: Validacion }) {
  if (!validacion.validado && !validacion.veredicto) return null
  return (
    <div className={styles.fila}>
      {validacion.validado && <span className={styles.validado}>✓ Validado por la comunidad</span>}
      {validacion.validado && !validacion.veredicto && <span className={styles.pendiente}>Falta veredicto</span>}
      {validacion.veredicto === 'real' && <span className={styles.real}>Real</span>}
      {validacion.veredicto === 'falso' && <span className={styles.falso}>Falso</span>}
    </div>
  )
}
