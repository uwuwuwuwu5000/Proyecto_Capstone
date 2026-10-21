// Datos de confianza del usuario con sesión: su nivel y las confirmaciones de hoy.
//
// Sin documento (o si las reglas todavía no permiten leerlo) se muestran los
// valores de un usuario nuevo: nivel 0, 0 puntos, 0 confirmaciones hoy.
import { useEffect, useState } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase/config'
import { useAuth } from '../context/AuthContext'
import { CONFIANZA_VACIA, leerConfianza } from './tipos'
import type { Confianza, LimiteDelDia } from './tipos'
import { numeroDeDia } from './reglas'

export interface EstadoConfianza {
  confianza: Confianza
  /** Confirmaciones ya hechas hoy (día de Chile, UTC−3). */
  hoy: LimiteDelDia
  cargando: boolean
  /** true si aún no existe ningún dato de confianza para la cuenta. */
  sinDatos: boolean
}

const HOY_VACIO: LimiteDelDia = { confirmaciones: 0, ultimaAt: null }

export function useConfianza(): EstadoConfianza {
  const { user } = useAuth()
  const uid = user?.uid ?? null
  const [confianza, setConfianza] = useState<Confianza>(CONFIANZA_VACIA)
  const [sinDatos, setSinDatos] = useState(true)
  const [hoy, setHoy] = useState<LimiteDelDia>(HOY_VACIO)
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    if (!uid) {
      setConfianza(CONFIANZA_VACIA)
      setHoy(HOY_VACIO)
      setSinDatos(true)
      setCargando(false)
      return
    }
    setCargando(true)

    const bajaConfianza = onSnapshot(
      doc(db, 'users', uid, 'confianza', 'actual'),
      (snap) => {
        setConfianza(leerConfianza(snap.data()))
        setSinDatos(!snap.exists())
        setCargando(false)
      },
      (err) => {
        console.error('Confianza: no se pudo leer el nivel.', err)
        setConfianza(CONFIANZA_VACIA)
        setSinDatos(true)
        setCargando(false)
      },
    )

    const bajaHoy = onSnapshot(
      doc(db, 'users', uid, 'limites', String(numeroDeDia())),
      (snap) => {
        const d = snap.data()
        setHoy(
          d
            ? {
                confirmaciones: typeof d.confirmaciones === 'number' ? d.confirmaciones : 0,
                ultimaAt: typeof d.ultimaAt?.toDate === 'function' ? d.ultimaAt.toDate() : null,
              }
            : HOY_VACIO,
        )
      },
      (err) => {
        console.error('Confianza: no se pudo leer el contador del día.', err)
        setHoy(HOY_VACIO)
      },
    )

    return () => {
      bajaConfianza()
      bajaHoy()
    }
  }, [uid])

  return { confianza, hoy, cargando, sinDatos }
}
