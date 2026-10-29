// Agrupa los reportes que están muy cerca: un círculo con el total que se separa
// al acercar el mapa. Igual que el mapa de incidencias de la app móvil
// (Supercluster, radio de 60 px, zoom máximo 19).
import { useEffect, useMemo, useState } from 'react'
import L from 'leaflet'
import { Marker, Popup, useMap, useMapEvents } from 'react-leaflet'
import type { ReactNode } from 'react'
import { ZOOM_MAXIMO, crearIndice, diametroDeGrupo, textoDeGrupo } from './agrupacion'
import type { PuntoAgrupable } from './agrupacion'

export { ZOOM_MAXIMO }

/** Reportes que se listan cuando un grupo no se separa ni con el acercamiento máximo. */
const MAXIMO_EN_LISTA = 30

interface Vista {
  zoom: number
  bbox: [number, number, number, number]
}

interface GrupoAbierto {
  id: number
  lat: number
  lng: number
}

function iconoDeGrupo(cantidad: number): L.DivIcon {
  const d = diametroDeGrupo(cantidad)
  const burbuja = document.createElement('span')
  burbuja.className = 'grupo-incidencias__burbuja'
  burbuja.textContent = textoDeGrupo(cantidad)
  burbuja.style.width = `${d}px`
  burbuja.style.height = `${d}px`
  return L.divIcon({ className: 'grupo-incidencias', html: burbuja, iconSize: [d, d], iconAnchor: [d / 2, d / 2] })
}

interface Props<T extends PuntoAgrupable> {
  puntos: readonly T[]
  /** Un reporte que se muestra siempre suelto (el que tiene el panel abierto). */
  seleccionadoId: string | null
  /** Pin de un reporte suelto. */
  renderPunto: (punto: T) => ReactNode
  /** Texto de cada fila cuando un grupo no se separa (mismo lugar). */
  titulo: (punto: T) => string
  onElegir: (punto: T) => void
}

export default function CapaAgrupada<T extends PuntoAgrupable>({
  puntos,
  seleccionadoId,
  renderPunto,
  titulo,
  onElegir,
}: Props<T>) {
  const mapa = useMap()
  const [vista, setVista] = useState<Vista>(() => leerVista(mapa))
  const [grupoAbierto, setGrupoAbierto] = useState<GrupoAbierto | null>(null)

  useMapEvents({
    moveend: () => setVista(leerVista(mapa)),
    zoomend: () => setVista(leerVista(mapa)),
  })

  // Un cambio de filtros o de región deja de lado el grupo abierto.
  useEffect(() => setGrupoAbierto(null), [puntos, seleccionadoId])

  const porId = useMemo(() => new Map(puntos.map((p) => [p.id, p])), [puntos])

  // El índice se arma con todos menos el seleccionado, que se dibuja aparte.
  const indice = useMemo(
    () => crearIndice(puntos.filter((p) => p.id !== seleccionadoId)),
    [puntos, seleccionadoId],
  )

  const elementos = useMemo(() => indice.getClusters(vista.bbox, vista.zoom), [indice, vista])
  const seleccionado = seleccionadoId ? (porId.get(seleccionadoId) ?? null) : null

  function abrirGrupo(id: number, lat: number, lng: number) {
    let destino: number
    try {
      destino = indice.getClusterExpansionZoom(id)
    } catch {
      return // el grupo ya no existe (cambiaron los filtros mientras se tocaba)
    }
    if (destino <= mapa.getMaxZoom()) {
      const sinAnimacion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
      if (sinAnimacion) mapa.setView([lat, lng], destino)
      else mapa.flyTo([lat, lng], destino, { duration: 0.6 })
      return
    }
    setGrupoAbierto({ id, lat, lng })
  }

  // Al elegir un reporte de la lista, el índice se rearma sin él y el número del
  // grupo deja de existir: leerlo entonces fallaba y rompía la pantalla.
  const hojas = useMemo(() => {
    if (!grupoAbierto) return []
    try {
      return indice.getLeaves(grupoAbierto.id, MAXIMO_EN_LISTA)
    } catch {
      return []
    }
  }, [indice, grupoAbierto])

  return (
    <>
      {elementos.map((el) => {
        const [lng, lat] = el.geometry.coordinates
        const props = el.properties as { cluster?: boolean; cluster_id?: number; point_count?: number; id?: string }
        if (props.cluster && props.cluster_id !== undefined && props.point_count !== undefined) {
          const id = props.cluster_id
          const cantidad = props.point_count
          return (
            <Marker
              key={`grupo-${id}-${cantidad}`}
              position={[lat, lng]}
              icon={iconoDeGrupo(cantidad)}
              title={`${cantidad} reportes en esta zona. Toca para acercar.`}
              keyboard
              // Los grupos quedan sobre los pines sueltos que estén cerca.
              zIndexOffset={1000}
              eventHandlers={{ click: () => abrirGrupo(id, lat, lng) }}
            />
          )
        }
        const punto = props.id ? porId.get(props.id) : undefined
        return punto ? renderPunto(punto) : null
      })}

      {seleccionado && renderPunto(seleccionado)}

      {grupoAbierto && (
        <Popup position={[grupoAbierto.lat, grupoAbierto.lng]} eventHandlers={{ remove: () => setGrupoAbierto(null) }}>
          <p style={{ margin: '0 0 6px', fontWeight: 700 }}>{hojas.length} reportes en el mismo lugar</p>
          <ul className="grupo-incidencias__lista">
            {hojas.map((h) => {
              const punto = porId.get((h.properties as { id: string }).id)
              if (!punto) return null
              return (
                <li key={punto.id}>
                  <span>{titulo(punto)}</span>
                  <button
                    type="button"
                    onClick={(e) => {
                      // El clic no debe llegar al mapa: al cerrarse la lista, el mapa lo
                      // tomaba como un toque en una zona vacía y cerraba el detalle recién abierto.
                      e.stopPropagation()
                      // Se cierra la lista antes de abrir el detalle del reporte elegido.
                      setGrupoAbierto(null)
                      onElegir(punto)
                    }}
                  >
                    Ver detalle
                  </button>
                </li>
              )
            })}
          </ul>
        </Popup>
      )}
    </>
  )
}

function leerVista(mapa: L.Map): Vista {
  const b = mapa.getBounds()
  return {
    zoom: Math.round(mapa.getZoom()),
    // Un poco más amplio que la pantalla: así no aparecen grupos al arrastrar.
    bbox: [Math.max(-180, b.getWest() - 0.1), Math.max(-90, b.getSouth() - 0.1), Math.min(180, b.getEast() + 0.1), Math.min(90, b.getNorth() + 0.1)],
  }
}
