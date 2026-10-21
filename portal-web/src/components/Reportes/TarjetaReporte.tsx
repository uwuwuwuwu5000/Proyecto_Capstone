import type { ReactNode } from 'react'
import { COLOR_POR_ESTADO, ETIQUETA_POR_ESTADO } from '../../constants/reportes'
import { useCategorias } from '../../context/CategoriasContext'
import FotoReporte from './FotoReporte'
import InsigniasReporte from '../../confianza/InsigniasReporte'
import { formatearFecha } from './reporte'
import type { Reporte } from './reporte'
import styles from './Reportes.module.css'

interface TarjetaReporteProps {
  reporte: Reporte
  /** Nombre del operador asignado, o null si no hay (o no se conoce). */
  operadorNombre: string | null
  /** Botones o formulario que van al pie de la tarjeta. */
  children: ReactNode
  /** Selección múltiple: si se entrega, la tarjeta muestra una casilla. */
  seleccionado?: boolean
  onAlternarSeleccion?: () => void
}

export default function TarjetaReporte({
  reporte,
  operadorNombre,
  children,
  seleccionado = false,
  onAlternarSeleccion,
}: TarjetaReporteProps) {
  const { etiqueta } = useCategorias()

  return (
    <article className={`${styles.tarjeta} ${seleccionado ? styles.tarjetaSeleccionada : ''}`}>
      {onAlternarSeleccion && (
        <label className={styles.seleccionCasilla}>
          <input
            type="checkbox"
            checked={seleccionado}
            onChange={onAlternarSeleccion}
            aria-label={`Seleccionar reporte de ${etiqueta(reporte.categoria)} del ${formatearFecha(reporte.fecha)}`}
          />
        </label>
      )}
      <FotoReporte foto={reporte.foto} />

      <div className={styles.cuerpoTarjeta}>
        <div className={styles.cabecera}>
          <span className={styles.categoria}>
            {etiqueta(reporte.categoria)}
          </span>
          <EstadoPildora estado={reporte.estado} />
        </div>
        <InsigniasReporte validacion={reporte.validacion} />

        <p className={styles.descripcion}>{reporte.descripcion || 'Sin descripción'}</p>

        <dl className={styles.datos}>
          <dt>Autor</dt>
          <dd>{reporte.autorNombre ?? 'Sin nombre registrado'}</dd>
          <dt>Creado</dt>
          <dd>{formatearFecha(reporte.fecha)}</dd>
          <dt>Operador</dt>
          <dd>{operadorNombre ?? reporte.operadorId ?? 'Sin asignar'}</dd>
          <dt>Organismo ID</dt>
          <dd>{reporte.organismoId ?? '—'}</dd>
        </dl>

        {children}
      </div>
    </article>
  )
}

export function EstadoPildora({ estado }: { estado: string }) {
  return (
    <span className={styles.estado} style={{ borderColor: COLOR_POR_ESTADO[estado] }}>
      <span className={styles.estadoPunto} style={{ background: COLOR_POR_ESTADO[estado] }} />
      {ETIQUETA_POR_ESTADO[estado] ?? estado}
    </span>
  )
}
