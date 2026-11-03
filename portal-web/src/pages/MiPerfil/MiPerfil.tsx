import { useEffect, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { sendEmailVerification } from 'firebase/auth'
import { FirebaseError } from 'firebase/app'
import { doc, getDoc, serverTimestamp, updateDoc } from 'firebase/firestore'
import { db } from '../../firebase/config'
import { useAuth } from '../../context/AuthContext'
import Navbar from '../../components/Navbar/Navbar'
import DialogoEliminarCuenta from '../../components/Perfil/DialogoEliminarCuenta'
import { eliminarCuenta } from '../../components/Perfil/eliminarCuenta'
import { NOMBRE_NIVEL } from '../../confianza/niveles'
import { nivelDePuntos } from '../../confianza/reglas'
import { useConfianza } from '../../confianza/useConfianza'
import styles from './MiPerfil.module.css'

const ETIQUETA_ROL: Record<string, string> = {
  admin: 'Administrador',
  operador: 'Operador',
  ciudadano: 'Ciudadano',
}

function mensajeDeError(err: unknown): string {
  const code = err instanceof FirebaseError ? err.code : ''
  if (code === 'auth/too-many-requests') {
    return 'Hiciste muchos intentos seguidos. Espera unos minutos y vuelve a intentarlo.'
  }
  return 'No pudimos enviar el correo de verificación. Inténtalo nuevamente.'
}

/** Mi perfil: datos de la cuenta y verificación del correo (igual que «Mi perfil» de la app móvil). */
export default function MiPerfil() {
  const { user, perfil, loading, perfilCargando, logout } = useAuth()
  const navigate = useNavigate()
  const { confianza } = useConfianza()

  // Verificar el correo ocurre fuera del portal: el estado se relee al pedirlo.
  const [verificado, setVerificado] = useState<boolean | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [enviado, setEnviado] = useState(false)
  const [comprobando, setComprobando] = useState(false)
  const [aviso, setAviso] = useState<{ texto: string; tipo: 'ok' | 'error' } | null>(null)
  const [operadorNombre, setOperadorNombre] = useState<string | null>(null)
  const [dialogoEliminar, setDialogoEliminar] = useState(false)
  // Mientras se elimina la cuenta, al quedar sin sesión se vuelve al inicio (y no al login) con un aviso.
  const [eliminando, setEliminando] = useState(false)

  const operadorId = perfil?.operadorId ?? null
  useEffect(() => {
    if (!operadorId) return
    let vigente = true
    getDoc(doc(db, 'operadores', operadorId))
      .then((snap) => {
        const nombre = snap.data()?.nombre
        if (vigente && typeof nombre === 'string') setOperadorNombre(nombre)
      })
      .catch(() => undefined)
    return () => {
      vigente = false
    }
  }, [operadorId])

  if (!loading && !user) {
    return eliminando ? (
      <Navigate to="/" replace state={{ cuentaEliminada: true }} />
    ) : (
      <Navigate to="/login" replace />
    )
  }

  const correoVerificado = verificado ?? user?.emailVerified ?? false

  async function enviar() {
    if (!user || enviando) return
    setEnviando(true)
    setAviso(null)
    try {
      await sendEmailVerification(user)
      setEnviado(true)
      setAviso({
        texto: `Te enviamos un enlace a ${user.email ?? 'tu correo'}. Revisa también la carpeta de spam.`,
        tipo: 'ok',
      })
    } catch (err) {
      console.error('No se pudo enviar la verificación del correo:', err)
      setAviso({ texto: mensajeDeError(err), tipo: 'error' })
    } finally {
      setEnviando(false)
    }
  }

  async function comprobar() {
    if (!user) return
    setComprobando(true)
    setAviso(null)
    try {
      await user.reload()
      if (!user.emailVerified) {
        setAviso({ texto: 'Todavía no aparece como verificado. Abre el enlace del correo y vuelve a intentarlo.', tipo: 'error' })
        return
      }
      // El token se renueva una vez: sin esto, las reglas siguen viendo el correo como no verificado.
      await user.getIdToken(true)
      setVerificado(true)
      setAviso({ texto: 'Correo verificado. ¡Gracias!', tipo: 'ok' })
      try {
        await updateDoc(doc(db, 'users', user.uid), { emailVerified: true, updatedAt: serverTimestamp() })
      } catch {
        // El dato de Authentication es el que manda; el perfil se sincroniza después.
      }
    } catch (err) {
      console.error('No se pudo comprobar la verificación:', err)
      setAviso({ texto: 'No pudimos comprobar la verificación.', tipo: 'error' })
    } finally {
      setComprobando(false)
    }
  }

  async function eliminar(contrasena: string) {
    setEliminando(true)
    try {
      await eliminarCuenta(contrasena)
    } catch (err) {
      setEliminando(false)
      throw err
    }
  }

  async function cerrarSesion() {
    // Primero se sale de la pantalla: si no, una página que exige sesión
    // (el mapa) redirige al registro en cuanto la sesión se cierra.
    navigate('/', { replace: true })
    await logout()
  }

  const rol = ETIQUETA_ROL[perfil?.role ?? 'ciudadano'] ?? 'Ciudadano'
  const nombre = perfil?.displayName ?? user?.displayName ?? 'Tu cuenta'
  const nivel = nivelDePuntos(confianza.puntosConfianza)
  const miembroDesde = perfil?.createdAt
    ? perfil.createdAt.toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' })
    : null

  return (
    <div className={styles.page}>
      <Navbar />
      <main className={styles.main}>
        <h1 className={styles.title}>Mi perfil</h1>

        {(loading || perfilCargando) && <p className={styles.nota}>Cargando tu perfil…</p>}

        {user && (
          <>
            <section className={styles.identidad}>
              <span className={styles.avatar} aria-hidden="true">
                {nombre.slice(0, 1).toUpperCase()}
              </span>
              <div>
                <p className={styles.nombre}>{nombre}</p>
                <p className={styles.correo}>{user.email}</p>
                <span className={styles.rol}>{rol}</span>
              </div>
            </section>

            {!correoVerificado && (
              <section className={styles.verificar} aria-label="Verificar correo">
                <h2 className={styles.subtitulo}>Verifica tu correo</h2>
                <p className={styles.nota}>
                  {perfil?.role === 'ciudadano'
                    ? 'Mientras tu correo no esté verificado, tus confirmaciones se registran pero pesan 0 en la verificación de la comunidad.'
                    : 'Verificar tu correo ayuda a mantener segura tu cuenta.'}
                </p>
                <div className={styles.acciones}>
                  <button type="button" className={styles.boton} onClick={enviar} disabled={enviando}>
                    {enviando ? 'Enviando…' : enviado ? 'Enviar de nuevo' : 'Enviar enlace de verificación'}
                  </button>
                  <button type="button" className={styles.botonSecundario} onClick={comprobar} disabled={comprobando}>
                    {comprobando ? 'Comprobando…' : 'Ya verifiqué mi correo'}
                  </button>
                </div>
                {aviso && (
                  <p className={aviso.tipo === 'ok' ? styles.ok : styles.error} role={aviso.tipo === 'ok' ? 'status' : 'alert'}>
                    {aviso.texto}
                  </p>
                )}
              </section>
            )}
            {correoVerificado && aviso?.tipo === 'ok' && <p className={styles.ok}>{aviso.texto}</p>}

            {perfil?.role === 'ciudadano' && (
              <Link to="/mi-nivel" className={styles.nivel}>
                <span className={styles.nivelNumero}>{nivel}</span>
                <span>
                  <strong>
                    Nivel {nivel} · {NOMBRE_NIVEL[nivel]}
                  </strong>
                  <br />
                  <span className={styles.nota}>{confianza.puntosConfianza} puntos de confianza · ver cómo subir de nivel</span>
                </span>
              </Link>
            )}

            <section className={styles.tarjeta} aria-label="Datos de la cuenta">
              <h2 className={styles.subtitulo}>Datos de la cuenta</h2>
              <dl className={styles.datos}>
                <dt>Correo</dt>
                <dd>{user.email}</dd>
                <dt>Correo verificado</dt>
                <dd>{correoVerificado ? 'Sí' : 'Pendiente'}</dd>
                {perfil && (
                  <>
                    <dt>Nombre</dt>
                    <dd>{perfil.displayName ?? '—'}</dd>
                    <dt>Tipo de cuenta</dt>
                    <dd>{rol}</dd>
                  </>
                )}
                {operadorNombre && (
                  <>
                    <dt>Operador</dt>
                    <dd>{operadorNombre}</dd>
                  </>
                )}
                {miembroDesde && (
                  <>
                    <dt>Miembro desde</dt>
                    <dd>{miembroDesde}</dd>
                  </>
                )}
                <dt>Identificador</dt>
                <dd className={styles.tecnico}>{user.uid}</dd>
              </dl>
              <p className={styles.nota}>Si escribes a soporte, el identificador nos ayuda a encontrar tu cuenta.</p>
            </section>

            <p className={styles.nota}>
              <Link to="/terminos">Términos de uso</Link> · <Link to="/privacidad">Política de privacidad</Link>
            </p>

            <button type="button" className={styles.salir} onClick={cerrarSesion}>
              Cerrar sesión
            </button>

            {perfil?.role === 'ciudadano' && (
              <section className={styles.eliminar} aria-labelledby="titulo-eliminar">
                <h2 id="titulo-eliminar" className={styles.eliminarTitulo}>
                  Eliminar mi cuenta
                </h2>
                <p className={styles.nota}>
                  Se borran tu correo, tu nombre y tu acceso. Tus reportes se conservan como «Cuenta eliminada», porque
                  son parte del historial del barrio. No se puede deshacer.
                </p>
                <button type="button" className={styles.salir} onClick={() => setDialogoEliminar(true)}>
                  Eliminar mi cuenta
                </button>
              </section>
            )}
            {dialogoEliminar && (
              <DialogoEliminarCuenta onConfirmar={eliminar} onCerrar={() => setDialogoEliminar(false)} />
            )}
          </>
        )}
      </main>
    </div>
  )
}
