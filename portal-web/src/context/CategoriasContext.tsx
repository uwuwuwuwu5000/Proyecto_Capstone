// Catálogo de categorías (S4-02), compartido por todo el portal con una sola
// suscripción a Firestore.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { collection, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase/config'
import { useAuth } from './AuthContext'

export interface Categoria {
  id: string
  nombre: string
  descripcion: string
  orden: number
  activa: boolean
}

interface CategoriasContextValue {
  /** Catálogo ordenado por `orden` y nombre. Vacío si todavía no hay categorías. */
  categorias: Categoria[]
  cargando: boolean
  /** Nombre visible de una categoría; si no está en el catálogo, el id tal cual. */
  etiqueta: (id: string) => string
}

const CategoriasContext = createContext<CategoriasContextValue | undefined>(undefined)

function ordenarCategorias(a: Categoria, b: Categoria): number {
  return a.orden - b.orden || a.nombre.localeCompare(b.nombre, 'es')
}

export function CategoriasProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    // Las reglas exigen sesión para leer el catálogo.
    if (!user) {
      setCategorias([])
      setCargando(false)
      return
    }
    setCargando(true)
    const unsubscribe = onSnapshot(
      collection(db, 'categorias'),
      (snapshot) => {
        const lista = snapshot.docs.map((docSnap) => {
          const data = docSnap.data()
          return {
            id: docSnap.id,
            nombre: typeof data.nombre === 'string' && data.nombre ? data.nombre : docSnap.id,
            descripcion: typeof data.descripcion === 'string' ? data.descripcion : '',
            orden: typeof data.orden === 'number' ? data.orden : 999,
            activa: data.activa !== false,
          }
        })
        lista.sort(ordenarCategorias)
        setCategorias(lista)
        setCargando(false)
      },
      (err) => {
        console.error('Error al leer el catálogo de categorías:', err)
        setCategorias([])
        setCargando(false)
      },
    )
    return unsubscribe
  }, [user])

  const porId = useMemo(() => new Map(categorias.map((c) => [c.id, c])), [categorias])

  const etiqueta = useCallback((id: string) => porId.get(id)?.nombre ?? id, [porId])

  const value = useMemo(
    () => ({ categorias, cargando, etiqueta }),
    [categorias, cargando, etiqueta],
  )

  return <CategoriasContext.Provider value={value}>{children}</CategoriasContext.Provider>
}

export function useCategorias(): CategoriasContextValue {
  const context = useContext(CategoriasContext)
  if (context === undefined) {
    throw new Error('useCategorias debe usarse dentro de un <CategoriasProvider>.')
  }
  return context
}
