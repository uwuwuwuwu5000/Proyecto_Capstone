import { Link } from 'react-router-dom'
import MapaSantiago from '../../components/Map/MapaSantiago'
import Navbar from '../../components/Navbar/Navbar'
import styles from './Landing.module.css'

const pasos = [
  {
    icono: '📝',
    titulo: 'Reportar',
    texto:
      'Cualquier vecino describe el problema urbano, adjunta una foto y marca dónde ocurre.',
  },
  {
    icono: '✅',
    titulo: 'Verificar',
    texto:
      'La comunidad confirma que el problema es real antes de escalarlo al organismo responsable.',
  },
  {
    icono: '🔔',
    titulo: 'Seguimiento',
    texto:
      'El reporte se enruta automáticamente y puedes seguir su estado hasta que se resuelve.',
  },
]

export default function Landing() {
  return (
    <div className={styles.page}>
      <Navbar />

      <main>
        <section className={styles.hero}>
          <h1 className={styles.heroTitle}>Ciudad Alerta</h1>
          <p className={styles.heroSubtitle}>
            Reporta, verifica y conecta con tu comunidad para resolver los
            problemas urbanos de tu barrio.
          </p>
          <Link to="/login" className={styles.cta}>
            Iniciar sesión
          </Link>
        </section>

        <section className={styles.steps}>
          {pasos.map((paso) => (
            <article key={paso.titulo} className={styles.stepCard}>
              <span className={styles.stepIcon} aria-hidden="true">
                {paso.icono}
              </span>
              <h2 className={styles.stepTitle}>{paso.titulo}</h2>
              <p className={styles.stepText}>{paso.texto}</p>
            </article>
          ))}
        </section>

        <section className={styles.mapSection}>
          <h2 className={styles.mapTitle}>Cobertura en Santiago</h2>
          <p className={styles.mapCaption}>
            Los reportes de cada comuna se ubican en el mapa para que puedas
            ver dónde están ocurriendo los problemas de tu barrio.
          </p>
          <div className={styles.mapWrapper}>
            <MapaSantiago />
          </div>
        </section>
      </main>

      <footer className={styles.footer}>
        Ciudad Alerta — inteligencia urbana comunitaria
      </footer>
    </div>
  )
}
