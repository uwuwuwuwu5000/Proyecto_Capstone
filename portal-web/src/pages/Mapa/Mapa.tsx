import { Navigate } from 'react-router-dom'
import Navbar from '../../components/Navbar/Navbar'
import MapaSantiago from '../../components/Map/MapaSantiago'
import { useAuth } from '../../context/AuthContext'
import styles from './Mapa.module.css'

export default function Mapa() {
  const { user, loading } = useAuth()

  // El mapa es solo para cuentas registradas: sin sesión, al registro.
  if (!loading && !user) {
    return <Navigate to="/registro" replace />
  }

  return (
    <div className={styles.page}>
      <Navbar />
      <MapaSantiago variante="pantallaCompleta" />
    </div>
  )
}
