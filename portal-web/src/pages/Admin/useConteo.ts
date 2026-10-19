import { useEffect, useState } from 'react'
import {
  Timestamp,
  average,
  collection,
  getAggregateFromServer,
  getCountFromServer,
  getDocs,
  limit,
  orderBy,
  query,
  where,
} from 'firebase/firestore'
import { db } from '../../firebase/config'
import { ESTADOS_EN_ORDEN } from '../../constants/reportes'

/** Conteo en el servidor (no descarga los reportes); null si falla. */
export function useConteo(
  activo: boolean,
  crearConsulta: () => ReturnType<typeof query>,
  /** Cambiarla vuelve a leer el conteo. */
  version = 0,
) {
  const [valor, setValor] = useState<number | null | undefined>(undefined)
  useEffect(() => {
    if (!activo) return
    let vigente = true
    getCountFromServer(crearConsulta())
      .then((r) => vigente && setValor(r.data().count))
      .catch((err) => {
        console.error('Error al contar reportes:', err)
        if (vigente) setValor(null)
      })
    return () => {
      vigente = false
    }
    // La consulta se arma al entrar al panel y al cambiar `version`.
  }, [activo, version])
  return valor
}

/** Cantidad de reportes por estado (un conteo del servidor por cada estado); null si falla. */
export function useConteosPorEstado(activo: boolean, version = 0) {
  const [conteos, setConteos] = useState<Record<string, number> | null | undefined>(undefined)
  useEffect(() => {
    if (!activo) return
    let vigente = true
    Promise.all(
      ESTADOS_EN_ORDEN.map((estado) =>
        getCountFromServer(query(collection(db, 'reports'), where('estado', '==', estado))).then(
          (r) => [estado, r.data().count] as const,
        ),
      ),
    )
      .then((pares) => vigente && setConteos(Object.fromEntries(pares)))
      .catch((err) => {
        console.error('Error al contar reportes por estado:', err)
        if (vigente) setConteos(null)
      })
    return () => {
      vigente = false
    }
  }, [activo, version])
  return conteos
}

export interface ResolucionResumen {
  /** Reportes que pasaron por «Resuelto» desde el día 1 del mes. */
  resueltosMes: number
  /** Reportes cerrados sin pasar por «Resuelto» desde el día 1 del mes. */
  cerradosSinResolverMes: number
  /** Reportes con `resueltoAt` (todos los que tienen el dato). */
  resueltosConDato: number
  /** Promedio de `tiempoResolucionMs`; null si aún no hay datos. */
  promedioMs: number | null
  /** Fecha del primer dato de resolución: antes de ella los reportes no tienen el campo. */
  desde: Date | null
}

/**
 * Resumen de resolución con consultas de agregación del servidor (conteos y
 * promedio): cuestan ~1 lectura por cada 1.000 entradas de índice, no una por
 * reporte. Solo cuentan los reportes que tienen los campos de resolución, es
 * decir, los que pasaron por «Resuelto» o se cerraron después de implementarlos.
 * null si falla.
 */
export function useResolucion(activo: boolean, version = 0) {
  const [datos, setDatos] = useState<ResolucionResumen | null | undefined>(undefined)
  useEffect(() => {
    if (!activo) return
    let vigente = true
    const hoy = new Date()
    const inicioMes = Timestamp.fromDate(new Date(hoy.getFullYear(), hoy.getMonth(), 1))
    const origen = Timestamp.fromDate(new Date(0))
    const reportes = collection(db, 'reports')
    const primero = (campo: string) =>
      getDocs(query(reportes, orderBy(campo, 'asc'), limit(1))).then((r) => {
        const valor = r.docs[0]?.data()[campo] as { toDate?: () => Date } | undefined
        return typeof valor?.toDate === 'function' ? valor.toDate() : null
      })

    Promise.all([
      getCountFromServer(query(reportes, where('resueltoAt', '>=', inicioMes))),
      getCountFromServer(query(reportes, where('cerradoSinResolverAt', '>=', inicioMes))),
      getCountFromServer(query(reportes, where('resueltoAt', '>=', origen))),
      getAggregateFromServer(query(reportes), { promedio: average('tiempoResolucionMs') }),
      primero('resueltoAt'),
      primero('cerradoSinResolverAt'),
    ])
      .then(([mes, sinResolver, conDato, promedio, primeraResuelta, primeraSinResolver]) => {
        if (!vigente) return
        const fechas = [primeraResuelta, primeraSinResolver].filter((f): f is Date => f !== null)
        setDatos({
          resueltosMes: mes.data().count,
          cerradosSinResolverMes: sinResolver.data().count,
          resueltosConDato: conDato.data().count,
          promedioMs: promedio.data().promedio,
          desde: fechas.length > 0 ? new Date(Math.min(...fechas.map((f) => f.getTime()))) : null,
        })
      })
      .catch((err) => {
        console.error('Error al calcular el resumen de resolución:', err)
        if (vigente) setDatos(null)
      })
    return () => {
      vigente = false
    }
  }, [activo, version])
  return datos
}
