import { COLOR_POR_ESTADO, ETIQUETA_POR_ESTADO } from '../../constants/reportes'
import { autorDelCambio } from './historial'
import type { CambioEstado } from './historial'
import { formatearFecha } from './reporte'
import styles from './Reportes.module.css'

interface HistorialEstadosProps {
  /** Cambios del más antiguo al más reciente (como los entrega cargarHistorial). */
  cambios: CambioEstado[]
  fechaCreacion: Date | null
  /** Versión más chica, para el popup del mapa. */
  compacto?: boolean
}

function Punto({ estado }: { estado: string }) {
  return (
    <span
      className={styles.historialPunto}
      style={{ background: COLOR_POR_ESTADO[estado] ?? COLOR_POR_ESTADO.reportado }}
      aria-hidden="true"
    />
  )
}

/**
 * Línea de tiempo pública de un reporte: su creación y cada cambio de estado,
 * con fecha, estado anterior → nuevo, quién lo hizo y el comentario.
 */
export default function HistorialEstados({
  cambios,
  fechaCreacion,
  compacto = false,
}: HistorialEstadosProps) {
  return (
    <ol className={`${styles.historial} ${compacto ? styles.historialCompacto : ''}`}>
      <li>
        <span className={styles.historialFecha}>{formatearFecha(fechaCreacion, true)}</span>
        <span className={styles.historialCambio}>
          <Punto estado="reportado" />
          <strong>{ETIQUETA_POR_ESTADO.reportado}</strong>
        </span>
        <span className={styles.historialAutor}>Creado por un ciudadano</span>
      </li>
      {cambios.map((cambio) => (
        <li key={cambio.id}>
          <span className={styles.historialFecha}>{formatearFecha(cambio.fecha, true)}</span>
          <span className={styles.historialCambio}>
            <Punto estado={cambio.hacia} />
            {ETIQUETA_POR_ESTADO[cambio.desde] ?? cambio.desde} →{' '}
            <strong>{ETIQUETA_POR_ESTADO[cambio.hacia] ?? cambio.hacia}</strong>
          </span>
          <span className={styles.historialAutor}>por {autorDelCambio(cambio)}</span>
          {cambio.comentario && (
            <span className={styles.historialComentario}>“{cambio.comentario}”</span>
          )}
        </li>
      ))}
    </ol>
  )
}
