import { Link, Navigate } from 'react-router-dom'
import Navbar from '../../components/Navbar/Navbar'
import { useRequiereAdmin } from '../../hooks/useRequiereAdmin'
import styles from './Admin.module.css'

export default function Admin() {
  const { cargando, autorizado } = useRequiereAdmin()

  // Panel exclusivo para administradores — cualquier otro caso, a la Landing.
  if (!cargando && !autorizado) {
    return <Navigate to="/" replace />
  }

  return (
    <div className={styles.page}>
      <Navbar />

      <main className={styles.main}>
        <div>
          <h1 className={styles.title}>Panel de administración</h1>
          <p className={styles.subtitle}>Elige qué quieres gestionar.</p>
        </div>

        <div className={styles.opciones}>
          <Link to="/admin/organismos" className={styles.opcion}>
            <span className={styles.opcionIcono} aria-hidden="true">
              🏛️
            </span>
            <span className={styles.opcionTitulo}>Organismos activos</span>
            <span className={styles.opcionTexto}>
              Activa o desactiva municipalidades del catálogo y edita su zona de cobertura.
            </span>
          </Link>

          <Link to="/admin/operadores" className={styles.opcion}>
            <span className={styles.opcionIcono} aria-hidden="true">
              ➕
            </span>
            <span className={styles.opcionTitulo}>Crear operador</span>
            <span className={styles.opcionTexto}>
              Busca el organismo responsable por comuna y da de alta al operador a su cargo.
            </span>
          </Link>

          <Link to="/admin/cuentas" className={styles.opcion}>
            <span className={styles.opcionIcono} aria-hidden="true">
              🔑
            </span>
            <span className={styles.opcionTitulo}>Crear cuenta de organismo</span>
            <span className={styles.opcionTexto}>
              Da de alta el acceso de un operador ya activado.
            </span>
          </Link>

          <Link to="/admin/reportes" className={styles.opcion}>
            <span className={styles.opcionIcono} aria-hidden="true">
              🗂️
            </span>
            <span className={styles.opcionTitulo}>Administrar reportes</span>
            <span className={styles.opcionTexto}>
              Revisa, edita o elimina reportes y vincúlalos con su operador.
            </span>
          </Link>

          <Link to="/admin/categorias" className={styles.opcion}>
            <span className={styles.opcionIcono} aria-hidden="true">
              🏷️
            </span>
            <span className={styles.opcionTitulo}>Categorías</span>
            <span className={styles.opcionTexto}>
              Crea, edita, ordena y activa o desactiva las categorías de los reportes.
            </span>
          </Link>
        </div>
      </main>
    </div>
  )
}
