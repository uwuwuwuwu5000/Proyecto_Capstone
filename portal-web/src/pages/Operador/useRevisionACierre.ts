// «Revisión hasta el cierre»: cuánto tardan los reportes del operador desde «En revisión» hasta «Cerrado».
//
// Esa fecha solo está en el historial de estados de cada reporte, así que se lee en dos pasos: primero la
// lista de sus reportes cerrados (una consulta solo de igualdad, sin índices nuevos) y después el
// historial de los más recientes del periodo (una lectura por entrada, con caché en `useHistoriales`).
// El periodo se aplica por la fecha del cierre.
import { useEffect, useMemo, useState } from 'react'
import { collection, getDocs, limit, query, where } from 'firebase/firestore'
import { db } from '../../firebase/config'
import { useHistoriales } from '../../hooks/useHistoriales'
import { mapearReporte } from '../../components/Reportes/reporte'
import type { Reporte } from '../../components/Reportes/reporte'
import { candidatosDeRevision, revisionACierreDelPeriodo } from './veredictos'
import type { RangoDeFechas, RevisionACierreDelPeriodo } from './veredictos'

/** Tope de reportes cerrados que se listan. Si se alcanza, faltan los más antiguos. */
export const MAXIMO_CERRADOS = 500

export interface RevisionACierre extends RevisionACierreDelPeriodo {
  cargando: boolean
  error: string
  /** Hay más cerrados de los que se leyeron o de los que se midieron: faltan los más antiguos del periodo. */
  hayMas: boolean
}

export function useRevisionACierre(operadorId: string | null, rango: RangoDeFechas): RevisionACierre {
  const [cerrados, setCerrados] = useState<Reporte[]>([])
  const [cargandoLista, setCargandoLista] = useState(!!operadorId)
  const [errorLista, setErrorLista] = useState('')

  useEffect(() => {
    if (!operadorId) {
      setCerrados([])
      setCargandoLista(false)
      return
    }
    let vigente = true
    setCargandoLista(true)
    setErrorLista('')
    getDocs(query(collection(db, 'reports'), where('operadorId', '==', operadorId), where('estado', '==', 'cerrado'), limit(MAXIMO_CERRADOS)))
      .then((snap) => {
        if (!vigente) return
        setCerrados(snap.docs.map(mapearReporte))
        setCargandoLista(false)
      })
      .catch((err) => {
        console.error('Error al leer los reportes cerrados:', err)
        if (!vigente) return
        setCerrados([])
        setErrorLista('No pudimos calcular el tiempo de revisión a cierre. Inténtalo nuevamente.')
        setCargandoLista(false)
      })
    return () => {
      vigente = false
    }
  }, [operadorId])

  const inicioMs = rango.inicio?.getTime() ?? null
  const finMs = rango.fin?.getTime() ?? null
  const periodo = useMemo<RangoDeFechas>(
    () => ({ inicio: inicioMs === null ? null : new Date(inicioMs), fin: finMs === null ? null : new Date(finMs) }),
    [inicioMs, finMs],
  )

  const { candidatos, hayMas: hayMasHistoriales } = useMemo(() => candidatosDeRevision(cerrados, periodo), [cerrados, periodo])
  const { historiales, cargando: cargandoHistoriales, error: errorHistoriales } = useHistoriales(candidatos)
  const resumen = useMemo(() => revisionACierreDelPeriodo(historiales, candidatos, periodo), [historiales, candidatos, periodo])

  return {
    ...resumen,
    cargando: cargandoLista || cargandoHistoriales,
    error: errorLista || errorHistoriales,
    hayMas: hayMasHistoriales || cerrados.length >= MAXIMO_CERRADOS,
  }
}
