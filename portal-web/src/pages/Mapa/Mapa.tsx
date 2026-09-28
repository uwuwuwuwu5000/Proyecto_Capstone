import Navbar from '../../components/Navbar/Navbar'
import MapaSantiago from '../../components/Map/MapaSantiago'
import styles from './Mapa.module.css'

export default function Mapa() {
  return (
    <div className={styles.page}>
      <Navbar />
      <MapaSantiago variante="pantallaCompleta" />
    </div>
  )
}
