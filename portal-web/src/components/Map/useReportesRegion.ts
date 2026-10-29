// Reportes de una región para el mapa público: los más recientes, en vivo.
//
// Antes el mapa escuchaba TODOS los reportes; con una región y un tope se leen
// como máximo `MAXIMO_POR_REGION` documentos, sin importar cuántos haya en el
// país (cada documento leído cuenta en la cuota del plan gratuito).
//
// Índice que usa: `reports` → `region` ascendente + `createdAt` descendente. Si
// falta, se vuelve a pedir sin ordenar (siguen siendo hasta MAXIMO_POR_REGION
// reportes de la región, pero no necesariamente los más recientes).
import { useEffect, useMemo, useState } from 'react'
import {
  collection,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
} from 'firebase/firestore'
import type { QueryDocumentSnapshot } from 'firebase/firestore'
import { FirebaseError } from 'firebase/app'
import { db } from '../../firebase/config'
import type { Region } from './regiones'

/** Reportes de una región como máximo, los más recientes. */
export const MAXIMO_POR_REGION = 500

/**
 * Suma los reportes antiguos que no tienen el campo `region`, buscándolos por
 * comuna (una consulta más por cada 30 comunas: 2 en la Metropolitana). Cuando
 * todos los reportes tengan región, ponlo en false: ahorra esas lecturas.
 */
export const INCLUIR_SIN_REGION = true

/** `in` admite hasta 30 valores por consulta. */
const MAXIMO_EN_IN = 30

export function partir<T>(lista: readonly T[], tamano: number): T[][] {
  const partes: T[][] = []
  for (let i = 0; i < lista.length; i += tamano) partes.push(lista.slice(i, i + tamano))
  return partes
}

/**
 * Une la consulta principal con los reportes encontrados por comuna: sin
 * repetidos y descartando los que dicen pertenecer a otra región.
 */
export function unirReportesDeRegion(
  principales: readonly QueryDocumentSnapshot[],
  porComuna: readonly QueryDocumentSnapshot[],
  nombreRegion: string,
): QueryDocumentSnapshot[] {
  const vistos = new Set(principales.map((d) => d.id))
  const extras = porComuna.filter((d) => {
    if (vistos.has(d.id)) return false
    const region = d.data().region
    return region === undefined || region === null || region === '' || region === nombreRegion
  })
  return [...principales, ...extras]
}

interface Estado<T> {
  clave: string
  reportes: T[]
  hayMas: boolean
}

export function useReportesRegion<T>(
  region: Region | null,
  activo: boolean,
  mapear: (doc: QueryDocumentSnapshot) => T | null,
) {
  const [estado, setEstado] = useState<Estado<T> | null>(null)
  const [error, setError] = useState('')
  const [sinOrden, setSinOrden] = useState(false)
  const [recarga, setRecarga] = useState(0)
  const nombre = region?.nombre ?? null
  const comunas = region?.comunas
  const clave = `${nombre ?? ''}|${recarga}`

  useEffect(() => {
    if (!activo || !nombre) return
    let vigente = true
    setError('')

    const coleccion = collection(db, 'reports')
    const consulta = sinOrden
      ? query(coleccion, where('region', '==', nombre), limit(MAXIMO_POR_REGION))
      : query(coleccion, where('region', '==', nombre), orderBy('createdAt', 'desc'), limit(MAXIMO_POR_REGION))

    let principales: QueryDocumentSnapshot[] = []
    let porComuna: QueryDocumentSnapshot[] = []
    const emitir = () => {
      if (!vigente) return
      const docs = unirReportesDeRegion(principales, porComuna, nombre)
      const reportes: T[] = []
      for (const d of docs) {
        const r = mapear(d)
        if (r) reportes.push(r)
      }
      setEstado({ clave, reportes, hayMas: principales.length >= MAXIMO_POR_REGION })
    }

    const baja = onSnapshot(
      consulta,
      (snap) => {
        principales = snap.docs
        emitir()
      },
      (err) => {
        if (!vigente) return
        if (err instanceof FirebaseError && err.code === 'failed-precondition' && !sinOrden) {
          console.warn('Falta el índice region + createdAt; se pide sin ordenar.', err.message)
          setSinOrden(true)
          return
        }
        console.error('Error al leer los reportes de la región:', err)
        setError('No pudimos cargar los reportes de esta región. Intenta más tarde.')
      },
    )

    if (INCLUIR_SIN_REGION && comunas) {
      for (const parte of partir(comunas, MAXIMO_EN_IN)) {
        getDocs(query(coleccion, where('comuna', 'in', parte), limit(MAXIMO_POR_REGION)))
          .then((snap) => {
            porComuna = [...porComuna, ...snap.docs]
            emitir()
          })
          .catch((err) => console.error('Error al buscar reportes sin región:', err))
      }
    }

    return () => {
      vigente = false
      baja()
    }
    // `mapear` es estable (función del módulo); `clave` cambia con la región y con "Actualizar".
  }, [activo, nombre, comunas, sinOrden, recarga]) // eslint-disable-line react-hooks/exhaustive-deps

  const actual = estado && estado.clave === clave ? estado : null
  const cargando = activo && !!nombre && !actual && !error

  return useMemo(
    () => ({
      reportes: actual?.reportes ?? [],
      hayMas: actual?.hayMas ?? false,
      cargando,
      error,
      recargar: () => setRecarga((n) => n + 1),
    }),
    [actual, cargando, error],
  )
}
