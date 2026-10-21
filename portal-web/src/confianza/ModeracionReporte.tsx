import { useState } from 'react'
import { db } from '../firebase/config'
import { useAuth } from '../context/AuthContext'
import type { Reporte } from '../components/Reportes/reporte'
import { formatearFecha } from '../components/Reportes/reporte'
import { cambiarSuspension, cargarConfirmantes, leerSuspension, MAXIMO_CONFIRMACIONES } from './moderacion'
import type { ConfirmacionDeUsuario } from './moderacion'
import styles from './ModeracionReporte.module.css'

interface Fila {
  uid: string
  etiqueta: string
  nivel: number | null
  peso: number | null
  fecha: Date | null
  suspendido: boolean
}

const corto = (uid: string) => `…${uid.slice(-6)}`
const formatoPeso = (p: number) => String(p).replace('.', ',')

/**
 * Moderación de confirmaciones (solo administrador): suspender o rehabilitar a
 * quien reportó o a quienes confirmaron este reporte. El administrador no puede
 * listar usuarios, así que se llega a ellos desde un reporte; de los
 * confirmantes solo se conoce su identificador, su nivel y su peso.
 */
export default function ModeracionReporte({ reporte }: { reporte: Reporte }) {
  const { perfil } = useAuth()
  const [abierto, setAbierto] = useState(false)
  const [cargando, setCargando] = useState(false)
  const [filas, setFilas] = useState<Fila[] | null>(null)
  const [error, setError] = useState('')
  // uid de la fila que espera confirmación, y el de la que se está guardando.
  const [pendiente, setPendiente] = useState<string | null>(null)
  const [guardando, setGuardando] = useState<string | null>(null)

  if (perfil?.role !== 'admin') return null

  async function abrir() {
    setAbierto(true)
    setCargando(true)
    setError('')
    try {
      const [confirmantes, autorSuspendido] = await Promise.all([
        cargarConfirmantes(db, reporte.id),
        leerSuspension(db, reporte.uid).catch(() => false),
      ])
      const deLaLista = (c: ConfirmacionDeUsuario): Fila => ({ ...c, etiqueta: `Confirmó ${corto(c.uid)}` })
      setFilas([
        {
          uid: reporte.uid,
          etiqueta: `Autor${reporte.autorNombre ? `: ${reporte.autorNombre}` : ''} ${corto(reporte.uid)}`,
          nivel: null,
          peso: null,
          fecha: reporte.fecha,
          suspendido: autorSuspendido,
        },
        ...confirmantes.map(deLaLista),
      ])
    } catch (err) {
      console.error('Moderación: no se pudo cargar a los confirmantes.', err)
      setError('No pudimos cargar a quienes confirmaron este reporte.')
    } finally {
      setCargando(false)
    }
  }

  async function aplicar(fila: Fila) {
    setGuardando(fila.uid)
    setError('')
    try {
      await cambiarSuspension(db, fila.uid, !fila.suspendido)
      setFilas((actuales) => actuales?.map((f) => (f.uid === fila.uid ? { ...f, suspendido: !fila.suspendido } : f)) ?? null)
      setPendiente(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No pudimos guardar el cambio.')
    } finally {
      setGuardando(null)
    }
  }

  return (
    <div className={styles.raiz}>
      <span className={styles.titulo}>Moderación de confirmaciones</span>
      {!abierto ? (
        <>
          <p className={styles.nota}>
            Suspende las confirmaciones de quien reportó o de quienes confirmaron este reporte si sospechas de abuso.
          </p>
          <button type="button" className={styles.boton} onClick={abrir}>
            Ver quién reportó y quién confirmó
          </button>
        </>
      ) : (
        <>
          {cargando && <p className={styles.nota}>Cargando…</p>}
          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}
          {filas && (
            <ul className={styles.lista}>
              {filas.map((f) => (
                <li key={f.uid} className={styles.fila}>
                  <div className={styles.datos}>
                    <span className={styles.nombre} title={f.uid}>
                      {f.etiqueta}
                    </span>
                    <span className={styles.detalle}>
                      {f.nivel !== null && `Nivel ${f.nivel} · peso ${formatoPeso(f.peso ?? 0)} · `}
                      {f.fecha ? formatearFecha(f.fecha, true) : ''}
                    </span>
                  </div>
                  <span className={f.suspendido ? styles.suspendido : styles.activo}>
                    {f.suspendido ? 'Suspendido' : 'Activo'}
                  </span>
                  {pendiente === f.uid ? (
                    <span className={styles.acciones}>
                      <button
                        type="button"
                        className={f.suspendido ? styles.boton : styles.botonPeligro}
                        disabled={guardando === f.uid}
                        onClick={() => aplicar(f)}
                      >
                        {guardando === f.uid ? 'Guardando…' : f.suspendido ? 'Sí, rehabilitar' : 'Sí, suspender'}
                      </button>
                      <button type="button" className={styles.botonCancelar} onClick={() => setPendiente(null)}>
                        Cancelar
                      </button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      className={f.suspendido ? styles.boton : styles.botonPeligro}
                      onClick={() => setPendiente(f.uid)}
                    >
                      {f.suspendido ? 'Rehabilitar' : 'Suspender'}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {filas && filas.length === 1 && <p className={styles.nota}>Este reporte aún no tiene confirmaciones.</p>}
          {filas && filas.length > MAXIMO_CONFIRMACIONES && (
            <p className={styles.nota}>Se muestran las {MAXIMO_CONFIRMACIONES} confirmaciones más recientes.</p>
          )}
          <p className={styles.nota}>
            Una cuenta suspendida no puede confirmar reportes, pero sigue pudiendo reportar. No cambia sus puntos.
          </p>
        </>
      )}
    </div>
  )
}
