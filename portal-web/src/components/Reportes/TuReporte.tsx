import { useState } from 'react'
import { DESCRIPCION_MAX, puedeCorregirReporte } from '@ciudad-alerta/comun'
import { db } from '../../firebase/config'
import { MiReporteError, corregirReporte, retirarReporte } from './miReporte'
import DialogoRetirarReporte from './DialogoRetirarReporte'
import type { Reporte } from './reporte'
import styles from './TuReporte.module.css'

export interface ResultadoMiReporte {
  aviso: string
  /** true si no se pudo hacer porque el reporte cambió (ya lo revisan o ya lo confirmaron). */
  error?: boolean
}

interface Props {
  reporte: Reporte
  uid: string
  /** Se llama al terminar, o al descubrir que el reporte cambió: quien lo muestra vuelve a leerlo. */
  onResultado: (resultado: ResultadoMiReporte) => void
}

/** Lo que el autor puede hacer con su reporte mientras sigue en «Reportado»: corregir la descripción o retirarlo. */
export default function TuReporte({ reporte, uid, onResultado }: Props) {
  const [editando, setEditando] = useState(false)
  const [texto, setTexto] = useState(reporte.descripcion)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const [retirando, setRetirando] = useState(false)
  const sePuedeCorregir = puedeCorregirReporte(reporte, uid)

  function empezarAEditar() {
    setTexto(reporte.descripcion)
    setError('')
    setEditando(true)
  }

  async function guardar() {
    setGuardando(true)
    setError('')
    try {
      await corregirReporte(db, reporte, uid, texto)
      setEditando(false)
      onResultado({ aviso: 'Descripción corregida.' })
    } catch (e) {
      if (e instanceof MiReporteError && (e.code === 'ya_revisado' || e.code === 'ya_confirmado')) {
        setEditando(false)
        onResultado({ aviso: e.message, error: true })
      } else {
        setError(e instanceof Error ? e.message : 'No pudimos guardar el cambio. Inténtalo nuevamente.')
      }
    } finally {
      setGuardando(false)
    }
  }

  async function retirar(motivo: string) {
    try {
      await retirarReporte(db, reporte, uid, motivo)
    } catch (e) {
      if (e instanceof MiReporteError && e.code === 'ya_revisado') {
        setRetirando(false)
        onResultado({ aviso: e.message, error: true })
        return
      }
      throw e
    }
    setRetirando(false)
    onResultado({ aviso: 'Retiraste tu reporte: quedó cerrado.' })
  }

  const largo = texto.trim().length

  return (
    <section className={styles.tarjeta} aria-labelledby="tu-reporte-titulo">
      <h3 id="tu-reporte-titulo" className={styles.titulo}>
        Tu reporte
      </h3>
      {editando ? (
        <>
          <label className={styles.campo}>
            <span>Descripción</span>
            <textarea className={styles.entrada} rows={4} value={texto} onChange={(e) => setTexto(e.target.value)} disabled={guardando} />
            <span className={`${styles.contador} ${largo > DESCRIPCION_MAX ? styles.contadorLargo : ''}`}>
              {largo}/{DESCRIPCION_MAX}
            </span>
          </label>
          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}
          <div className={styles.acciones}>
            <button type="button" className={styles.boton} onClick={() => setEditando(false)} disabled={guardando}>
              Cancelar
            </button>
            <button type="button" className={styles.boton} onClick={guardar} disabled={guardando}>
              {guardando ? 'Guardando…' : 'Guardar cambios'}
            </button>
          </div>
        </>
      ) : (
        <>
          <p className={styles.texto}>
            {sePuedeCorregir
              ? 'Mientras el organismo no lo revise, puedes corregir la descripción o retirarlo.'
              : 'Ya hay vecinos que confirmaron este reporte, así que la descripción ya no se puede corregir. Si quedó mal, puedes retirarlo.'}
          </p>
          <div className={styles.acciones}>
            {sePuedeCorregir && (
              <button type="button" className={styles.boton} onClick={empezarAEditar}>
                Corregir descripción
              </button>
            )}
            <button type="button" className={styles.peligro} onClick={() => setRetirando(true)}>
              Retirar reporte
            </button>
          </div>
        </>
      )}
      {retirando && <DialogoRetirarReporte onConfirmar={retirar} onCerrar={() => setRetirando(false)} />}
    </section>
  )
}
