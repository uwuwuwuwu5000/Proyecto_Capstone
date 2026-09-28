import L from 'leaflet'
import { COLOR_POR_ESTADO } from '../../constants/reportes'
import styles from './MapaSantiago.module.css'

function crearIconoEstado(color: string): L.DivIcon {
  return L.divIcon({
    className: styles.pin,
    html: `<span style="background:${color}"></span>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
    popupAnchor: [0, -10],
  })
}

// Un ícono por estado, precalculado una sola vez (no en cada render).
// Compartido entre el mapa público (MapaSantiago) y el panel de operador.
export const ICONOS_POR_ESTADO: Record<string, L.DivIcon> = Object.fromEntries(
  Object.entries(COLOR_POR_ESTADO).map(([estado, color]) => [estado, crearIconoEstado(color)]),
)
export const ICONO_ESTADO_DESCONOCIDO = crearIconoEstado(COLOR_POR_ESTADO.reportado)
