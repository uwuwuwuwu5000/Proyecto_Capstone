import { useEffect, useRef } from 'react'
import styles from './Reportes.module.css'

/** Casilla "Seleccionar todos (N)": a medias cuando hay algunos seleccionados. */
export default function CasillaTodos({
  total,
  todos,
  algunos,
  onAlternar,
}: {
  total: number
  todos: boolean
  algunos: boolean
  onAlternar: () => void
}) {
  const ref = useRef<HTMLInputElement>(null)

  // "indeterminate" no existe como atributo HTML: solo como propiedad.
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = algunos
  }, [algunos])

  return (
    <label className={styles.seleccionarTodos}>
      <input
        ref={ref}
        type="checkbox"
        checked={todos}
        onChange={onAlternar}
        disabled={total === 0}
      />
      Seleccionar esta página ({total.toLocaleString('es-CL')})
    </label>
  )
}
