import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router-dom'
import {
  arrayUnion,
  collection,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore'
import { createUserWithEmailAndPassword, signOut } from 'firebase/auth'
import { FirebaseError } from 'firebase/app'
import { db, getAuthAprovisionamiento } from '../../firebase/config'
import { useRequiereAdmin } from '../../hooks/useRequiereAdmin'
import Navbar from '../../components/Navbar/Navbar'
import styles from './Admin.module.css'

interface OperadorConNombre {
  id: string
  nombre: string
}

/** Traduce los errores de Firebase Auth al crear una cuenta de organismo. */
function traducirErrorCuenta(code: string): string {
  switch (code) {
    case 'auth/email-already-in-use':
      return 'Ya existe una cuenta con ese correo.'
    case 'auth/invalid-email':
      return 'El correo no tiene un formato válido.'
    case 'auth/weak-password':
      return 'La contraseña es demasiado débil. Usa al menos 6 caracteres.'
    default:
      return 'No pudimos crear la cuenta. Inténtalo nuevamente.'
  }
}

export default function AdminCuentas() {
  const { cargando, autorizado } = useRequiereAdmin()

  const [operadores, setOperadores] = useState<OperadorConNombre[]>([])

  const [params] = useSearchParams()
  // ?operador=<id>: se llega desde "Crear cuenta" en la lista de operadores.
  const [cuentaOperadorId, setCuentaOperadorId] = useState(() => params.get('operador') ?? '')
  const [cuentaNombre, setCuentaNombre] = useState('')
  const [cuentaCorreo, setCuentaCorreo] = useState('')
  const [cuentaPassword, setCuentaPassword] = useState('')
  const [cuentaError, setCuentaError] = useState('')
  const [cuentaAviso, setCuentaAviso] = useState('')
  const [cuentaEnviando, setCuentaEnviando] = useState(false)

  useEffect(() => {
    if (!autorizado) {
      return
    }
    // Solo operadores activos — no tiene sentido crear una cuenta apuntando
    // a un organismo que está desactivado.
    const unsubscribe = onSnapshot(
      query(collection(db, 'operadores'), where('activo', '==', true)),
      (snapshot) => {
        const lista = snapshot.docs.map((operadorSnap) => {
          const data = operadorSnap.data()
          return {
            id: operadorSnap.id,
            nombre: typeof data.nombre === 'string' ? data.nombre : operadorSnap.id,
          }
        })
        lista.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
        setOperadores(lista)
      },
    )
    return unsubscribe
  }, [autorizado])

  if (!cargando && !autorizado) {
    return <Navigate to="/" replace />
  }

  async function crearCuentaOrganismo(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setCuentaError('')
    setCuentaAviso('')

    if (!cuentaOperadorId) {
      setCuentaError('Selecciona a qué operador pertenece esta cuenta.')
      return
    }
    if (!cuentaNombre.trim()) {
      setCuentaError('Ingresa un nombre para mostrar de esta cuenta.')
      return
    }

    setCuentaEnviando(true)

    // Instancia secundaria: crea el usuario de Auth sin afectar la sesión
    // del admin en la app principal (ver firebase/config.ts).
    const authAprovisionamiento = getAuthAprovisionamiento()
    try {
      const cred = await createUserWithEmailAndPassword(
        authAprovisionamiento,
        cuentaCorreo.trim(),
        cuentaPassword,
      )
      await signOut(authAprovisionamiento) // limpieza; no afecta a la sesión principal

      // Esta escritura sale autenticada como el admin (sesión principal).
      // Nota: la rama de reglas que la autoriza (esAdmin() + validación de
      // esta forma) está pendiente de reincorporar al archivo compartido —
      // ver la conversación sobre /users.
      await setDoc(doc(db, 'users', cred.user.uid), {
        uid: cred.user.uid,
        email: cuentaCorreo.trim(),
        displayName: cuentaNombre.trim(),
        role: 'operador',
        operadorId: cuentaOperadorId,
        trustLevel: 0,
        validatedReports: 0,
        emailVerified: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })

      // Se registra en el operador: /users no se puede listar, así que es la
      // forma de que el panel sepa qué cuentas tiene cada operador. Si falla,
      // la cuenta igual existe y funciona.
      let registrada = true
      try {
        await updateDoc(doc(db, 'operadores', cuentaOperadorId), {
          cuentas: arrayUnion({
            uid: cred.user.uid,
            correo: cuentaCorreo.trim(),
            nombre: cuentaNombre.trim(),
          }),
        })
      } catch (err) {
        console.error('No se pudo registrar la cuenta en el operador:', err)
        registrada = false
      }

      setCuentaAviso(
        registrada
          ? `Cuenta creada para ${cuentaCorreo.trim()}.`
          : `Cuenta creada para ${cuentaCorreo.trim()}, pero no se pudo anotar en el operador: no aparecerá en su columna de cuentas.`,
      )
      setCuentaOperadorId('')
      setCuentaNombre('')
      setCuentaCorreo('')
      setCuentaPassword('')
    } catch (err) {
      const code = err instanceof FirebaseError ? err.code : ''
      console.error('Error al crear la cuenta de organismo:', err)
      setCuentaError(traducirErrorCuenta(code))
    } finally {
      setCuentaEnviando(false)
    }
  }

  return (
    <div className={styles.page}>
      <Navbar />

      <main className={styles.main}>
        <div>
          <Link to="/admin" className={styles.volver}>
            ← Panel de administración
          </Link>
          <h1 className={styles.title}>Crear cuenta de organismo</h1>
          <p className={styles.subtitle}>
            Da de alta el acceso de un operador ya activado.
          </p>
        </div>

        <section className={styles.card}>
          <form className={styles.form} onSubmit={crearCuentaOrganismo} noValidate>
            <label className={styles.field}>
              <span className={styles.label}>Operador</span>
              <select
                className={styles.input}
                value={cuentaOperadorId}
                onChange={(e) => setCuentaOperadorId(e.target.value)}
              >
                <option value="">Selecciona un operador…</option>
                {operadores.map((operador) => (
                  <option key={operador.id} value={operador.id}>
                    {operador.nombre} ({operador.id})
                  </option>
                ))}
              </select>
            </label>

            <label className={styles.field}>
              <span className={styles.label}>Nombre a mostrar</span>
              <input
                type="text"
                className={styles.input}
                value={cuentaNombre}
                onChange={(e) => setCuentaNombre(e.target.value)}
                placeholder="Municipalidad de Maipú"
              />
            </label>

            <div className={styles.grid2}>
              <label className={styles.field}>
                <span className={styles.label}>Correo</span>
                <input
                  type="email"
                  className={styles.input}
                  value={cuentaCorreo}
                  onChange={(e) => setCuentaCorreo(e.target.value)}
                  autoComplete="off"
                />
              </label>
              <label className={styles.field}>
                <span className={styles.label}>Contraseña</span>
                <input
                  type="password"
                  className={styles.input}
                  value={cuentaPassword}
                  onChange={(e) => setCuentaPassword(e.target.value)}
                  autoComplete="new-password"
                />
              </label>
            </div>

            {cuentaError && <p className={styles.error}>{cuentaError}</p>}
            {cuentaAviso && <p className={styles.aviso}>{cuentaAviso}</p>}

            <button
              type="submit"
              className={styles.submit}
              disabled={cuentaEnviando || operadores.length === 0}
            >
              {cuentaEnviando ? 'Creando cuenta…' : 'Crear cuenta de organismo'}
            </button>
            {operadores.length === 0 && (
              <p className={styles.hint}>
                Todavía no hay ningún operador activo —{' '}
                <Link to="/admin/operadores" className={styles.footerLink}>
                  crea uno primero
                </Link>
                .
              </p>
            )}
          </form>
        </section>
      </main>
    </div>
  )
}
