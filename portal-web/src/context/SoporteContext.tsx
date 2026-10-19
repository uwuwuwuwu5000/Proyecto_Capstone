// Contador de conversaciones de soporte abiertas, para el menú del panel de
// administración. Vive en un contexto (y no en la barra superior) porque la
// barra se vuelve a montar en cada página: así hay una sola suscripción.
import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { escucharAbiertos } from '../components/Soporte/soporte'
import { useAuth } from './AuthContext'

interface SoporteContextValue {
  /** Conversaciones sin atender; null si no aplica (no es admin) o aún no se sabe. */
  abiertos: number | null
}

const SoporteContext = createContext<SoporteContextValue>({ abiertos: null })

export function SoporteProvider({ children }: { children: ReactNode }) {
  const { perfil } = useAuth()
  const esAdmin = perfil?.role === 'admin'
  const [abiertos, setAbiertos] = useState<number | null>(null)

  useEffect(() => {
    if (!esAdmin) {
      setAbiertos(null)
      return
    }
    return escucharAbiertos(setAbiertos, (err) => {
      console.error('Error al contar conversaciones de soporte:', err)
      setAbiertos(null)
    })
  }, [esAdmin])

  const valor = useMemo(() => ({ abiertos }), [abiertos])
  return <SoporteContext.Provider value={valor}>{children}</SoporteContext.Provider>
}

export function useSoporte(): SoporteContextValue {
  return useContext(SoporteContext)
}
