import { useState } from 'react'
import { RANGOS_RAPIDOS, rangoRapido } from './rangosRapidos'
import styles from './SelectorRangos.module.css'

interface SelectorRangosProps {
  desde: string
  hasta: string
  onCambiar: (desde: string, hasta: string) => void
  /** id del campo "Desde": "Personalizado" lleva el foco ahí para elegir a mano. */
  idCampoDesde: string
}

/**
 * Accesos rápidos de fecha (Hoy, Esta semana, Último mes…) más
 * "Personalizado". El activo se deduce de las fechas; "Personalizado" queda
 * marcado cuando no coinciden con ningún acceso rápido (fechas elegidas a
 * mano, o sin fechas) o cuando el usuario lo toca.
 */
export default function SelectorRangos({
  desde,
  hasta,
  onCambiar,
  idCampoDesde,
}: SelectorRangosProps) {
  const [personalizadoElegido, setPersonalizadoElegido] = useState(false)

  const hoy = new Date()
  const coincidente = RANGOS_RAPIDOS.find((rango) => {
    const calculado = rango.calcular(hoy)
    return calculado.desde === desde && calculado.hasta === hasta
  })?.clave
  const activo = personalizadoElegido || !coincidente ? 'personalizado' : coincidente

  function elegirPersonalizado() {
    setPersonalizadoElegido(true)
    const campo = document.getElementById(idCampoDesde) as HTMLInputElement | null
    campo?.focus()
  }

  return (
    <div className={styles.rangos} role="group" aria-label="Rangos de fecha">
      {RANGOS_RAPIDOS.map((rango) => (
        <button
          key={rango.clave}
          type="button"
          className={`${styles.rango} ${activo === rango.clave ? styles.rangoActivo : ''}`}
          aria-pressed={activo === rango.clave}
          onClick={() => {
            setPersonalizadoElegido(false)
            const fechas = rangoRapido(rango.clave)
            onCambiar(fechas.desde, fechas.hasta)
          }}
        >
          {rango.etiqueta}
        </button>
      ))}
      <button
        type="button"
        className={`${styles.rango} ${activo === 'personalizado' ? styles.rangoActivo : ''}`}
        aria-pressed={activo === 'personalizado'}
        onClick={elegirPersonalizado}
      >
        Personalizado
      </button>
    </div>
  )
}
