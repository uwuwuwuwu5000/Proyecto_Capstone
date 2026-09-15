import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { FirebaseError } from 'firebase/app'
import {
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
} from 'firebase/auth'
import { auth } from '../../firebase/config'
import { useAuth } from '../../context/AuthContext'
import styles from './Login.module.css'

type Modo = 'login' | 'recuperar'

/** Traduce los códigos de error de Firebase Auth a mensajes en español. */
function traducirError(code: string): string {
  switch (code) {
    case 'auth/invalid-email':
      return 'El correo ingresado no tiene un formato válido.'
    case 'auth/missing-password':
      return 'Ingresa tu contraseña.'
    case 'auth/user-disabled':
      return 'Esta cuenta está deshabilitada. Contacta al administrador.'
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'Correo o contraseña incorrectos.'
    case 'auth/too-many-requests':
      return 'Demasiados intentos fallidos. Espera unos minutos e inténtalo de nuevo.'
    case 'auth/network-request-failed':
      return 'Problema de conexión. Revisa tu red e inténtalo nuevamente.'
    default:
      return 'No pudimos completar la operación. Inténtalo nuevamente.'
  }
}

export default function Login() {
  const navigate = useNavigate()
  const { user, loading: sesionCargando } = useAuth()

  const [modo, setModo] = useState<Modo>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  const [enviando, setEnviando] = useState(false)

  // Si ya hay sesión activa (por ejemplo, tras recargar), no mostramos el login.
  if (!sesionCargando && user) {
    return <Navigate to="/" replace />
  }

  function cambiarModo(nuevoModo: Modo) {
    setModo(nuevoModo)
    setError('')
    setAviso('')
    setPassword('')
  }

  async function handleLogin(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')
    setEnviando(true)
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password)
      navigate('/', { replace: true })
    } catch (err) {
      const code = err instanceof FirebaseError ? err.code : ''
      setError(traducirError(code))
    } finally {
      setEnviando(false)
    }
  }

  async function handleRecuperar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')
    setAviso('')
    setEnviando(true)
    try {
      await sendPasswordResetEmail(auth, email.trim())
    } catch (err) {
      // Solo cortamos ante errores de formato; para el resto no revelamos
      // si el correo existe o no.
      if (err instanceof FirebaseError && err.code === 'auth/invalid-email') {
        setError(traducirError(err.code))
        setEnviando(false)
        return
      }
    }
    setAviso(
      'Si el correo existe, te enviamos un enlace para restablecer tu contraseña.',
    )
    setEnviando(false)
  }

  return (
    <div className={styles.wrapper}>
      <div className={styles.card}>
        <h1 className={styles.title}>Ciudad Alerta</h1>

        {modo === 'login' ? (
          <>
            <p className={styles.subtitle}>Portal de organismos y administración</p>

            <form className={styles.form} onSubmit={handleLogin} noValidate>
              <label className={styles.field}>
                <span className={styles.label}>Correo</span>
                <input
                  type="email"
                  className={styles.input}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  required
                />
              </label>

              <label className={styles.field}>
                <span className={styles.label}>Contraseña</span>
                <input
                  type="password"
                  className={styles.input}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                />
              </label>

              {error && <p className={styles.error}>{error}</p>}

              <button
                type="submit"
                className={styles.submit}
                disabled={enviando}
              >
                {enviando ? 'Iniciando sesión…' : 'Iniciar sesión'}
              </button>
            </form>

            <button
              type="button"
              className={styles.linkButton}
              onClick={() => cambiarModo('recuperar')}
            >
              ¿Olvidaste tu contraseña?
            </button>

            <p className={styles.registerHint}>
              ¿No tienes cuenta?{' '}
              <Link to="/registro" className={styles.registerLink}>
                Regístrate
              </Link>
            </p>
          </>
        ) : (
          <>
            <p className={styles.subtitle}>Recuperar contraseña</p>

            <form className={styles.form} onSubmit={handleRecuperar} noValidate>
              <label className={styles.field}>
                <span className={styles.label}>Correo</span>
                <input
                  type="email"
                  className={styles.input}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  required
                />
              </label>

              {error && <p className={styles.error}>{error}</p>}
              {aviso && <p className={styles.notice}>{aviso}</p>}

              <button
                type="submit"
                className={styles.submit}
                disabled={enviando}
              >
                {enviando ? 'Enviando…' : 'Enviar enlace de recuperación'}
              </button>
            </form>

            <button
              type="button"
              className={styles.linkButton}
              onClick={() => cambiarModo('login')}
            >
              Volver a iniciar sesión
            </button>
          </>
        )}
      </div>
    </div>
  )
}
