// Estado de sesión global: Firebase Authentication + el perfil de
// Firestore (users/{uid}), necesario desde Sprint 4 para decisiones de rol
// (admin, operador) en la interfaz.
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import type { ReactNode } from 'react'
import { onAuthStateChanged, signOut } from 'firebase/auth'
import type { User } from 'firebase/auth'
import { doc, onSnapshot } from 'firebase/firestore'
import { auth, db } from '../firebase/config'

/** Subconjunto de users/{uid} que necesita la interfaz para decidir qué mostrar. */
export interface PerfilUsuario {
  displayName: string | null
  role: string
  operadorId: string | null
}

interface AuthContextValue {
  /** Usuario autenticado (tipo nativo de firebase/auth) o null si no hay sesión. */
  user: User | null
  /** true mientras Firebase resuelve el estado inicial de sesión. */
  loading: boolean
  /** Perfil de Firestore del usuario logueado, o null sin sesión. */
  perfil: PerfilUsuario | null
  /** true mientras se carga el perfil (tras resolverse la sesión). */
  perfilCargando: boolean
  /** Cierra la sesión actual. */
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [perfil, setPerfil] = useState<PerfilUsuario | null>(null)
  const [perfilCargando, setPerfilCargando] = useState(true)

  useEffect(() => {
    // Mantiene la sesión sincronizada, incluso tras recargar la página.
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser)
      setLoading(false)
    })
    return unsubscribe
  }, [])

  useEffect(() => {
    if (!user) {
      setPerfil(null)
      setPerfilCargando(false)
      return
    }

    setPerfilCargando(true)
    const unsubscribe = onSnapshot(
      doc(db, 'users', user.uid),
      (snap) => {
        const data = snap.data()
        setPerfil(
          data
            ? {
                displayName:
                  typeof data.displayName === 'string' ? data.displayName : null,
                role: typeof data.role === 'string' ? data.role : 'ciudadano',
                operadorId:
                  typeof data.operadorId === 'string' ? data.operadorId : null,
              }
            : null,
        )
        setPerfilCargando(false)
      },
      (err) => {
        console.error('Error al leer el perfil del usuario:', err)
        setPerfil(null)
        setPerfilCargando(false)
      },
    )
    return unsubscribe
  }, [user])

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      perfil,
      perfilCargando,
      logout: () => signOut(auth),
    }),
    [user, loading, perfil, perfilCargando],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth debe usarse dentro de un <AuthProvider>.')
  }
  return context
}
