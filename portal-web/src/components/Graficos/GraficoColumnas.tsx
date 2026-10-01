import { useId, useState } from 'react'
import styles from './Graficos.module.css'

export interface PuntoColumna {
  clave: string
  /** Texto completo para el tooltip y la tabla (p. ej. "lunes 3 de marzo"). */
  etiqueta: string
  /** Texto corto para el eje X (p. ej. "3 mar"). */
  etiquetaCorta: string
  valor: number
}

/** Ticks enteros "limpios" (1, 2, 5 × 10^n) desde 0 hasta cubrir el máximo. */
function ticksLimpios(maximo: number): number[] {
  if (maximo <= 0) {
    return [0, 1]
  }
  const bruto = maximo / 4
  const magnitud = 10 ** Math.floor(Math.log10(bruto))
  const paso = Math.max(
    1,
    [1, 2, 5, 10].map((m) => m * magnitud).find((candidato) => candidato >= bruto) ?? 10 * magnitud,
  )
  const ticks: number[] = []
  for (let valor = 0; valor < maximo + paso; valor += paso) {
    ticks.push(valor)
    if (valor >= maximo) break
  }
  return ticks
}

interface GraficoColumnasProps {
  datos: PuntoColumna[]
  /** Nombre de la medida, para el tooltip y la tabla (p. ej. "Reportes"). */
  medida: string
}

/**
 * Columnas de una sola serie a lo largo del tiempo. Cada columna es su propio
 * blanco de hover/foco (toda la franja, no solo la barra pintada) y la tabla
 * equivalente queda disponible sin depender del tooltip.
 */
export default function GraficoColumnas({ datos, medida }: GraficoColumnasProps) {
  const [activa, setActiva] = useState<number | null>(null)
  const idTabla = useId()

  const maximo = Math.max(0, ...datos.map((d) => d.valor))
  const ticks = ticksLimpios(maximo)
  const tope = ticks[ticks.length - 1] || 1
  // Solo ~6 etiquetas en el eje X, para que no se pisen.
  const cadaCuantas = Math.max(1, Math.ceil(datos.length / 6))
  const indiceMaximo = maximo > 0 ? datos.findIndex((d) => d.valor === maximo) : -1

  return (
    <div className={styles.columnasFigura}>
      <div className={styles.columnasMarco}>
        <div className={styles.ejeY} aria-hidden="true">
          {ticks.map((tick) => (
            <span key={tick} style={{ bottom: `${(tick / tope) * 100}%` }}>
              {tick.toLocaleString('es-CL')}
            </span>
          ))}
        </div>

        <div className={styles.areaColumnas} onPointerLeave={() => setActiva(null)}>
          {ticks.map((tick) => (
            <span
              key={tick}
              className={styles.lineaGuia}
              style={{ bottom: `${(tick / tope) * 100}%` }}
              aria-hidden="true"
            />
          ))}

          <div className={styles.columnas}>
            {datos.map((punto, i) => {
              const alto = (punto.valor / tope) * 100
              return (
                <button
                  key={punto.clave}
                  type="button"
                  className={`${styles.columna} ${activa === i ? styles.columnaActiva : ''}`}
                  onPointerEnter={() => setActiva(i)}
                  onFocus={() => setActiva(i)}
                  onBlur={() => setActiva(null)}
                  aria-label={`${punto.etiqueta}: ${punto.valor} ${medida.toLowerCase()}`}
                >
                  {punto.valor > 0 && <span className={styles.barraColumna} style={{ height: `${alto}%` }} />}
                  {i === indiceMaximo && activa === null && (
                    <span className={styles.etiquetaTope} style={{ bottom: `${alto}%` }}>
                      {punto.valor.toLocaleString('es-CL')}
                    </span>
                  )}
                </button>
              )
            })}
          </div>

          {activa !== null && datos[activa] && (
            <div
              className={styles.tooltip}
              style={{
                left: `${((activa + 0.5) / datos.length) * 100}%`,
                bottom: `${(datos[activa].valor / tope) * 100}%`,
                // En los bordes el tooltip se ancla hacia adentro para no salirse de la tarjeta.
                transform: `translate(${
                  (activa + 0.5) / datos.length < 0.2
                    ? '-10%'
                    : (activa + 0.5) / datos.length > 0.8
                      ? '-90%'
                      : '-50%'
                }, -8px)`,
              }}
              role="status"
            >
              <strong>{datos[activa].valor.toLocaleString('es-CL')}</strong>
              <span>
                {medida} · {datos[activa].etiqueta}
              </span>
            </div>
          )}
        </div>
      </div>

      <div className={styles.ejeX} aria-hidden="true">
        {datos.map((punto, i) => (
          <span key={punto.clave}>
            {i % cadaCuantas === 0 || i === datos.length - 1 ? punto.etiquetaCorta : ''}
          </span>
        ))}
      </div>

      <details className={styles.tablaVista} data-no-imprimir>
        <summary aria-controls={idTabla}>Ver como tabla</summary>
        <table id={idTabla} className={styles.tabla}>
          <thead>
            <tr>
              <th scope="col">Periodo</th>
              <th scope="col" className={styles.numero}>
                {medida}
              </th>
            </tr>
          </thead>
          <tbody>
            {datos.map((punto) => (
              <tr key={punto.clave}>
                <td>{punto.etiqueta}</td>
                <td className={styles.numero}>{punto.valor.toLocaleString('es-CL')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  )
}
