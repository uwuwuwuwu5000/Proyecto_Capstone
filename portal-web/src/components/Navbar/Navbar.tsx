import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import styles from './Navbar.module.css'

export default function Navbar() {
  const navigate = useNavigate()
  const { user, perfil, logout } = useAuth()

  async function handleLogout() {
    await logout()
    navigate('/', { replace: true })
  }

  return (
    <header className={styles.navbar} data-no-imprimir>
      <Link to="/" className={styles.brand}>
        <span className={styles.brandMark} aria-hidden="true">
          ◆
        </span>
        Ciudad Alerta
      </Link>

      <div className={styles.right}>
        {user && (
          <Link to="/mapa" className={styles.navLink}>
          Mapas
        </Link>
        )}

        {user && (
          <Link to="/historial" className={styles.navLink}>
            Historial
          </Link>
        )}

        {perfil?.role === 'admin' && (
          <Link to="/admin" className={styles.adminButton}>
            Panel de administración
          </Link>
        )}

        {perfil?.role === 'operador' && (
          <Link to="/operador" className={styles.adminButton}>
            Panel de operador
          </Link>
        )}

        {user ? (
          <div className={styles.session}>
            <span className={styles.greeting}>Hola, {perfil?.displayName ?? user.email}</span>
            <button
              type="button"
              className={styles.logoutButton}
              onClick={handleLogout}
            >
              Cerrar sesión
            </button>
          </div>
        ) : (
          <button
            type="button"
            className={styles.loginButton}
            onClick={() => navigate('/login')}
          >
            Iniciar sesión
          </button>
        )}
      </div>
    </header>
  )
}
