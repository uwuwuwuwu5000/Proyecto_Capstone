import { NavLink, useLocation } from 'react-router-dom'
import styles from './OperadorTabs.module.css'

/** Navegación entre las pantallas del panel de operador. */
export default function OperadorTabs() {
  const { pathname, search } = useLocation()
  const clase = ({ isActive }: { isActive: boolean }) =>
    isActive ? `${styles.tab} ${styles.tabActiva}` : styles.tab

  // «Reportes» y «Por verificar» son la misma pantalla con otro filtro: se
  // distinguen por la URL, no por la ruta.
  const porVerificar = pathname === '/operador/reportes' && search.includes('verificacion=por_verificar')
  const claseExtra = (activa: boolean) => (activa ? `${styles.tab} ${styles.tabActiva}` : styles.tab)

  return (
    <nav className={styles.tabs} aria-label="Panel de operador" data-no-imprimir>
      <NavLink to="/operador" end className={clase}>
        Mapa
      </NavLink>
      <NavLink
        to="/operador/reportes"
        className={() => claseExtra(pathname === '/operador/reportes' && !porVerificar)}
      >
        Reportes
      </NavLink>
      <NavLink
        to="/operador/reportes?verificacion=por_verificar"
        className={() => claseExtra(porVerificar)}
      >
        Por verificar
      </NavLink>
      <NavLink to="/operador/estadisticas" className={clase}>
        Estadísticas
      </NavLink>
    </nav>
  )
}
