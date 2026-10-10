import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import { MapContainer, Polygon, TileLayer, useMap } from 'react-leaflet'
// Estilos base de Leaflet y los del tema oscuro de los controles (este
// diálogo se carga aparte de los demás mapas).
import 'leaflet/dist/leaflet.css'
import './leafletTema.css'
import { limitesDeOrganismo } from '../Reportes/asignacion'
import type { LimiteComuna, Poligono } from '../Reportes/asignacion'
import dialogo from '../Dialogo/Dialogo.module.css'
import styles from './DialogoLimiteComuna.module.css'

/** GeoJSON usa [lng, lat]; Leaflet, [lat, lng]. */
function aLeaflet(poligono: Poligono): [number, number][][] {
  return poligono.map((anillo) => anillo.map(([lng, lat]) => [lat, lng] as [number, number]))
}

/** Encuadra el mapa en el límite apenas se dibuja. */
function Encuadrar({ limites }: { limites: LimiteComuna[] }) {
  const mapa = useMap()
  useEffect(() => {
    const puntos = limites.flatMap((l) =>
      l.poligonos.flatMap((p) => (p[0] ?? []).map(([lng, lat]) => [lat, lng] as [number, number])),
    )
    if (puntos.length > 0) {
      mapa.fitBounds(L.latLngBounds(puntos), { padding: [16, 16] })
    }
  }, [limites, mapa])
  return null
}

/**
 * Límite comunal oficial (BCN) de una municipalidad: el mismo que usan la app
 * y el portal para decidir a qué organismo va cada reporte.
 */
export default function DialogoLimiteComuna({
  organismoId,
  nombre,
  onCerrar,
}: {
  organismoId: string
  nombre: string
  onCerrar: () => void
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const [limites, setLimites] = useState<LimiteComuna[] | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    const elemento = ref.current
    if (elemento && !elemento.open) elemento.showModal()
  }, [])

  useEffect(() => {
    let vigente = true
    limitesDeOrganismo(organismoId)
      .then((resultado) => {
        if (!vigente) return
        setLimites(resultado)
        if (resultado.length === 0) setError('No hay un límite oficial registrado para esta comuna.')
      })
      .catch((err) => {
        console.error('Error al cargar el límite comunal:', err)
        if (vigente) setError('No pudimos cargar el límite comunal. Inténtalo nuevamente.')
      })
    return () => {
      vigente = false
    }
  }, [organismoId])

  return (
    <dialog
      ref={ref}
      className={`${dialogo.dialogo} ${styles.dialogoMapa}`}
      aria-labelledby="limite-comuna-titulo"
      onClose={onCerrar}
      onClick={(e) => {
        if (e.target === ref.current) ref.current?.close()
      }}
    >
      <div className={dialogo.contenido}>
        <div className={styles.cabecera}>
          <h2 id="limite-comuna-titulo" className={dialogo.titulo}>
            {nombre}
          </h2>
          <button
            type="button"
            className={styles.cerrar}
            onClick={() => ref.current?.close()}
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>
        <p className={styles.nota}>
          Límite comunal oficial. Los reportes hechos dentro de esta zona se asignan a esta
          municipalidad mientras esté activa.
        </p>

        {error ? (
          <p className={styles.error}>{error}</p>
        ) : !limites ? (
          <p className={styles.nota}>Cargando límite…</p>
        ) : (
          <MapContainer center={[-33.45, -70.65]} zoom={10} className={styles.mapa}>
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {limites.flatMap((limite) =>
              limite.poligonos.map((poligono, i) => (
                <Polygon
                  key={`${limite.codigo}-${i}`}
                  positions={aLeaflet(poligono)}
                  pathOptions={{ color: '#1ca9c9', weight: 2, fillOpacity: 0.15 }}
                />
              )),
            )}
            <Encuadrar limites={limites} />
          </MapContainer>
        )}
      </div>
    </dialog>
  )
}
