import { useState } from 'react'
import { db } from '../firebase/config'
import { useAuth } from '../context/AuthContext'
import type { Reporte } from '../components/Reportes/reporte'
import { formatearFecha } from '../components/Reportes/reporte'
import { COMENTARIO_MAXIMO, darVeredicto, mensajeDeErrorVeredicto } from './veredicto'
import { NOMBRE_NIVEL } from './niveles'
import styles from './VeredictoReporte.module.css'

interface Props {
  reporte: Reporte
  /** Se llama tras guardar, para que el detalle vuelva a leer el reporte. */
  onAplicado: () => void
}

/**
 * Veredicto de un operador o administrador: «real» o «falso». Se muestra solo
 * en la vista de gestión; las reglas deciden quién puede guardarlo (el
 * operador asignado o un administrador).
 */
export default function VeredictoReporte({ reporte, onAplicado }: Props) {
  const { user, perfil } = useAuth()
  const [modo, setModo] = useState<'real' | 'falso' | null>(null)
  const [comentario, setComentario] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const [resultado, setResultado] = useState('')

  const v = reporte.validacion
  const esGestor = perfil?.role === 'operador' || perfil?.role === 'admin'
  if (!user || !esGestor) return null

  async function guardar() {
    if (!user || !modo) return
    setGuardando(true)
    setError('')
    try {
      const r = await darVeredicto(db, {
        reportId: reporte.id,
        veredicto: modo,
        comentario,
        gestorUid: user.uid,
      })
      const cambio = r.aplicados === 0 ? 'sin cambio de puntos' : `${r.aplicados > 0 ? '+' : ''}${r.aplicados} puntos`
      setResultado(
        `Veredicto guardado (${cambio}). El autor ahora tiene ${r.puntos} puntos, nivel ${r.nivel} · ${NOMBRE_NIVEL[r.nivel]}.`,
      )
      setModo(null)
      setComentario('')
      onAplicado()
    } catch (err) {
      setError(mensajeDeErrorVeredicto(err))
    } finally {
      setGuardando(false)
    }
  }

  // Ya tiene veredicto: solo se muestra, no se cambia.
  if (v.veredicto) {
    return (
      <div className={styles.raiz}>
        <span className={styles.titulo}>Veredicto</span>
        <p className={v.veredicto === 'real' ? styles.real : styles.falso}>
          {v.veredicto === 'real' ? 'Marcado como real' : 'Marcado como falso'}
          {v.veredictoAt && ` el ${formatearFecha(v.veredictoAt, true)}`}
          {typeof v.veredictoPuntos === 'number' &&
            ` · ${v.veredictoPuntos > 0 ? '+' : ''}${v.veredictoPuntos} puntos al autor`}
        </p>
        {v.veredictoComentario && <p className={styles.comentario}>«{v.veredictoComentario}»</p>}
        {resultado && <p className={styles.ok}>{resultado}</p>}
        <p className={styles.nota}>Un veredicto no se puede cambiar.</p>
      </div>
    )
  }

  if (reporte.origen === 'portal_admin') {
    return (
      <div className={styles.raiz}>
        <span className={styles.titulo}>Veredicto</span>
        <p className={styles.nota}>
          Los reportes creados desde el portal por la administración no suman ni restan puntos, así que no admiten veredicto.
        </p>
      </div>
    )
  }

  if (reporte.uid === user.uid) {
    return (
      <div className={styles.raiz}>
        <span className={styles.titulo}>Veredicto</span>
        <p className={styles.nota}>No puedes dar un veredicto a tu propio reporte.</p>
      </div>
    )
  }

  return (
    <div className={styles.raiz}>
      <span className={styles.titulo}>Veredicto</span>
      <p className={styles.nota}>
        {v.validado
          ? 'La comunidad validó este reporte. Revisa y marca el resultado: un reporte real suma 10 puntos al autor; uno falso resta 15.'
          : 'Puedes dar el veredicto aunque la comunidad aún no lo valide. Real suma 10 puntos al autor; falso resta 15.'}
      </p>

      {!modo && (
        <div className={styles.botones}>
          <button type="button" className={styles.botonReal} onClick={() => setModo('real')}>
            Marcar como real
          </button>
          <button type="button" className={styles.botonFalso} onClick={() => setModo('falso')}>
            Marcar como falso
          </button>
        </div>
      )}

      {modo && (
        <div className={styles.formulario}>
          <label className={styles.etiqueta} htmlFor="veredicto-comentario">
            {modo === 'falso' ? 'Motivo (obligatorio)' : 'Comentario (opcional)'}
          </label>
          <textarea
            id="veredicto-comentario"
            className={styles.entrada}
            rows={3}
            maxLength={COMENTARIO_MAXIMO}
            value={comentario}
            onChange={(e) => setComentario(e.target.value)}
            placeholder={modo === 'falso' ? 'Explica por qué no corresponde (lo ve quien reportó).' : 'Por ejemplo: verificado en terreno.'}
          />
          <div className={styles.botones}>
            <button
              type="button"
              className={modo === 'real' ? styles.botonReal : styles.botonFalso}
              disabled={guardando || (modo === 'falso' && comentario.trim().length === 0)}
              onClick={guardar}
            >
              {guardando ? 'Guardando…' : modo === 'real' ? 'Confirmar: es real' : 'Confirmar: es falso'}
            </button>
            <button
              type="button"
              className={styles.botonCancelar}
              disabled={guardando}
              onClick={() => {
                setModo(null)
                setError('')
              }}
            >
              Cancelar
            </button>
          </div>
          <p className={styles.nota}>Un veredicto no se puede cambiar una vez guardado.</p>
        </div>
      )}

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      {resultado && <p className={styles.ok}>{resultado}</p>}
    </div>
  )
}
