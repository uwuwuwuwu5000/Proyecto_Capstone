import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { ELIMINAR_CUENTA } from '@ciudad-alerta/comun'
import estilosDialogo from '../Dialogo/Dialogo.module.css'
import styles from './DialogoEliminarCuenta.module.css'

interface Props {
  /** Elimina la cuenta con la contraseña; si falla, lanza un error con el mensaje para mostrar. */
  onConfirmar: (contrasena: string) => Promise<void>
  onCerrar: () => void
}

/** Pide la contraseña para eliminar la cuenta y explica qué se borra y qué se conserva (texto de `comun`). */
export default function DialogoEliminarCuenta({ onConfirmar, onCerrar }: Props) {
  const ref = useRef<HTMLDialogElement>(null)
  const [contrasena, setContrasena] = useState('')
  const [error, setError] = useState('')
  const [eliminando, setEliminando] = useState(false)

  // Sin close() al desmontar: en desarrollo (StrictMode) el efecto se monta dos veces.
  useEffect(() => {
    const dialogo = ref.current
    if (dialogo && !dialogo.open) dialogo.showModal()
  }, [])

  const secciones = ELIMINAR_CUENTA.secciones.filter((s) => s.titulo !== 'Desde la app')

  async function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!contrasena) {
      setError('Escribe tu contraseña para confirmar.')
      return
    }
    setEliminando(true)
    setError('')
    try {
      await onConfirmar(contrasena)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No pudimos eliminar tu cuenta. Inténtalo nuevamente.')
      setEliminando(false)
    }
  }

  return (
    <dialog
      ref={ref}
      className={estilosDialogo.dialogo}
      aria-labelledby="eliminar-cuenta-titulo"
      onCancel={(e) => {
        // Escape no debe interrumpir la eliminación.
        if (eliminando) e.preventDefault()
      }}
      onClose={onCerrar}
      onClick={(e) => {
        if (e.target === ref.current && !eliminando) ref.current?.close()
      }}
    >
      <form className={estilosDialogo.contenido} onSubmit={enviar} noValidate>
        <h2 id="eliminar-cuenta-titulo" className={estilosDialogo.titulo}>
          Eliminar mi cuenta
        </h2>
        <div className={estilosDialogo.mensaje}>
          {secciones.map((s) => (
            <p key={s.titulo}>
              <strong>{s.titulo}.</strong> {s.parrafos.join(' ')}
            </p>
          ))}
          <p>No se puede deshacer.</p>
        </div>
        <label className={styles.campo}>
          <span>Contraseña</span>
          <input
            type="password"
            className={styles.entrada}
            value={contrasena}
            onChange={(e) => setContrasena(e.target.value)}
            autoComplete="current-password"
            disabled={eliminando}
          />
        </label>
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
        <div className={estilosDialogo.acciones}>
          <button type="button" className={estilosDialogo.cancelar} onClick={() => ref.current?.close()} disabled={eliminando}>
            Cancelar
          </button>
          <button type="submit" className={estilosDialogo.confirmarPeligro} disabled={eliminando}>
            {eliminando ? 'Eliminando…' : 'Eliminar mi cuenta'}
          </button>
        </div>
      </form>
    </dialog>
  )
}
