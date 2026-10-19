import { Link } from 'react-router-dom'
import type { ReactNode } from 'react'
import Navbar from '../../components/Navbar/Navbar'
import Logo from '../../components/Marca/Logo'
import { useAuth } from '../../context/AuthContext'
import {
  IconoPaso,
  IlustracionMapa,
  IlustracionMunicipio,
  IlustracionReportar,
  IlustracionSeguimiento,
  IlustracionVerificar,
  NodoRadar,
} from './ilustraciones'
import { useAparicion } from './useAparicion'
import styles from './Landing.module.css'

// Correo de contacto PROVISIONAL (dominio reservado .example: no existe). Reemplazar por
// el real cuando haya un canal de contacto; los botones de contacto ya apuntan aquí.
const CORREO_CONTACTO = 'contacto@ciudadalerta.example'
const ENLACE_CONTACTO = `mailto:${CORREO_CONTACTO}?subject=${encodeURIComponent('Contacto desde Ciudad Alerta')}`

const PASOS: { tipo: 'reporta' | 'comunidad' | 'municipio' | 'avance'; titulo: string; texto: string }[] = [
  {
    tipo: 'reporta',
    titulo: 'Cuéntanos qué pasa',
    texto: 'Toma una foto, ubica el lugar y envía tu reporte en menos de un minuto.',
  },
  {
    tipo: 'comunidad',
    titulo: 'Tu comunidad lo verifica',
    texto: 'Otros vecinos confirman que el problema es real. Cada confirmación ayuda a priorizar.',
  },
  {
    tipo: 'municipio',
    titulo: 'Lo recibe tu municipio',
    texto: 'Tu solicitud llega al equipo indicado para que pueda actuar más rápido.',
  },
  {
    tipo: 'avance',
    titulo: 'Mira cómo mejora',
    texto: 'Sigue cada cambio de estado hasta que el problema quede resuelto.',
  },
]

const BENEFICIOS_MUNICIPIO = [
  'Centraliza todos los reportes',
  'Prioriza con datos reales',
  'Comunica cada avance',
]

function Flecha() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  )
}

function Sobre() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3.5 7 8.5 6 8.5-6" />
    </svg>
  )
}

function Visto() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <circle cx="12" cy="12" r="10" className={styles.rl} />
      <path d="m7.5 12.5 3 3 6-7" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className={styles.vistoTrazo} />
    </svg>
  )
}

/** Etiqueta sobre cada título: número de sección y tema. */
function Sobretitulo({ numero, children }: { numero?: string; children: ReactNode }) {
  return (
    <p className={styles.sobretitulo}>
      {numero ? <span className={styles.numero}>{numero}</span> : <NodoRadar />}
      {children}
    </p>
  )
}

/**
 * Una sección en dos columnas. Escritorio: `textoIzquierda` pone el texto a la izquierda.
 * Teléfono: una columna; la ilustración va primero salvo que `medioPrimeroEnMovil` sea false.
 */
function Fila({
  id,
  textoIzquierda = false,
  medioPrimeroEnMovil = true,
  conMarco = true,
  medio,
  children,
}: {
  id?: string
  textoIzquierda?: boolean
  medioPrimeroEnMovil?: boolean
  conMarco?: boolean
  medio: (visible: boolean) => ReactNode
  children: ReactNode
}) {
  const { ref, visible } = useAparicion<HTMLDivElement>()
  const contenidoMedio = (
    <div
      className={`${conMarco ? styles.marco : styles.lado} ${medioPrimeroEnMovil ? styles.medioPrimero : ''}`}
    >
      {medio(visible)}
    </div>
  )
  const contenidoTexto = <div className={styles.texto}>{children}</div>
  return (
    <section className={styles.seccion} id={id}>
      <div ref={ref} className={`${styles.fila} ${styles.revelar} ${visible ? styles.visible : ''}`}>
        {textoIzquierda ? (
          <>
            {contenidoTexto}
            {contenidoMedio}
          </>
        ) : (
          <>
            {contenidoMedio}
            {contenidoTexto}
          </>
        )}
      </div>
    </section>
  )
}

export default function Landing() {
  const { user, perfil, loading } = useAuth()
  const mapa = useAparicion<HTMLDivElement>()
  // El mapa es solo para cuentas registradas: sin sesión, los enlaces llevan al registro.
  const rutaMapa = user ? '/mapa' : '/registro'
  const municipal = useAparicion<HTMLDivElement>()
  const banda = useAparicion<HTMLDivElement>()

  // Accesos del primer bloque: sin sesión, para empezar; con sesión, el mapa y su panel.
  const accesoPropio =
    perfil?.role === 'admin'
      ? { ruta: '/admin', texto: 'Panel de administración' }
      : perfil?.role === 'operador'
        ? { ruta: '/operador', texto: 'Panel de operador' }
        : { ruta: '/historial', texto: 'Mis reportes' }

  return (
    <div className={styles.page}>
      <Navbar />

      <main>
        {/* Inicio */}
        <Fila textoIzquierda medio={() => <IlustracionReportar />}>
          <Sobretitulo>Tu ciudad, en tus manos</Sobretitulo>
          <h1 className={styles.titulo}>
            Hagamos de nuestro barrio <span className={styles.acento}>un lugar mejor.</span>
          </h1>
          <p className={styles.parrafo}>
            Reporta lo que necesita atención, conecta con tu comunidad y sé parte activa del cambio.
          </p>
          {/* Mientras se resuelve la sesión no se muestran botones, para no parpadear. */}
          {!loading && (
            <div className={styles.botones}>
              {user ? (
                <>
                  <Link to="/mapa" className={styles.cta}>
                    Ir al mapa <Flecha />
                  </Link>
                  <Link to={accesoPropio.ruta} className={styles.ctaSecundario}>
                    {accesoPropio.texto}
                  </Link>
                </>
              ) : (
                <>
                  <Link to="/registro" className={styles.cta}>
                    Crear cuenta <Flecha />
                  </Link>
                  <Link to="/login" className={styles.ctaSecundario}>
                    Iniciar sesión
                  </Link>
                </>
              )}
            </div>
          )}
        </Fila>

        {/* 01 · Así de simple */}
        <Fila
          id="como-funciona"
          textoIzquierda
          conMarco={false}
          medioPrimeroEnMovil={false}
          medio={() => (
            <ol className={styles.pasos}>
              {PASOS.map((paso, i) => (
                <li key={paso.tipo} className={styles.paso}>
                  <span className={styles.pasoNumero}>{String(i + 1).padStart(2, '0')}</span>
                  <span className={styles.pasoIcono}>
                    <IconoPaso tipo={paso.tipo} />
                  </span>
                  <h3 className={styles.pasoTitulo}>{paso.titulo}</h3>
                  <p className={styles.pasoTexto}>{paso.texto}</p>
                </li>
              ))}
            </ol>
          )}
        >
          <Sobretitulo numero="01">Así de simple</Sobretitulo>
          <h2 className={styles.subtitulo}>
            Pequeñas acciones. <span className={styles.acento}>Grandes cambios.</span>
          </h2>
          <p className={styles.parrafo}>
            Ciudad Alerta convierte la mirada de cada vecino en información útil para construir barrios
            más seguros, limpios y conectados.
          </p>
          <Link to={user ? '/mapa' : '/registro'} className={styles.enlaceFlecha}>
            Quiero participar <Flecha />
          </Link>
        </Fila>

        {/* 02 · La comunidad confirma */}
        <Fila medio={() => <IlustracionVerificar />}>
          <Sobretitulo numero="02">La comunidad confirma</Sobretitulo>
          <h2 className={styles.subtitulo}>
            Lo que ves, <span className={styles.acento}>importa.</span>
          </h2>
          <p className={styles.parrafo}>
            Si viste el mismo problema, confírmalo. Cada confirmación ayuda a priorizar lo que de verdad
            le importa a tu barrio.
          </p>
          <Link to={rutaMapa} className={styles.enlaceFlecha}>
            Ver reportes cercanos <Flecha />
          </Link>
        </Fila>

        {/* 03 · Seguimiento */}
        <Fila textoIzquierda medio={(visible) => <IlustracionSeguimiento encendida={visible} />}>
          <Sobretitulo numero="03">Seguimiento</Sobretitulo>
          <h2 className={styles.subtitulo}>
            Cada reporte, <span className={styles.acento}>hasta resolverse.</span>
          </h2>
          <p className={styles.parrafo}>
            Mira cada cambio de estado, desde que lo envías hasta que queda resuelto: reportado, en
            revisión, derivado, en proceso, resuelto y cerrado.
          </p>
        </Fila>

        {/* 04 · El mapa */}
        <section className={`${styles.seccion} ${styles.seccionMapa}`}>
          <div
            ref={mapa.ref}
            className={`${styles.centro} ${styles.revelar} ${mapa.visible ? styles.visible : ''}`}
          >
            <Sobretitulo numero="04">El mapa</Sobretitulo>
            <h2 className={styles.subtitulo}>Mira qué pasa en tu ciudad</h2>
            <p className={`${styles.parrafo} ${styles.parrafoCentro}`}>
              Todos los reportes en un mapa, con colores según su estado.
            </p>
            <div className={`${styles.marco} ${styles.marcoMapa}`}>
              <IlustracionMapa />
            </div>
            <Link to={rutaMapa} className={styles.cta}>
              {user ? 'Ir al mapa' : 'Crear cuenta para ver el mapa'} <Flecha />
            </Link>
          </div>
        </section>

        {/* 05 · Municipios */}
        <section className={styles.seccion} id="municipal">
          <div
            ref={municipal.ref}
            className={`${styles.fila} ${styles.revelar} ${municipal.visible ? styles.visible : ''}`}
          >
            <div className={`${styles.marco} ${styles.medioPrimero}`}>
              <IlustracionMunicipio />
            </div>
            <div className={styles.texto}>
              <Sobretitulo numero="05">Para gobiernos locales</Sobretitulo>
              <h2 className={styles.subtitulo}>
                ¿Eres <span className={styles.acento}>municipal?</span>
              </h2>
              <p className={styles.parrafo}>
                Escucha mejor a tu comunidad, organiza las solicitudes por área y muestra el impacto de
                tu gestión con una herramienta hecha para tu ciudad.
              </p>
              <ul className={styles.beneficios}>
                {BENEFICIOS_MUNICIPIO.map((b) => (
                  <li key={b}>
                    <Visto />
                    {b}
                  </li>
                ))}
              </ul>
              <a href={ENLACE_CONTACTO} className={styles.cta}>
                Conversemos <Flecha />
              </a>
            </div>
          </div>
        </section>

        {/* Cierre */}
        <section className={styles.seccion}>
          <div
            ref={banda.ref}
            className={`${styles.banda} ${styles.revelar} ${banda.visible ? styles.visible : ''}`}
          >
            <div>
              <p className={styles.bandaSobre}>Para comunidades y municipios</p>
              <h2 className={styles.bandaTitulo}>La próxima mejora empieza contigo.</h2>
            </div>
            <div className={styles.bandaTexto}>
              <p>
                ¿Tienes preguntas, quieres sumar tu municipio o necesitas ayuda? Estamos para
                escucharte.
              </p>
              <a href={ENLACE_CONTACTO} className={styles.botonClaro}>
                Contáctanos <Sobre />
              </a>
            </div>
          </div>
        </section>
      </main>

      <footer className={styles.footer}>
        <div className={styles.footerContenido}>
          <div className={styles.footerSuperior}>
            <Logo />
            <p className={styles.footerLema}>
              La ciudad que queremos
              <br />
              se construye entre todos.
            </p>
          </div>

          <nav className={styles.footerColumnas} aria-label="Pie de página">
            <div>
              <h2 className={styles.footerTitulo}>Explora</h2>
              <a href="#como-funciona">Cómo funciona</a>
              <Link to={rutaMapa}>Ver reportes</Link>
            </div>
            <div>
              <h2 className={styles.footerTitulo}>Conecta</h2>
              <a href="#municipal">Soy municipal</a>
              <a href={ENLACE_CONTACTO}>Contáctanos</a>
            </div>
          </nav>

          <div className={styles.footerInferior}>
            <span>© {new Date().getFullYear()} Ciudad Alerta</span>
            <span>Hecho para ciudades más humanas.</span>
          </div>
        </div>
      </footer>
    </div>
  )
}
