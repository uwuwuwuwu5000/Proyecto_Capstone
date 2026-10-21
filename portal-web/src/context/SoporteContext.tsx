// Conversaciones de soporte abiertas, para el menú del panel de administración
// (contador) y para la campana (un aviso por conversación). Vive en un
// contexto (y no en la barra superior) porque la barra se vuelve a montar en
// cada página: así hay una sola suscripción.
import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { escucharAbiertasDetalle } from '../components/Soporte/soporte'
import type { Ticket } from '../components/Soporte/soporte'
import { useAuth } from './AuthContext'

interface SoporteContextValue {
  /** Conversaciones sin atender; null si no aplica (no es admin) o aún no se sabe. */
  abiertos: number | null
  /** Esas mismas conversaciones, con su asunto y su último mensaje. */
  tickets: Ticket[]
}

const SoporteContext = createContext<SoporteContextValue>({ abiertos: null, tickets: [] })

export function SoporteProvider({ children }: { children: ReactNode }) {
  const { perfil } = useAuth()
  const esAdmin = perfil?.role === 'admin'
  const [tickets, setTickets] = useState<Ticket[] | null>(null)

  useEffect(() => {
    if (!esAdmin) {
      setTickets(null)
      return
    }
    return escucharAbiertasDetalle(setTickets, (err) => {
      console.error('Error al leer las conversaciones de soporte:', err)
      setTickets(null)
    })
  }, [esAdmin])

  const valor = useMemo(
    () => ({ abiertos: tickets ? tickets.length : null, tickets: tickets ?? [] }),
    [tickets],
  )
  return <SoporteContext.Provider value={valor}>{children}</SoporteContext.Provider>
}

export function useSoporte(): SoporteContextValue {
  return useContext(SoporteContext)
}
