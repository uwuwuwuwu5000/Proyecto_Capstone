import { useEffect, useMemo, useRef, useState } from 'react'
import { cargarHistorial } from '../components/Reportes/historial'
import type { CambioEstado } from '../components/Reportes/historial'
import type { Reporte } from '../components/Reportes/reporte'

// Lecturas en paralelo por tanda: suficiente para que sea rápido sin disparar
// cientos de consultas a la vez al elegir un periodo largo.
const TAMANO_TANDA = 10

/**
 * Historial de estados de cada reporte, para calcular tiempos de atención.
 * Se guarda en caché junto con el estado que tenía el reporte al leerlo: si
 * el estado cambia (hay una entrada nueva en el historial), se vuelve a leer
 * solo ese reporte; cambiar de periodo no repite lecturas ya hechas.
 */
export function useHistoriales(reportes: Reporte[]) {
  const cache = useRef(new Map<string, { estado: string; cambios: CambioEstado[] }>())
  const reportesRef = useRef(reportes)
  reportesRef.current = reportes

  const [version, setVersion] = useState(0)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState('')

  // Cambia solo si cambian los reportes o sus estados, no en cada render.
  const firma = reportes.map((r) => `${r.id}:${r.estado}`).join('|')

  useEffect(() => {
    const pendientes = reportesRef.current.filter(
      (r) => cache.current.get(r.id)?.estado !== r.estado,
    )
    if (pendientes.length === 0) {
      setCargando(false)
      return
    }

    let cancelado = false
    setCargando(true)
    setError('')

    async function cargar() {
      try {
        for (let i = 0; i < pendientes.length; i += TAMANO_TANDA) {
          const tanda = pendientes.slice(i, i + TAMANO_TANDA)
          const resultados = await Promise.all(tanda.map((r) => cargarHistorial(r.id)))
          if (cancelado) return
          tanda.forEach((r, j) => cache.current.set(r.id, { estado: r.estado, cambios: resultados[j] }))
          setVersion((v) => v + 1)
        }
        setCargando(false)
      } catch (err) {
        console.error('Error al leer el historial de estados:', err)
        if (!cancelado) {
          setError('No pudimos calcular los tiempos de atención. Intenta más tarde.')
          setCargando(false)
        }
      }
    }
    cargar()

    return () => {
      cancelado = true
    }
  }, [firma])

  const historiales = useMemo(
    () => new Map(Array.from(cache.current, ([id, { cambios }]) => [id, cambios])),
    // La caché es un ref: version es lo que cambia cada vez que llega una tanda.
    [version],
  )

  return { historiales, cargando, error }
}
