// Datos de /operadores compartidos por las pantallas del panel de admin.
import { useEffect, useState } from 'react'
import { collection, onSnapshot } from 'firebase/firestore'
import type { DocumentData } from 'firebase/firestore'
import { db } from '../../firebase/config'

/**
 * Cuenta de acceso creada para un operador. Se guarda en el propio operador
 * al crearla desde el portal: /users no se puede listar (las reglas solo
 * dejan leer el perfil propio), así que es la única forma de saber desde el
 * panel qué cuentas tiene cada operador. Las cuentas creadas antes de este
 * cambio no figuran aquí.
 */
export interface CuentaOperador {
  uid: string
  correo: string
  nombre: string
}

export interface Operador {
  id: string
  nombre: string
  organismoId: string
  activo: boolean
  telefonoContacto: string
  correoContacto: string
  direccionContacto: string
  cuentas: CuentaOperador[]
}

function texto(valor: unknown): string {
  return typeof valor === 'string' ? valor : ''
}

export function mapearOperador(id: string, data: DocumentData): Operador {
  const cuentas = Array.isArray(data.cuentas)
    ? data.cuentas
        .filter((c: unknown): c is Record<string, unknown> => typeof c === 'object' && c !== null)
        .map((c: Record<string, unknown>) => ({
          uid: texto(c.uid),
          correo: texto(c.correo),
          nombre: texto(c.nombre),
        }))
    : []
  return {
    id,
    nombre: texto(data.nombre) || id,
    organismoId: texto(data.organismoId),
    activo: data.activo !== false,
    telefonoContacto: texto(data.telefonoContacto),
    correoContacto: texto(data.correoContacto),
    direccionContacto: texto(data.direccionContacto),
    cuentas,
  }
}

/** Todos los operadores, en vivo, ordenados por nombre. */
export function useOperadores(activo: boolean) {
  const [operadores, setOperadores] = useState<Operador[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!activo) {
      return
    }
    return onSnapshot(
      collection(db, 'operadores'),
      (snapshot) => {
        const lista = snapshot.docs.map((d) => mapearOperador(d.id, d.data()))
        lista.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
        setOperadores(lista)
        setCargando(false)
        setError('')
      },
      (err) => {
        console.error('Error al leer operadores:', err)
        setError('No pudimos cargar los operadores. Inténtalo nuevamente.')
        setCargando(false)
      },
    )
  }, [activo])

  return { operadores, cargando, error }
}
