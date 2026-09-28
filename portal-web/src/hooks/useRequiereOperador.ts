import { useEffect, useState } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase/config'
import { useAuth } from '../context/AuthContext'

/**
 * Guard de las pantallas del panel de operador. Además del rol, comprueba
 * que el operador asignado siga activo: si un admin lo desactiva desde
 * /admin/operadores, la cuenta puede seguir logueada pero pierde el acceso
 * a la bandeja de reportes (no hay forma de bloquear el login en sí sin
 * Cloud Functions).
 */
export function useRequiereOperador() {
  const { user, perfil, loading, perfilCargando } = useAuth()
  const [operadorActivo, setOperadorActivo] = useState<boolean | null>(null)
  const [operadorNombre, setOperadorNombre] = useState<string | null>(null)

  useEffect(() => {
    if (!perfil?.operadorId) {
      setOperadorActivo(null)
      setOperadorNombre(null)
      return
    }
    const unsubscribe = onSnapshot(
      doc(db, 'operadores', perfil.operadorId),
      (snap) => {
        const data = snap.data()
        setOperadorActivo(!!data && data.activo !== false)
        setOperadorNombre(typeof data?.nombre === 'string' ? data.nombre : null)
      },
      (err) => {
        console.error('Error al leer el operador del perfil:', err)
        setOperadorActivo(false)
      },
    )
    return unsubscribe
  }, [perfil?.operadorId])

  const esCuentaOperador = !!user && perfil?.role === 'operador' && !!perfil.operadorId
  const cargando = loading || perfilCargando || (esCuentaOperador && operadorActivo === null)

  return {
    cargando,
    autorizado: esCuentaOperador && operadorActivo === true,
    operadorId: perfil?.operadorId ?? null,
    operadorNombre,
  }
}
