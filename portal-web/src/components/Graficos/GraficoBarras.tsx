import { useState } from 'react'
import styles from './Graficos.module.css'

export interface FilaBarra {
  clave: string
  etiqueta: string
  valor: number
  /** Color de identidad opcional: se dibuja como punto junto a la etiqueta, nunca en la barra. */
  colorIdentidad?: string
}

interface GraficoBarrasProps {
  filas: FilaBarra[]
  /** Total contra el que se calcula el porcentaje del hover. */
  total: number
}

/**
 * Barras horizontales de una sola serie: la longitud es la magnitud y todas
 * las barras llevan el mismo color. El valor va en la punta; el hover o foco
 * agrega el porcentaje sobre el total.
 */
export default function GraficoBarras({ filas, total }: GraficoBarrasProps) {
  const [activa, setActiva] = useState<string | null>(null)
  const maximo = Math.max(0, ...filas.map((f) => f.valor))

  return (
    <ul className={styles.barras}>
      {filas.map((fila) => {
        // La barra más larga ocupa el 85% del carril, para dejar sitio al valor.
        const ancho = maximo > 0 ? (fila.valor / maximo) * 85 : 0
        const porcentaje = total > 0 ? Math.round((fila.valor / total) * 100) : 0
        const esActiva = activa === fila.clave
        return (
          <li
            key={fila.clave}
            className={`${styles.barraFila} ${esActiva ? styles.barraFilaActiva : ''}`}
            tabIndex={0}
            onPointerEnter={() => setActiva(fila.clave)}
            onPointerLeave={() => setActiva(null)}
            onFocus={() => setActiva(fila.clave)}
            onBlur={() => setActiva(null)}
            aria-label={`${fila.etiqueta}: ${fila.valor} (${porcentaje}%)`}
          >
            <span className={styles.barraEtiqueta}>
              {fila.colorIdentidad && (
                <span
                  className={styles.barraPunto}
                  style={{ background: fila.colorIdentidad }}
                  aria-hidden="true"
                />
              )}
              {fila.etiqueta}
            </span>
            <span className={styles.barraCarril} aria-hidden="true">
              {fila.valor > 0 && <span className={styles.barra} style={{ width: `${ancho}%` }} />}
              <span className={styles.barraValor}>
                {fila.valor.toLocaleString('es-CL')}
                {esActiva && <span className={styles.barraPorcentaje}> · {porcentaje}%</span>}
              </span>
            </span>
          </li>
        )
      })}
    </ul>
  )
}
