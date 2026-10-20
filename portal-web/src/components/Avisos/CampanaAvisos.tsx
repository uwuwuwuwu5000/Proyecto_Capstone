import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useSoporte } from '../../context/SoporteContext'
import { useAvisos } from '../../context/AvisosContext'
import type { Aviso } from '../../context/AvisosContext'
import { ETIQUETA_POR_ESTADO } from '../../constants/reportes'
import styles from './CampanaAvisos.module.css'

function quien(a: Aviso): string {
  if (a.autorRol === 'admin') return 'Administración Ciudad Alerta'
  return a.autorNombre ?? 'El organismo'
}

function hace(fecha: Date | null): string {
  if (!fecha) return ''
  const min = Math.floor((Date.now() - fecha.getTime()) / 60000)
  if (min < 1) return 'ahora'
  if (min < 60) return `hace ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `hace ${h} h`
  const d = Math.floor(h / 24)
  if (d < 7) return `hace ${d} d`
  return fecha.toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })
}

/** Campana de avisos del ciudadano; también del administrador, por los reportes que él creó; el operador no la ve. */
export default function CampanaAvisos() {
  const { perfil } = useAuth()
  const { avisos, noVistos, cargando, error, marcarVisto, marcarTodos } = useAvisos()
  const { abiertos } = useSoporte()
  const navigate = useNavigate()
  const [abierta, setAbierta] = useState(false)
  const raiz = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!abierta) return
    const tecla = (e: KeyboardEvent) => e.key === 'Escape' && setAbierta(false)
    const fuera = (e: PointerEvent) => {
      if (raiz.current && !raiz.current.contains(e.target as Node)) setAbierta(false)
    }
    window.addEventListener('keydown', tecla)
    window.addEventListener('pointerdown', fuera)
    return () => {
      window.removeEventListener('keydown', tecla)
      window.removeEventListener('pointerdown', fuera)
    }
  }, [abierta])

  if (perfil?.role !== 'ciudadano' && perfil?.role !== 'admin') return null

  // Solo el administrador: conversaciones de soporte que nadie ha atendido.
  // Es un conteo en vivo: crece con cada ciudadano que escribe y baja al responder.
  const soporte = perfil.role === 'admin' ? (abiertos ?? 0) : 0
  const total = noVistos + soporte

  function abrir(a: Aviso) {
    void marcarVisto(a.id)
    setAbierta(false)
    navigate(`/historial?reporte=${a.reportId}`)
  }

  return (
    <div ref={raiz} className={styles.raiz}>
      <button
        type="button"
        className={styles.boton}
        onClick={() => setAbierta((v) => !v)}
        aria-expanded={abierta}
        aria-haspopup="dialog"
        aria-label={total ? `Avisos, ${total} sin atender` : 'Avisos'}
      >
        <svg viewBox="0 0 24 24" className={styles.icono} aria-hidden="true">
          <path
            d="M6 9a6 6 0 1 1 12 0c0 4 1.5 5.5 2 6.5H4c.5-1 2-2.5 2-6.5Zm4 9.5a2 2 0 0 0 4 0"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        {total > 0 && <span className={styles.insignia}>{total > 9 ? '9+' : total}</span>}
      </button>

      {abierta && (
        <div className={styles.panel} role="dialog" aria-label="Avisos">
          <div className={styles.cabecera}>
            <strong>Avisos</strong>
            {noVistos > 0 && (
              <button type="button" className={styles.todos} onClick={() => void marcarTodos()}>
                Marcar todos como vistos
              </button>
            )}
          </div>
          <div className={styles.lista}>
            {soporte > 0 && (
              <button
                type="button"
                className={`${styles.aviso} ${styles.nuevo}`}
                onClick={() => {
                  setAbierta(false)
                  navigate('/admin/soporte')
                }}
              >
                <span className={styles.titulo}>
                  {soporte === 1
                    ? 'Tienes 1 mensaje de soporte sin responder'
                    : `Tienes ${soporte} conversaciones de soporte sin responder`}
                </span>
                <span className={styles.texto}>Ciudadanos esperando respuesta.</span>
                <span className={styles.meta}>Soporte · ver conversaciones</span>
              </button>
            )}
            {error && <p className={styles.vacio}>{error}</p>}
            {!error && cargando && <p className={styles.vacio}>Cargando…</p>}
            {!error && !cargando && avisos.length === 0 && soporte === 0 && (
              <p className={styles.vacio}>Aún no hay cambios en tus reportes.</p>
            )}
            {avisos.map((a) => (
              <button
                key={a.id}
                type="button"
                className={`${styles.aviso} ${a.visto ? '' : styles.nuevo}`}
                onClick={() => abrir(a)}
              >
                <span className={styles.titulo}>
                  Tu reporte pasó a «{ETIQUETA_POR_ESTADO[a.hacia] ?? a.hacia}»
                </span>
                <span className={styles.texto}>{a.reporte}</span>
                {a.comentario && <span className={styles.comentario}>“{a.comentario}”</span>}
                <span className={styles.meta}>
                  {quien(a)} · {hace(a.fecha)}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
