import { useState } from 'react'
import { CLAVE_OTRAS, COLOR_OTRAS, construirRebanadas, rutaDeRebanada } from './torta'
import type { FilaTorta, Rebanada } from './torta'
import styles from './GraficoTorta.module.css'

interface GraficoTortaProps {
  /** Nombre del gráfico: lo leen los lectores de pantalla y rotula la leyenda. */
  titulo: string
  filas: FilaTorta[]
  /** Total del periodo: con él se calculan los porcentajes y lo que falta va a «Otras». */
  total: number
  /** Muestra en la leyenda también las filas en cero (los estados). */
  mostrarCeros?: boolean
  /** Rebanadas como máximo antes de juntar el resto en «Otras». */
  maximo?: number
}

const CENTRO = 100
const RADIO = 90
/** Cuánto se separa del centro la rebanada resaltada. */
const SALTO = 5

/**
 * Gráfico de torta con su leyenda (cantidad y porcentaje de cada parte). Al pasar el cursor o enfocar una fila de la
 * leyenda se resalta su rebanada, y al revés. El detalle completo queda en la leyenda y en el texto alternativo,
 * así no depende del color ni del puntero.
 */
export default function GraficoTorta({ titulo, filas, total, mostrarCeros = false, maximo = 8 }: GraficoTortaProps) {
  const [activa, setActiva] = useState<string | null>(null)
  const rebanadas = construirRebanadas(filas, total, maximo)

  if (rebanadas.length === 0) {
    return <p className={styles.vacio}>No hay reportes en el periodo.</p>
  }

  const porClave = new Map(rebanadas.map((r) => [r.clave, r]))
  const enCero = (f: FilaTorta): Rebanada => ({
    clave: f.clave,
    etiqueta: f.etiqueta,
    valor: 0,
    porcentaje: 0,
    color: f.colorIdentidad ?? COLOR_OTRAS,
    inicio: 0,
    fin: 0,
  })
  const otras = porClave.get(CLAVE_OTRAS)
  const leyenda: Rebanada[] = mostrarCeros
    ? [...filas.map((f) => porClave.get(f.clave) ?? enCero(f)), ...(otras ? [otras] : [])]
    : rebanadas

  const resumen = rebanadas.map((r) => `${r.etiqueta} ${r.valor} (${r.porcentaje}%)`).join('; ')

  return (
    <div className={styles.torta}>
      <svg
        className={styles.figura}
        viewBox="0 0 200 200"
        role="img"
        aria-label={`Gráfico de torta: ${titulo}. ${resumen}`}
      >
        {rebanadas.map((r) => {
          const esActiva = activa === r.clave
          // Con una sola rebanada no hay hacia dónde separarla.
          const medio = (((r.inicio + r.fin) / 2) * Math.PI) / 180
          const mueve = esActiva && rebanadas.length > 1
          return (
            <path
              key={r.clave}
              data-rebanada={r.clave}
              d={rutaDeRebanada(CENTRO, CENTRO, RADIO, r.inicio, r.fin)}
              fill={r.color}
              className={`${styles.rebanada} ${activa && !esActiva ? styles.apagada : ''}`}
              transform={mueve ? `translate(${(SALTO * Math.sin(medio)).toFixed(2)} ${(-SALTO * Math.cos(medio)).toFixed(2)})` : undefined}
              onPointerEnter={() => setActiva(r.clave)}
              onPointerLeave={() => setActiva(null)}
            />
          )
        })}
      </svg>

      <ul className={styles.leyenda} aria-label={`Leyenda de ${titulo}`}>
        {leyenda.map((r) => (
          <li
            key={r.clave}
            className={`${styles.item} ${activa === r.clave ? styles.itemActivo : ''} ${r.valor === 0 ? styles.itemCero : ''}`}
            tabIndex={0}
            onPointerEnter={() => setActiva(r.clave)}
            onPointerLeave={() => setActiva(null)}
            onFocus={() => setActiva(r.clave)}
            onBlur={() => setActiva(null)}
            aria-label={`${r.etiqueta}: ${r.valor} (${r.porcentaje}%)`}
          >
            <span className={styles.punto} style={{ background: r.color }} aria-hidden="true" />
            <span className={styles.nombre}>{r.etiqueta}</span>
            <span className={styles.valor} aria-hidden="true">
              {r.valor.toLocaleString('es-CL')}
              <span className={styles.porcentaje}> · {r.porcentaje}%</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
