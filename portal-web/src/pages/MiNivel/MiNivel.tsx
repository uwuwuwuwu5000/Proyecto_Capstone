import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import Navbar from '../../components/Navbar/Navbar'
import { NOMBRE_NIVEL, TABLA_NIVELES } from '../../confianza/niveles'
import {
  ANTIGUEDAD_MINIMA_MS,
  NIVEL_MAXIMO,
  PAUSA_ENTRE_CONFIRMACIONES_MS,
  UMBRALES_NIVEL,
  limiteDiario,
  nivelDePuntos,
  pesoDelVoto,
  puntosParaSiguienteNivel,
} from '../../confianza/reglas'
import { useConfianza } from '../../confianza/useConfianza'
import styles from './MiNivel.module.css'

const formatoPeso = (peso: number) => String(peso).replace('.', ',')

export default function MiNivel() {
  const { user, perfil, loading: sesionCargando, perfilCargando } = useAuth()
  const { confianza, hoy, cargando, sinDatos } = useConfianza()
  // El estado de verificación del correo cambia fuera de la app: se relee al pedirlo.
  const [verificado, setVerificado] = useState<boolean | null>(null)
  const [comprobando, setComprobando] = useState(false)
  const [aviso, setAviso] = useState('')

  if (!sesionCargando && !user) return <Navigate to="/login" replace />
  // La confianza se gana reportando: aplica a las cuentas de vecinos.
  if (!sesionCargando && !perfilCargando && perfil && perfil.role !== 'ciudadano') {
    return <Navigate to="/" replace />
  }

  const puntos = confianza.puntosConfianza
  const nivel = nivelDePuntos(puntos)
  const faltan = puntosParaSiguienteNivel(puntos)
  const desde = UMBRALES_NIVEL[nivel]
  const hasta = nivel >= NIVEL_MAXIMO ? desde : UMBRALES_NIVEL[nivel + 1]
  const avance = nivel >= NIVEL_MAXIMO ? 100 : Math.round(((puntos - desde) / (hasta - desde)) * 100)

  const correoVerificado = verificado ?? user?.emailVerified ?? false
  const creadaEn = perfil?.createdAt?.getTime() ?? null
  const cuentaAntigua = creadaEn !== null && Date.now() - creadaEn >= ANTIGUEDAD_MINIMA_MS
  const peso = pesoDelVoto(nivel, correoVerificado, creadaEn)
  const limite = limiteDiario(nivel)
  const restantes = Math.max(0, limite - hoy.confirmaciones)

  async function yaVerifique() {
    if (!user) return
    setComprobando(true)
    setAviso('')
    try {
      // Relee el estado del correo y renueva el token una vez: sin esto, las
      // reglas siguen viendo el correo como no verificado hasta por una hora.
      await user.reload()
      await user.getIdToken(true)
      setVerificado(user.emailVerified)
      if (!user.emailVerified) setAviso('Todavía no vemos tu correo como verificado. Abre el enlace que te enviamos.')
    } catch (err) {
      console.error('No se pudo comprobar el correo:', err)
      setAviso('No pudimos comprobarlo. Inténtalo de nuevo en un momento.')
    } finally {
      setComprobando(false)
    }
  }

  return (
    <div className={styles.page}>
      <Navbar />
      <main className={styles.main}>
        <h1 className={styles.title}>Mi nivel de confianza</h1>
        <p className={styles.subtitle}>
          Tu nivel sube cuando tus reportes son verificados como reales, y hace que tus confirmaciones pesen más.
        </p>

        {(sesionCargando || cargando) && <p className={styles.estado}>Cargando tu nivel…</p>}

        {!sesionCargando && !cargando && (
          <>
            <section className={styles.tarjetaNivel} aria-label="Tu nivel actual">
              <div className={styles.insignia} aria-hidden="true">
                {nivel}
              </div>
              <div className={styles.nivelDatos}>
                <p className={styles.nivelNombre}>
                  Nivel {nivel} · {NOMBRE_NIVEL[nivel]}
                </p>
                <p className={styles.nivelPuntos}>{puntos} puntos de confianza</p>
                <div
                  className={styles.barra}
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={avance}
                  aria-label="Avance hacia el siguiente nivel"
                >
                  <div className={styles.barraRelleno} style={{ width: `${avance}%` }} />
                </div>
                <p className={styles.nivelSiguiente}>
                  {faltan === null
                    ? 'Estás en el nivel máximo.'
                    : `Te faltan ${faltan} puntos para el nivel ${nivel + 1} · ${NOMBRE_NIVEL[nivel + 1]}.`}
                </p>
              </div>
              <dl className={styles.contadores}>
                <div>
                  <dt>Reportes reales</dt>
                  <dd>{confianza.validatedReports}</dd>
                </div>
                <div>
                  <dt>Reportes falsos</dt>
                  <dd>{confianza.reportesFalsos}</dd>
                </div>
              </dl>
            </section>

            {sinDatos && (
              <p className={styles.nota}>
                Todavía no tienes reportes verificados: empiezas en el nivel 0 con 0 puntos.
              </p>
            )}

            {confianza.confirmacionesSuspendidas && (
              <p className={styles.alerta} role="alert">
                Tus confirmaciones están suspendidas por la administración. Puedes seguir reportando.
              </p>
            )}

            <section className={styles.tarjeta} aria-label="Tu voto">
              <h2 className={styles.subtitulo}>Tu voto cuando confirmas un reporte</h2>
              <p className={styles.pesoVoto}>
                Hoy tu voto pesa <strong>{formatoPeso(peso)}</strong> de 100 puntos de verificación.
              </p>
              <ul className={styles.condiciones}>
                <li className={correoVerificado ? styles.cumple : styles.noCumple}>
                  {correoVerificado ? '✓' : '✗'} Correo verificado
                  {!correoVerificado && (
                    <button type="button" className={styles.enlace} onClick={yaVerifique} disabled={comprobando}>
                      {comprobando ? 'Comprobando…' : 'Ya verifiqué mi correo'}
                    </button>
                  )}
                </li>
                <li className={cuentaAntigua ? styles.cumple : styles.noCumple}>
                  {cuentaAntigua ? '✓' : '✗'} Cuenta con más de 24 horas
                </li>
              </ul>
              {(!correoVerificado || !cuentaAntigua) && (
                <p className={styles.nota}>
                  Mientras falte alguna de estas condiciones tu confirmación se registra, pero pesa 0.
                </p>
              )}
              {aviso && <p className={styles.nota}>{aviso}</p>}
              <p className={styles.limite}>
                Confirmaciones de hoy: <strong>{hoy.confirmaciones}</strong> de {limite}
                {restantes === 0 ? ' · llegaste al límite de hoy.' : ` · te quedan ${restantes}.`} Entre una y otra
                esperas {PAUSA_ENTRE_CONFIRMACIONES_MS / 1000} segundos.
              </p>
            </section>

            <section className={styles.tarjeta} aria-label="Cómo funciona">
              <h2 className={styles.subtitulo}>Cómo funciona</h2>
              <ol className={styles.pasos}>
                <li>Cuando confirmas un reporte, tu voto suma puntos a su «verificación de la comunidad».</li>
                <li>Con 100 puntos y al menos 3 personas distintas, el reporte queda validado por la comunidad.</li>
                <li>Un operador revisa y marca el reporte como real o falso.</li>
                <li>Un reporte tuyo real te da 10 puntos; uno falso te quita 15.</li>
                <li>Mientras más alto tu nivel, más pesa tu voto y más confirmaciones puedes hacer al día.</li>
              </ol>
            </section>

            <section className={styles.tarjeta} aria-label="Niveles">
              <h2 className={styles.subtitulo}>Todos los niveles</h2>
              <div className={styles.tablaScroll}>
                <table className={styles.tabla}>
                  <thead>
                    <tr>
                      <th>Nivel</th>
                      <th>Puntos</th>
                      <th>Peso del voto</th>
                      <th>Confirmaciones al día</th>
                      <th>Reconocimiento</th>
                    </tr>
                  </thead>
                  <tbody>
                    {TABLA_NIVELES.map((fila) => (
                      <tr key={fila.nivel} className={fila.nivel === nivel ? styles.filaActual : undefined}>
                        <td>
                          {fila.nivel} · {fila.nombre}
                        </td>
                        <td>{fila.puntos}</td>
                        <td>{formatoPeso(fila.peso)}</td>
                        <td>{fila.limite}</td>
                        <td>{fila.reconocimiento ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  )
}
