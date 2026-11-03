import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { doc, serverTimestamp, updateDoc } from 'firebase/firestore'
import { VERSION_TERMINOS } from '@ciudad-alerta/comun'
import { db } from '../../firebase/config'
import { useAuth } from '../../context/AuthContext'
import Navbar from '../Navbar/Navbar'
import styles from './AceptarTerminos.module.css'

/**
 * Pantalla que ve una cuenta que no ha aceptado la versión vigente de los términos y la política de
 * privacidad (cuentas anteriores a esa versión). Se acepta una sola vez; quien no acepta puede cerrar
 * la sesión. Los documentos se abren en otra pestaña para no perder esta pantalla.
 */
export default function AceptarTerminos() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  async function aceptar() {
    if (!user) return
    setGuardando(true)
    setError('')
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        terminosVersion: VERSION_TERMINOS,
        terminosAceptadosAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
      // El perfil se vuelve a leer solo y esta pantalla desaparece.
    } catch (err) {
      console.error('Error al guardar la aceptación de los términos:', err)
      setError('No pudimos guardar tu aceptación. Inténtalo nuevamente.')
      setGuardando(false)
    }
  }

  async function cerrarSesion() {
    navigate('/', { replace: true })
    await logout()
  }

  return (
    <>
      <Navbar />
      <main className={styles.pagina}>
        <section className={styles.tarjeta} aria-labelledby="titulo-terminos">
          <h1 id="titulo-terminos" className={styles.titulo}>
            Antes de continuar
          </h1>
          <p className={styles.texto}>
            Actualizamos los términos de uso y la política de privacidad de Ciudad Alerta. Para seguir usando el
            portal necesitas leerlos y aceptarlos.
          </p>
          <ul className={styles.enlaces}>
            <li>
              <a href="/terminos" target="_blank" rel="noopener noreferrer">
                Términos de uso
              </a>
            </li>
            <li>
              <a href="/privacidad" target="_blank" rel="noopener noreferrer">
                Política de privacidad
              </a>
            </li>
          </ul>
          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}
          <div className={styles.acciones}>
            <button type="button" className={styles.aceptar} onClick={aceptar} disabled={guardando}>
              {guardando ? 'Guardando…' : 'Acepto los términos y la política de privacidad'}
            </button>
            <button type="button" className={styles.salir} onClick={cerrarSesion} disabled={guardando}>
              Cerrar sesión
            </button>
          </div>
        </section>
      </main>
    </>
  )
}
