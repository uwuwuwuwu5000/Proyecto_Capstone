import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { doc, getDoc } from 'firebase/firestore'
import { esCuentaDeOrganismo, inicioDeDia, motivoDeBloqueo, numeroDeDia as numeroDeDiaComun } from '@ciudad-alerta/comun'
import { db } from '../firebase/config'
import { useAuth } from '../context/AuthContext'
import BarraVerificacion from './BarraVerificacion'
import { avisoPesoCero, confirmarReporte, mensajeDeError, ErrorConfirmacion } from './confirmar'
import type { ResultadoConfirmacion } from './confirmar'
import { PAUSA_ENTRE_CONFIRMACIONES_MS, limiteDiario, pesoDelVoto } from './reglas'
import type { Validacion } from './tipos'
import { useConfianza } from './useConfianza'
import styles from './VerificacionReporte.module.css'

interface Props {
  reporte: { id: string; uid: string; estado: string; validacion: Validacion }
  /** Se llama tras confirmar, para actualizar la copia del reporte que muestra el mapa. */
  onConfirmado?: (resultado: ResultadoConfirmacion) => void
}

const formatoPeso = (p: number) => String(p).replace('.', ',')

/**
 * Verificación de la comunidad de un reporte y botón de confirmar con peso, con
 * el mismo comportamiento y los mismos textos que la app móvil: la pausa de 20 s
 * cuenta regresiva dentro del botón, y debajo se ve cuánto vale tu voto y
 * cuántas confirmaciones te quedan hoy.
 */
export default function VerificacionReporte({ reporte, onConfirmado }: Props) {
  const { user, perfil } = useAuth()
  const { confianza, hoy, cargando } = useConfianza()
  const [propia, setPropia] = useState<{ peso: number | null } | false | null>(null)
  const [correoVerificado, setCorreoVerificado] = useState<boolean>(user?.emailVerified ?? false)
  const [enviando, setEnviando] = useState(false)
  const [mensaje, setMensaje] = useState<{ texto: string; tipo: 'ok' | 'aviso' | 'error' } | null>(null)
  const [ahora, setAhora] = useState(() => Date.now())

  const esAutor = !!user && reporte.uid === user.uid
  const esOperador = perfil?.role === 'operador'
  const uid = user?.uid ?? null

  // `email_verified` del token es lo que ven las reglas.
  useEffect(() => {
    let vigente = true
    user
      ?.getIdTokenResult()
      .then((t) => vigente && setCorreoVerificado(t.claims.email_verified === true))
      .catch(() => undefined)
    return () => {
      vigente = false
    }
  }, [user])

  // ¿Ya confirmó este reporte? Una lectura al abrirlo.
  useEffect(() => {
    setMensaje(null)
    if (!uid || esAutor || esOperador) {
      setPropia(false)
      return
    }
    let vigente = true
    setPropia(null)
    getDoc(doc(db, 'reports', reporte.id, 'confirmations', uid))
      .then((snap) => {
        if (!vigente) return
        const peso = snap.data()?.peso
        setPropia(snap.exists() ? { peso: typeof peso === 'number' ? peso : null } : false)
      })
      .catch(() => vigente && setPropia(false))
    return () => {
      vigente = false
    }
  }, [reporte.id, uid, esAutor, esOperador])

  const nivel = confianza.trustLevel
  const limite = limiteDiario(nivel)
  const restantes = Math.max(0, limite - hoy.confirmaciones)
  const pausaMs = hoy.ultimaAt ? Math.max(0, PAUSA_ENTRE_CONFIRMACIONES_MS - (ahora - hoy.ultimaAt.getTime())) : 0
  const segundos = Math.ceil(pausaMs / 1000)

  // Cuenta regresiva de la pausa: solo mientras falte tiempo.
  useEffect(() => {
    if (pausaMs <= 0) return
    const t = setInterval(() => setAhora(Date.now()), 1000)
    return () => clearInterval(t)
  }, [pausaMs > 0]) // eslint-disable-line react-hooks/exhaustive-deps

  const creadaEnMs = perfil?.createdAt?.getTime() ?? null
  const peso = pesoDelVoto(nivel, correoVerificado, creadaEnMs)
  const horaReinicio = new Date(inicioDeDia(numeroDeDiaComun(Date.now()) + 1)).toLocaleTimeString('es-CL', {
    hour: '2-digit',
    minute: '2-digit',
  })

  async function confirmar() {
    if (!user || enviando) return
    setEnviando(true)
    setMensaje(null)
    try {
      const token = await user.getIdTokenResult()
      const verificado = token.claims.email_verified === true
      const r = await confirmarReporte(db, {
        reportId: reporte.id,
        uid: user.uid,
        correoVerificado: verificado,
        creadaEnMs,
      })
      setPropia({ peso: r.peso })
      setAhora(Date.now())
      setMensaje(
        r.motivoPesoCero
          ? { texto: avisoPesoCero(r.motivoPesoCero), tipo: 'aviso' }
          : {
              texto: r.recienValidado
                ? 'Con tu confirmación el reporte quedó validado por la comunidad. ¡Gracias!'
                : `Confirmación registrada: aportaste ${formatoPeso(r.peso)} puntos.`,
              tipo: 'ok',
            },
      )
      onConfirmado?.(r)
    } catch (err) {
      if (err instanceof ErrorConfirmacion && err.codigo === 'ya_confirmo') setPropia({ peso: null })
      setMensaje({ texto: mensajeDeError(err), tipo: 'error' })
    } finally {
      setEnviando(false)
    }
  }

  const v = reporte.validacion
  // La misma decisión que toman las reglas y la app (comun/confianza/bloqueo.ts). La pausa de 20 s no
  // entra aquí: se ve como cuenta regresiva dentro del botón.
  const bloqueo = motivoDeBloqueo({
    propio: esAutor,
    operador: esOperador,
    organismo: esCuentaDeOrganismo(perfil?.role),
    estadoReporte: reporte.estado,
    conVeredicto: v.veredicto !== null,
    suspendido: confianza.confirmacionesSuspendidas,
    restantesHoy: restantes,
    pausaRestanteMs: 0,
  })
  let accion: React.ReactNode
  if (propia === null || cargando) {
    accion = <p className={styles.nota}>Comprobando si puedes confirmar…</p>
  } else if (propia) {
    accion = (
      <p className={styles.hecho}>
        ✓ Ya confirmaste este reporte{propia.peso ? ` · aportaste ${formatoPeso(propia.peso)} puntos` : ''}
      </p>
    )
  } else if (bloqueo === 'propio') {
    accion = <p className={styles.nota}>Este es tu reporte: lo confirman otros vecinos.</p>
  } else if (bloqueo === 'operador') {
    accion = <p className={styles.nota}>Las cuentas de operador gestionan reportes; no los confirman.</p>
  } else if (bloqueo === 'organismo') {
    accion = <p className={styles.nota}>Las cuentas de organismo reciben los reportes validados; no los confirman.</p>
  } else if (bloqueo === 'cerrado') {
    // Las reglas no aceptan confirmaciones en un reporte resuelto o cerrado (también los retirados por su autor).
    accion = <p className={styles.nota}>Este reporte ya está resuelto o cerrado: ya no se puede confirmar.</p>
  } else if (bloqueo === 'revisado') {
    accion = <p className={styles.nota}>Un operador ya revisó este reporte: no hace falta confirmarlo.</p>
  } else if (bloqueo === 'suspendido') {
    accion = (
      <p className={styles.aviso}>
        Tus confirmaciones están suspendidas por un administrador. Si crees que es un error, escríbenos en Soporte.
      </p>
    )
  } else if (bloqueo === 'limite') {
    accion = (
      <p className={styles.aviso}>
        Llegaste a tus {limite} confirmaciones de hoy. Se reinician a las {horaReinicio}.
      </p>
    )
  } else {
    accion = (
      <>
        <button type="button" className={styles.boton} disabled={enviando || segundos > 0} onClick={confirmar}>
          {enviando ? 'Registrando…' : segundos > 0 ? `Espera ${segundos} s` : 'Confirmar que existe'}
        </button>
        {peso > 0 ? (
          <p className={styles.nota}>
            Tu voto vale {formatoPeso(peso)} puntos · te quedan {restantes}{' '}
            {restantes === 1 ? 'confirmación' : 'confirmaciones'} hoy.
          </p>
        ) : !correoVerificado ? (
          <p className={styles.aviso}>
            Tu confirmación se registra, pero no suma puntos hasta que verifiques tu correo desde{' '}
            <Link to="/mi-perfil">Mi perfil</Link>.
          </p>
        ) : (
          <p className={styles.aviso}>
            Tu confirmación se registra, pero las cuentas con menos de 24 horas todavía no suman puntos.
          </p>
        )}
      </>
    )
  }

  return (
    <div className={styles.raiz}>
      <BarraVerificacion validacion={v} />
      {accion}
      {mensaje && (
        <p
          className={mensaje.tipo === 'aviso' ? styles.aviso : mensaje.tipo === 'ok' ? styles.ok : styles.error}
          role={mensaje.tipo === 'error' ? 'alert' : 'status'}
        >
          {mensaje.texto}
        </p>
      )}
      <Link to="/mi-nivel" className={styles.enlace}>
        ¿Cómo funciona la verificación?
      </Link>
    </div>
  )
}
