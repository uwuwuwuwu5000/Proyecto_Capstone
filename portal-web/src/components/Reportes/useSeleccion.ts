import { useCallback, useMemo, useState } from 'react'
import type { Reporte } from './reporte'

/**
 * Selección múltiple sobre la lista visible. Solo cuenta lo que se ve: si un
 * filtro oculta un reporte seleccionado, deja de estar en la selección, para
 * que una acción nunca alcance reportes que el usuario no tiene a la vista.
 */
export function useSeleccion(visibles: Reporte[]) {
  const [ids, setIds] = useState<Set<string>>(() => new Set())

  const seleccionados = useMemo(() => visibles.filter((r) => ids.has(r.id)), [visibles, ids])

  const alternar = useCallback((id: string) => {
    setIds((previos) => {
      const siguientes = new Set(previos)
      if (siguientes.has(id)) siguientes.delete(id)
      else siguientes.add(id)
      return siguientes
    })
  }, [])

  const limpiar = useCallback(() => setIds(new Set()), [])

  const todos = visibles.length > 0 && seleccionados.length === visibles.length

  const alternarTodos = useCallback(() => {
    setIds(todos ? new Set() : new Set(visibles.map((r) => r.id)))
  }, [todos, visibles])

  return {
    seleccionados,
    estaSeleccionado: (id: string) => ids.has(id),
    alternar,
    limpiar,
    todos,
    /** Algunos, pero no todos: la casilla "todos" queda a medias. */
    algunos: seleccionados.length > 0 && !todos,
    alternarTodos,
  }
}
