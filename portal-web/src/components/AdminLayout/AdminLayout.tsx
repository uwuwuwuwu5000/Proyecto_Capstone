import { useEffect, useState } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import Navbar from '../Navbar/Navbar'
import { useRequiereAdmin } from '../../hooks/useRequiereAdmin'
import { useSoporte } from '../../context/SoporteContext'
import { GRUPOS_ADMIN } from '../../constants/adminSecciones'
import IconoSeccion from './IconoSeccion'
import styles from './AdminLayout.module.css'

const CLAVE_COLAPSADA = 'adminBarraColapsada'

function leerColapsada(): boolean {
  try {
    return localStorage.getItem(CLAVE_COLAPSADA) === '1'
  } catch {
    return false
  }
}

/**
 * Marco del panel de administración: el navbar de siempre arriba, la barra
 * lateral con todas las secciones a la izquierda y la pantalla a la derecha.
 * Solo se dibuja la barra para administradores; cada pantalla sigue
 * resolviendo su propio acceso.
 */
export default function AdminLayout() {
  const { autorizado } = useRequiereAdmin()
  const { abiertos } = useSoporte()
  const { pathname } = useLocation()
  const [colapsada, setColapsada] = useState(leerColapsada)
  const [abierta, setAbierta] = useState(false) // cajón en teléfono

  // Al navegar, el cajón del teléfono se cierra.
  useEffect(() => setAbierta(false), [pathname])

  function alternar() {
    setColapsada((previa) => {
      try {
        localStorage.setItem(CLAVE_COLAPSADA, previa ? '0' : '1')
      } catch {
        // sin almacenamiento: la preferencia vale solo para esta visita
      }
      return !previa
    })
  }

  if (!autorizado) {
    return (
      <>
        <Navbar />
        <Outlet />
      </>
    )
  }

  const rutas = ['/admin', ...GRUPOS_ADMIN.flatMap((g) => g.secciones.map((s) => s.ruta))]
  // La sección activa es la ruta más larga que encaja ("/admin/reportes/nuevo" no enciende "/admin/reportes").
  const activa = rutas
    .filter((r) => pathname === r || pathname.startsWith(`${r}/`))
    .sort((a, b) => b.length - a.length)[0]

  const enlace = (ruta: string, titulo: string, insignia?: number | null) => (
    <Link
      key={ruta}
      to={ruta}
      className={`${styles.item} ${ruta === activa ? styles.itemActivo : ''}`}
      aria-current={ruta === activa ? 'page' : undefined}
      title={colapsada ? titulo : undefined}
    >
      <span className={styles.icono}>
        <IconoSeccion ruta={ruta} />
      </span>
      <span className={styles.titulo}>{titulo}</span>
      {!!insignia && (
        <span className={styles.insignia} aria-label={`${insignia} sin atender`}>
          {insignia}
        </span>
      )}
    </Link>
  )

  return (
    <div className={styles.marco}>
      <Navbar />
      <div className={`${styles.cuerpo} ${colapsada ? styles.cuerpoColapsado : ''}`}>
        <button
          type="button"
          className={styles.botonCajon}
          onClick={() => setAbierta(true)}
          aria-expanded={abierta}
          aria-controls="barra-admin"
        >
          ☰ Secciones
        </button>
        {abierta && <div className={styles.telon} onClick={() => setAbierta(false)} aria-hidden="true" />}

        <aside
          id="barra-admin"
          className={`${styles.barra} ${abierta ? styles.barraAbierta : ''}`}
          aria-label="Secciones del panel"
        >
          <nav className={styles.nav}>
            {enlace('/admin', 'Resumen')}
            {GRUPOS_ADMIN.map((grupo) => (
              <div key={grupo.titulo} className={styles.grupo}>
                <p className={styles.grupoTitulo}>{grupo.titulo}</p>
                {grupo.secciones.map((s) =>
                  enlace(s.ruta, s.titulo, s.ruta === '/admin/soporte' ? abiertos : undefined),
                )}
              </div>
            ))}
          </nav>
          <button
            type="button"
            className={styles.colapsar}
            onClick={alternar}
            aria-pressed={colapsada}
            title={colapsada ? 'Expandir menú' : 'Contraer menú'}
            aria-label={colapsada ? 'Expandir menú' : 'Contraer menú'}
          >
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d={colapsada ? 'm9 6 6 6-6 6' : 'm15 6-6 6 6 6'} />
            </svg>
          </button>
        </aside>

        <div className={styles.contenido}>
          <Outlet />
        </div>
      </div>
    </div>
  )
}
