import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { MOTIVO_RETIRO_MAXIMO } from '@ciudad-alerta/comun'
import estilosDialogo from '../Dialogo/Dialogo.module.css'
import styles from './TuReporte.module.css'

interface Props {
  /** Retira el reporte con el motivo (puede ir vacío); si falla, lanza un error con el mensaje para mostrar. */
  onConfirmar: (motivo: string) => Promise<void>
  onCerrar: () => void
}

/** Confirma el retiro del reporte propio y deja escribir, si se quiere, el motivo. */
export default function DialogoRetirarReporte({ onConfirmar, onCerrar }: Props) {
  const ref = useRef<HTMLDialogElement>(null)
  const [motivo, setMotivo] = useState('')
  const [error, setError] = useState('')
  const [retirando, setRetirando] = useState(false)

  // Sin close() al desmontar: en desarrollo (StrictMode) el efecto se monta dos veces.
  useEffect(() => {
    const dialogo = ref.current
    if (dialogo && !dialogo.open) dialogo.showModal()
  }, [])

  async function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setRetirando(true)
    setError('')
    try {
      await onConfirmar(motivo)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No pudimos retirar tu reporte. Inténtalo nuevamente.')
      setRetirando(false)
    }
  }

  return (
    <dialog
      ref={ref}
      className={estilosDialogo.dialogo}
      aria-labelledby="retirar-reporte-titulo"
      // Este diálogo va dentro del detalle del reporte: sin stopPropagation, React también le pasa el
      // `close` (y el `cancel`) al detalle y lo cierra con él.
      onCancel={(e) => {
        e.stopPropagation()
        if (retirando) e.preventDefault()
      }}
      onClose={(e) => {
        e.stopPropagation()
        onCerrar()
      }}
      onClick={(e) => {
        if (e.target === ref.current && !retirando) ref.current?.close()
      }}
    >
      <form className={estilosDialogo.contenido} onSubmit={enviar} noValidate>
        <h2 id="retirar-reporte-titulo" className={estilosDialogo.titulo}>
          Retirar mi reporte
        </h2>
        <div className={estilosDialogo.mensaje}>
          <p>
            Tu reporte quedará <strong>cerrado</strong> y el organismo no lo atenderá. Aparecerá como «Retirado por quien lo
            reportó», sin tu nombre.
          </p>
          <p>No se puede deshacer.</p>
        </div>
        <label className={styles.campo}>
          <span>Motivo (opcional)</span>
          <textarea
            className={styles.entrada}
            rows={3}
            value={motivo}
            maxLength={MOTIVO_RETIRO_MAXIMO}
            onChange={(e) => setMotivo(e.target.value)}
            disabled={retirando}
          />
          <span className={styles.contador}>
            {motivo.length}/{MOTIVO_RETIRO_MAXIMO}
          </span>
        </label>
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
        <div className={estilosDialogo.acciones}>
          <button type="button" className={estilosDialogo.cancelar} onClick={() => ref.current?.close()} disabled={retirando}>
            Cancelar
          </button>
          <button type="submit" className={estilosDialogo.confirmarPeligro} disabled={retirando}>
            {retirando ? 'Retirando…' : 'Sí, retirar'}
          </button>
        </div>
      </form>
    </dialog>
  )
}
