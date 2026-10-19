import { iniciales } from './soporte'
import styles from './Soporte.module.css'

/** Círculo con las iniciales: celeste para el equipo, gris azulado para el vecino. */
export default function AvatarSoporte({
  nombre,
  equipo = false,
  grande = false,
}: {
  nombre: string
  equipo?: boolean
  grande?: boolean
}) {
  return (
    <span
      className={`${styles.avatar} ${equipo ? styles.avatarEquipo : ''} ${grande ? styles.avatarGrande : ''}`}
      aria-hidden="true"
    >
      {iniciales(nombre)}
    </span>
  )
}
