import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import Navbar from '../Navbar/Navbar'
import styles from './CuentaOrganismo.module.css'

/**
 * Pantalla única de una cuenta de organismo (role 'organismo').
 *
 * Esas cuentas son de solo lectura y se atienden desde la app móvil
 * («Reportes validados»). Las reglas de Firestore les niegan las consultas del
 * portal, así que en vez de dejarlas navegar entre errores de permiso se les
 * explica y se les deja cerrar la sesión. No ejecuta ninguna consulta.
 */
export default function CuentaOrganismo() {
  const { logout } = useAuth()
  const navigate = useNavigate()

  async function cerrarSesion() {
    // Igual que la barra: primero se sale de la pantalla y luego se cierra la sesión.
    navigate('/', { replace: true })
    await logout()
  }

  return (
    <>
      <Navbar />
      <main className={styles.pagina}>
        <section className={styles.tarjeta} aria-labelledby="titulo-organismo">
          <h1 id="titulo-organismo" className={styles.titulo}>
            Esta cuenta se usa desde la app móvil
          </h1>
          <p className={styles.texto}>
            Las cuentas de organismo ven los reportes validados de su comuna en la aplicación de Ciudad Alerta
            («Reportes validados»). El portal web no tiene una vista para este tipo de cuenta.
          </p>
          <button type="button" className={styles.boton} onClick={cerrarSesion}>
            Cerrar sesión
          </button>
        </section>
      </main>
    </>
  )
}
