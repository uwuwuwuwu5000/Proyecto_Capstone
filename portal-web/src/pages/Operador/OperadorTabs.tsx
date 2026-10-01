import { NavLink } from 'react-router-dom'
import styles from './OperadorTabs.module.css'

/** Navegación entre las pantallas del panel de operador. */
export default function OperadorTabs() {
  const clase = ({ isActive }: { isActive: boolean }) =>
    isActive ? `${styles.tab} ${styles.tabActiva}` : styles.tab

  return (
    <nav className={styles.tabs} aria-label="Panel de operador" data-no-imprimir>
      <NavLink to="/operador" end className={clase}>
        Mapa
      </NavLink>
      <NavLink to="/operador/reportes" className={clase}>
        Reportes
      </NavLink>
      <NavLink to="/operador/estadisticas" className={clase}>
        Estadísticas
      </NavLink>
    </nav>
  )
}
