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
  const [organismoId, setOrganismoId] = useState<string | null>(null)
  const [organismoNombre, setOrganismoNombre] = useState<string | null>(null)

  useEffect(() => {
    if (!perfil?.operadorId) {
      setOperadorActivo(null)
      setOperadorNombre(null)
      setOrganismoId(null)
      return
    }
    const unsubscribe = onSnapshot(
      doc(db, 'operadores', perfil.operadorId),
      (snap) => {
        const data = snap.data()
        setOperadorActivo(!!data && data.activo !== false)
        setOperadorNombre(typeof data?.nombre === 'string' ? data.nombre : null)
        setOrganismoId(typeof data?.organismoId === 'string' ? data.organismoId : null)
      },
      (err) => {
        console.error('Error al leer el operador del perfil:', err)
        setOperadorActivo(false)
      },
    )
    return unsubscribe
  }, [perfil?.operadorId])

  // Nombre del organismo del operador, tal como está en el catálogo. Es el
  // único nombre con el que las reglas (firmaHistorialValida) dejan a una
  // cuenta operador firmar un cambio de estado: a diferencia del displayName,
  // ninguna cuenta puede editarlo.
  useEffect(() => {
    if (!organismoId) {
      setOrganismoNombre(null)
      return
    }
    const unsubscribe = onSnapshot(
      doc(db, 'organismos', organismoId),
      (snap) => {
        const nombre = snap.data()?.nombre
        setOrganismoNombre(typeof nombre === 'string' ? nombre : null)
      },
      (err) => {
        console.error('Error al leer el organismo del operador:', err)
        setOrganismoNombre(null)
      },
    )
    return unsubscribe
  }, [organismoId])

  const esCuentaOperador = !!user && perfil?.role === 'operador' && !!perfil.operadorId
  const cargando = loading || perfilCargando || (esCuentaOperador && operadorActivo === null)

  return {
    cargando,
    autorizado: esCuentaOperador && operadorActivo === true,
    operadorId: perfil?.operadorId ?? null,
    operadorNombre,
    /** null mientras carga: en ese caso la firma se omite (la regla lo admite). */
    organismoNombre,
  }
}
