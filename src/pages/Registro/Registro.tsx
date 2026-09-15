import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { FirebaseError } from 'firebase/app'
import { createUserWithEmailAndPassword } from 'firebase/auth'
import { doc, serverTimestamp, setDoc } from 'firebase/firestore'
import { auth, db } from '../../firebase/config'
import { useAuth } from '../../context/AuthContext'
import styles from './Registro.module.css'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
// Letras, números, punto y guion bajo; sin espacios; 3 a 20 caracteres.
const USERNAME_RE = /^[a-zA-Z0-9_.]{3,20}$/

interface CamposError {
  username?: string
  correo?: string
  password?: string
  confirm?: string
}

/** Traduce los códigos de error de Firebase Auth al crear la cuenta. */
function traducirErrorRegistro(code: string): string {
  switch (code) {
    case 'auth/network-request-failed':
      return 'Problema de conexión. Revisa tu red e inténtalo nuevamente.'
    case 'auth/operation-not-allowed':
      return 'El registro con correo y contraseña no está habilitado.'
    default:
      return 'No pudimos crear tu cuenta. Inténtalo nuevamente.'
  }
}

export default function Registro() {
  const navigate = useNavigate()
  const { user, loading: sesionCargando } = useAuth()

  const [username, setUsername] = useState('')
  const [correo, setCorreo] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [errores, setErrores] = useState<CamposError>({})
  const [errorGeneral, setErrorGeneral] = useState('')
  const [enviando, setEnviando] = useState(false)

  // Si ya hay sesión activa, no tiene sentido mostrar el registro.
  if (!sesionCargando && user) {
    return <Navigate to="/" replace />
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()

    const usernameTrim = username.trim()
    const correoTrim = correo.trim()

    // 1. Validación en el frontend, con mensajes específicos por campo.
    const nuevosErrores: CamposError = {}
    if (!usernameTrim) {
      nuevosErrores.username = 'Ingresa un nombre de usuario.'
    } else if (!USERNAME_RE.test(usernameTrim)) {
      nuevosErrores.username =
        'Debe tener 3-20 caracteres: letras, números, punto o guion bajo, sin espacios.'
    }
    if (!correoTrim) {
      nuevosErrores.correo = 'Ingresa tu correo electrónico.'
    } else if (!EMAIL_RE.test(correoTrim)) {
      nuevosErrores.correo = 'El correo no tiene un formato válido.'
    }
    if (!password) {
      nuevosErrores.password = 'Ingresa una contraseña.'
    } else if (password.length < 6) {
      nuevosErrores.password = 'La contraseña debe tener al menos 6 caracteres.'
    }
    if (!confirm) {
      nuevosErrores.confirm = 'Repite la contraseña.'
    } else if (confirm !== password) {
      nuevosErrores.confirm = 'Las contraseñas no coinciden.'
    }

    setErrores(nuevosErrores)
    setErrorGeneral('')
    if (Object.keys(nuevosErrores).length > 0) {
      return
    }

    setEnviando(true)
    try {
      // 2. Crear la cuenta en Firebase Authentication.
      const cred = await createUserWithEmailAndPassword(
        auth,
        correoTrim,
        password,
      )

      // 3. Crear el documento del usuario en Firestore con el uid recién creado.
      // Mismo esquema (en inglés) que ya usa la app móvil, para que ambas
      // apps escriban documentos compatibles en la misma colección.
      try {
        await setDoc(doc(db, 'users', cred.user.uid), {
          uid: cred.user.uid,
          displayName: usernameTrim,
          email: correoTrim,
          emailVerified: cred.user.emailVerified,
          role: 'ciudadano',
          trustLevel: 0,
          validatedReports: 0,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        })
      } catch {
        // La cuenta quedó creada en Authentication pero falló Firestore.
        setErrorGeneral(
          'Tu cuenta se creó, pero no pudimos guardar tu perfil. Intenta iniciar sesión; si el problema persiste, contacta al soporte.',
        )
        setEnviando(false)
        return
      }

      // 5. Todo bien: al portal.
      navigate('/', { replace: true })
    } catch (err) {
      // 4. Traducir los errores comunes de Firebase Auth.
      const code = err instanceof FirebaseError ? err.code : ''
      if (code === 'auth/email-already-in-use') {
        setErrores({ correo: 'Ya existe una cuenta con este correo.' })
      } else if (code === 'auth/invalid-email') {
        setErrores({ correo: 'El correo no tiene un formato válido.' })
      } else if (code === 'auth/weak-password') {
        setErrores({
          password: 'La contraseña es demasiado débil. Usa al menos 6 caracteres.',
        })
      } else {
        setErrorGeneral(traducirErrorRegistro(code))
      }
      setEnviando(false)
    }
  }

  return (
    <div className={styles.wrapper}>
      <div className={styles.card}>
        <h1 className={styles.title}>Ciudad Alerta</h1>
        <p className={styles.subtitle}>Crear una cuenta</p>

        <form className={styles.form} onSubmit={handleSubmit} noValidate>
          <label className={styles.field}>
            <span className={styles.label}>Nombre de usuario</span>
            <input
              type="text"
              className={styles.input}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              required
            />
            {errores.username && (
              <span className={styles.fieldError}>{errores.username}</span>
            )}
          </label>

          <label className={styles.field}>
            <span className={styles.label}>Correo electrónico</span>
            <input
              type="email"
              className={styles.input}
              value={correo}
              onChange={(e) => setCorreo(e.target.value)}
              autoComplete="email"
              required
            />
            {errores.correo && (
              <span className={styles.fieldError}>{errores.correo}</span>
            )}
          </label>

          <label className={styles.field}>
            <span className={styles.label}>Contraseña</span>
            <input
              type="password"
              className={styles.input}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              required
            />
            {errores.password && (
              <span className={styles.fieldError}>{errores.password}</span>
            )}
          </label>

          <label className={styles.field}>
            <span className={styles.label}>Confirmar contraseña</span>
            <input
              type="password"
              className={styles.input}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
              required
            />
            {errores.confirm && (
              <span className={styles.fieldError}>{errores.confirm}</span>
            )}
          </label>

          {errorGeneral && <p className={styles.error}>{errorGeneral}</p>}

          <button type="submit" className={styles.submit} disabled={enviando}>
            {enviando ? 'Creando cuenta…' : 'Crear cuenta'}
          </button>
        </form>

        <p className={styles.footerHint}>
          ¿Ya tienes cuenta?{' '}
          <Link to="/login" className={styles.footerLink}>
            Inicia sesión
          </Link>
        </p>
      </div>
    </div>
  )
}
