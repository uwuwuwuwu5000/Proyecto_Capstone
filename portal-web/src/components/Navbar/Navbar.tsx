import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import styles from './Navbar.module.css'

export default function Navbar() {
  const navigate = useNavigate()
  const { user, logout } = useAuth()

  async function handleLogout() {
    await logout()
    navigate('/', { replace: true })
  }

  return (
    <header className={styles.navbar}>
      <Link to="/" className={styles.brand}>
        <span className={styles.brandMark} aria-hidden="true">
          ◆
        </span>
        Ciudad Alerta
      </Link>

      {user ? (
        <div className={styles.session}>
          <span className={styles.greeting}>Hola, {user.email}</span>
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
    </header>
  )
}
