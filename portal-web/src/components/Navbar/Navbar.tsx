import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { GRUPOS_ADMIN } from '../../constants/adminSecciones'
import styles from './Navbar.module.css'

const ETIQUETA_ROL: Record<string, string> = {
  admin: 'Administrador',
  operador: 'Operador',
  ciudadano: 'Ciudadano',
}

/** "Municipalidad de Pudahuel" → "MP"; sin nombre, la inicial del correo. */
function iniciales(nombre: string | null, correo: string | null): string {
  const palabras = (nombre ?? '').split(/\s+/).filter((p) => p.length > 2)
  if (palabras.length > 0) {
    return palabras
      .slice(0, 2)
      .map((p) => p[0])
      .join('')
      .toUpperCase()
  }
  return (correo?.[0] ?? '?').toUpperCase()
}

function IconoAdmin() {
  return (
    <svg className={styles.icono} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm8.94-2.5.06-1-.06-1 2.03-1.58-1.92-3.32-2.39.96a7.6 7.6 0 0 0-1.73-1l-.36-2.56h-3.84l-.36 2.56c-.62.25-1.2.59-1.73 1l-2.39-.96-1.92 3.32L5.06 11 5 12l.06 1-2.03 1.58 1.92 3.32 2.39-.96c.53.41 1.11.75 1.73 1l.36 2.56h3.84l.36-2.56c.62-.25 1.2-.59 1.73-1l2.39.96 1.92-3.32Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function IconoOperador() {
  return (
    <svg className={styles.icono} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M3 21h18M4 21V10m16 11V10M2.5 10 12 4l9.5 6M8 21v-6m4 6v-6m4 6v-6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export default function Navbar() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const { user, perfil, logout } = useAuth()
  // Menú desplegable del teléfono; en escritorio las opciones se ven siempre.
  const [menuAbierto, setMenuAbierto] = useState(false)
  // Menú de usuario de escritorio (nombre, correo y cerrar sesión).
  const [usuarioAbierto, setUsuarioAbierto] = useState(false)
  // Lista de secciones del panel de administración.
  const [panelAbierto, setPanelAbierto] = useState(false)
  const raizRef = useRef<HTMLElement>(null)

  // Al navegar a otra pantalla, los menús se cierran solos.
  useEffect(() => {
    setMenuAbierto(false)
    setUsuarioAbierto(false)
    setPanelAbierto(false)
  }, [pathname])

  // Con un menú abierto: Escape o un toque fuera de la barra lo cierran.
  useEffect(() => {
    if (!menuAbierto && !usuarioAbierto && !panelAbierto) {
      return
    }
    const cerrar = () => {
      setMenuAbierto(false)
      setUsuarioAbierto(false)
      setPanelAbierto(false)
    }
    const alPresionar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cerrar()
    }
    const alTocarFuera = (e: PointerEvent) => {
      if (raizRef.current && !raizRef.current.contains(e.target as Node)) cerrar()
    }
    window.addEventListener('keydown', alPresionar)
    window.addEventListener('pointerdown', alTocarFuera)
    return () => {
      window.removeEventListener('keydown', alPresionar)
      window.removeEventListener('pointerdown', alTocarFuera)
    }
  }, [menuAbierto, usuarioAbierto, panelAbierto])

  async function handleLogout() {
    await logout()
    navigate('/', { replace: true })
  }

  const claseOpcion = (extra = '') =>
    ({ isActive }: { isActive: boolean }) =>
      [styles.navLink, extra, isActive ? styles.activo : ''].filter(Boolean).join(' ')

  const nombre = perfil?.displayName ?? user?.email ?? ''
  const inicialesUsuario = iniciales(perfil?.displayName ?? null, user?.email ?? null)
  const rol = ETIQUETA_ROL[perfil?.role ?? 'ciudadano'] ?? 'Ciudadano'

  return (
    <header ref={raizRef} className={styles.navbar} data-no-imprimir>
      <Link to="/" className={styles.brand}>
        <span className={styles.brandMark} aria-hidden="true">
          ◆
        </span>
        Ciudad Alerta
      </Link>

      {user ? (
        <>
          <button
            type="button"
            className={styles.menuBoton}
            onClick={() => setMenuAbierto((abierto) => !abierto)}
            aria-expanded={menuAbierto}
            aria-controls="menu-principal"
            aria-label={menuAbierto ? 'Cerrar menú' : 'Abrir menú'}
          >
            <span className={styles.menuIcono} aria-hidden="true">
              {menuAbierto ? '✕' : '☰'}
            </span>
          </button>

          <nav
            id="menu-principal"
            className={`${styles.right} ${menuAbierto ? styles.rightAbierto : ''}`}
            aria-label="Principal"
          >
            <NavLink to="/mapa" className={claseOpcion()}>
              Mapas
            </NavLink>

            {/* "Mis reportes" no aplica a una cuenta operador: no crea reportes. */}
            {perfil?.role !== 'operador' && (
              <NavLink to="/historial" className={claseOpcion()}>
                Historial
              </NavLink>
            )}

            {/* Los paneles quedan activos en cualquiera de sus subpáginas
                (/admin/reportes, /operador/estadisticas…). */}
            {perfil?.role === 'admin' && (
              <div className={styles.desplegable}>
                <button
                  type="button"
                  className={[
                    styles.navLink,
                    styles.navEspecial,
                    styles.desplegableBoton,
                    pathname.startsWith('/admin') ? styles.activo : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => {
                    setPanelAbierto((abierto) => !abierto)
                    setUsuarioAbierto(false)
                  }}
                  aria-expanded={panelAbierto}
                  aria-controls="menu-panel-admin"
                >
                  <IconoAdmin />
                  Panel de administración
                  <span className={styles.flecha} aria-hidden="true">
                    ▾
                  </span>
                </button>

                {panelAbierto && (
                  <div id="menu-panel-admin" className={styles.panelMenu}>
                    <NavLink
                      to="/admin"
                      end
                      className={({ isActive }) =>
                        `${styles.panelEnlace} ${isActive ? styles.panelEnlaceActivo : ''}`
                      }
                    >
                      Inicio del panel
                    </NavLink>
                    {GRUPOS_ADMIN.map((grupo) => (
                      <div key={grupo.titulo} className={styles.panelGrupo}>
                        <span className={styles.panelGrupoTitulo}>{grupo.titulo}</span>
                        {grupo.secciones.map((seccion) => (
                          <NavLink
                            key={seccion.ruta}
                            to={seccion.ruta}
                            end
                            className={({ isActive }) =>
                              `${styles.panelEnlace} ${isActive ? styles.panelEnlaceActivo : ''}`
                            }
                          >
                            {seccion.titulo}
                          </NavLink>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {perfil?.role === 'operador' && (
              <NavLink to="/operador" className={claseOpcion(styles.navEspecial)}>
                <IconoOperador />
                Panel de operador
              </NavLink>
            )}

            {/* Teléfono: los datos de la sesión van al final del menú. */}
            <div className={styles.sesionMovil}>
              <span className={styles.avatar} aria-hidden="true">
                {inicialesUsuario}
              </span>
              <span className={styles.sesionTextos}>
                <span className={styles.sesionNombre}>{nombre}</span>
                <span className={styles.sesionDetalle}>
                  {rol} · {user.email}
                </span>
              </span>
              <button type="button" className={styles.logoutButton} onClick={handleLogout}>
                Cerrar sesión
              </button>
            </div>
          </nav>

          {/* Escritorio: menú de usuario. */}
          <div className={styles.usuario}>
            <button
              type="button"
              className={styles.usuarioBoton}
              onClick={() => {
                setUsuarioAbierto((abierto) => !abierto)
                setPanelAbierto(false)
              }}
              aria-expanded={usuarioAbierto}
              aria-haspopup="menu"
              aria-controls="menu-usuario"
            >
              <span className={styles.avatar} aria-hidden="true">
                {inicialesUsuario}
              </span>
              <span className={styles.usuarioNombre}>{nombre}</span>
              <span className={styles.flecha} aria-hidden="true">
                ▾
              </span>
            </button>

            {usuarioAbierto && (
              <div id="menu-usuario" className={styles.usuarioMenu} role="menu">
                <p className={styles.usuarioMenuNombre}>{nombre}</p>
                <p className={styles.usuarioMenuCorreo}>{user.email}</p>
                <p className={styles.usuarioMenuRol}>{rol}</p>
                <button
                  type="button"
                  role="menuitem"
                  className={styles.usuarioMenuSalir}
                  onClick={handleLogout}
                >
                  Cerrar sesión
                </button>
              </div>
            )}
          </div>
        </>
      ) : (
        // Sin sesión hay una sola acción: no hace falta menú.
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
