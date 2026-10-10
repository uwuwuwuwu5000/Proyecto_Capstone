import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import styles from './Dialogo.module.css'

export interface OpcionesConfirmacion {
  titulo: string
  mensaje: ReactNode
  /** Texto del botón que confirma (p. ej. "Eliminar 3 reportes"). */
  confirmar: string
  cancelar?: string
  /** Acción destructiva: el botón de confirmar va en rojo. */
  peligroso?: boolean
}

interface Pedido {
  opciones: OpcionesConfirmacion
  responder: (aceptado: boolean) => void
}

/**
 * Reemplazo de window.confirm con el estilo del portal:
 *
 *   const { confirmar, dialogo } = useConfirmacion()
 *   if (!(await confirmar({ titulo, mensaje, confirmar: 'Eliminar' }))) return
 *   …
 *   return <>{…}{dialogo}</>
 */
export function useConfirmacion() {
  const [pedido, setPedido] = useState<Pedido | null>(null)

  const confirmar = useCallback(
    (opciones: OpcionesConfirmacion) =>
      new Promise<boolean>((resolve) => {
        setPedido({
          opciones,
          responder: (aceptado) => {
            setPedido(null)
            resolve(aceptado)
          },
        })
      }),
    [],
  )

  const dialogo = pedido ? (
    <DialogoConfirmacion opciones={pedido.opciones} onResponder={pedido.responder} />
  ) : null

  return { confirmar, dialogo }
}

function DialogoConfirmacion({
  opciones,
  onResponder,
}: {
  opciones: OpcionesConfirmacion
  onResponder: (aceptado: boolean) => void
}) {
  const ref = useRef<HTMLDialogElement>(null)
  // Escape, el fondo y "Cancelar" cierran el <dialog>; onClose responde una
  // sola vez con lo que se eligió (por defecto, cancelar).
  const respuesta = useRef(false)

  // Sin close() al desmontar: en desarrollo (StrictMode) el efecto se monta
  // dos veces, y ese close() dispararía onClose y respondería "cancelar".
  useEffect(() => {
    const dialogo = ref.current
    if (dialogo && !dialogo.open) dialogo.showModal()
  }, [])

  function cerrar(aceptado: boolean) {
    respuesta.current = aceptado
    ref.current?.close()
  }

  return (
    <dialog
      ref={ref}
      className={styles.dialogo}
      aria-labelledby="confirmacion-titulo"
      onClose={() => onResponder(respuesta.current)}
      onClick={(e) => {
        if (e.target === ref.current) cerrar(false)
      }}
    >
      <div className={styles.contenido}>
        <h2 id="confirmacion-titulo" className={styles.titulo}>
          {opciones.titulo}
        </h2>
        <div className={styles.mensaje}>{opciones.mensaje}</div>
        <div className={styles.acciones}>
          {/* Foco inicial en cancelar: Enter por reflejo no ejecuta la acción. */}
          <button type="button" className={styles.cancelar} onClick={() => cerrar(false)} autoFocus>
            {opciones.cancelar ?? 'Cancelar'}
          </button>
          <button
            type="button"
            className={opciones.peligroso ? styles.confirmarPeligro : styles.confirmar}
            onClick={() => cerrar(true)}
          >
            {opciones.confirmar}
          </button>
        </div>
      </div>
    </dialog>
  )
}
