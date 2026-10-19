import { useEffect, useState } from 'react'

let carga: Promise<string[]> | null = null

/** Nombres de las comunas tal como los guardan los reportes (catálogo oficial), ordenados. */
function cargarNombres(): Promise<string[]> {
  if (!carga) {
    carga = fetch('/data/comunas-chile.json')
      .then((r) => r.json() as Promise<{ comunas: { nombre: string }[] }>)
      .then((d) => [...new Set(d.comunas.map((c) => c.nombre))].sort((a, b) => a.localeCompare(b, 'es')))
      .catch((err) => {
        console.error('No se pudo leer el catálogo de comunas:', err)
        carga = null
        return []
      })
  }
  return carga
}

export function useNombresComunas(activo = true): string[] {
  const [nombres, setNombres] = useState<string[]>([])
  useEffect(() => {
    if (!activo) return
    let vigente = true
    cargarNombres().then((n) => vigente && setNombres(n))
    return () => {
      vigente = false
    }
  }, [activo])
  return nombres
}
