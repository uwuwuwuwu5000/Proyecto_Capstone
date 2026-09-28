import { Fragment, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { collection, doc, onSnapshot, setDoc } from 'firebase/firestore'
import { db } from '../../firebase/config'
import { useRequiereAdmin } from '../../hooks/useRequiereAdmin'
import Navbar from '../../components/Navbar/Navbar'
import styles from './Admin.module.css'

interface ZonaCobertura {
  type: string
  coordinates: unknown
}

interface OrganismoFila {
  id: string
  nombre: string
  comuna: string
  activo: boolean
  zonaCobertura: ZonaCobertura | null
}

function zonaComoTexto(zona: ZonaCobertura | null): string {
  if (!zona) {
    return ''
  }
  return JSON.stringify(zona, null, 2)
}

export default function AdminOrganismos() {
  const { cargando, autorizado } = useRequiereAdmin()

  const [organismos, setOrganismos] = useState<OrganismoFila[]>([])
  const [cargandoLista, setCargandoLista] = useState(true)
  const [error, setError] = useState('')
  const [filtro, setFiltro] = useState('')
  const [actualizandoId, setActualizandoId] = useState<string | null>(null)

  const [editandoZonaId, setEditandoZonaId] = useState<string | null>(null)
  const [zonaTexto, setZonaTexto] = useState('')
  const [zonaError, setZonaError] = useState('')
  const [guardandoZona, setGuardandoZona] = useState(false)

  useEffect(() => {
    if (!autorizado) {
      return
    }
    const unsubscribe = onSnapshot(
      collection(db, 'organismos'),
      (snapshot) => {
        const lista = snapshot.docs.map((docSnap) => {
          const data = docSnap.data()
          const zona =
            data.zonaCobertura && typeof data.zonaCobertura === 'object'
              ? (data.zonaCobertura as ZonaCobertura)
              : null
          return {
            id: docSnap.id,
            nombre: typeof data.nombre === 'string' ? data.nombre : docSnap.id,
            comuna: typeof data.comuna === 'string' ? data.comuna : '—',
            activo: data.activo !== false,
            zonaCobertura: zona,
          }
        })
        lista.sort((a, b) => a.comuna.localeCompare(b.comuna, 'es'))
        setOrganismos(lista)
        setCargandoLista(false)
        setError('')
      },
      (err) => {
        console.error('Error al leer organismos:', err)
        setError('No pudimos cargar la lista. Inténtalo nuevamente.')
        setCargandoLista(false)
      },
    )
    return unsubscribe
  }, [autorizado])

  if (!cargando && !autorizado) {
    return <Navigate to="/" replace />
  }

  const filtroNormalizado = filtro.trim().toLowerCase()
  const organismosFiltrados = filtroNormalizado
    ? organismos.filter((o) =>
        `${o.nombre} ${o.comuna} ${o.id}`.toLowerCase().includes(filtroNormalizado),
      )
    : organismos

  async function alternarActivo(organismo: OrganismoFila) {
    setActualizandoId(organismo.id)
    setError('')
    try {
      await setDoc(doc(db, 'organismos', organismo.id), { activo: !organismo.activo }, { merge: true })
    } catch (err) {
      console.error('Error al actualizar el organismo:', err)
      setError('No pudimos actualizar el estado. Inténtalo nuevamente.')
    } finally {
      setActualizandoId(null)
    }
  }

  function iniciarEdicionZona(organismo: OrganismoFila) {
    setEditandoZonaId(organismo.id)
    setZonaTexto(zonaComoTexto(organismo.zonaCobertura))
    setZonaError('')
  }

  function cancelarEdicionZona() {
    setEditandoZonaId(null)
    setZonaTexto('')
    setZonaError('')
  }

  async function guardarZona(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!editandoZonaId) {
      return
    }
    setZonaError('')

    let zonaParseada: ZonaCobertura | null = null
    if (zonaTexto.trim()) {
      let parsed: unknown
      try {
        parsed = JSON.parse(zonaTexto)
      } catch {
        setZonaError('Eso no es un JSON válido. Copia el GeoJSON tal cual.')
        return
      }
      const candidato = parsed as { type?: unknown; coordinates?: unknown }
      if (
        !candidato ||
        typeof candidato.type !== 'string' ||
        !['Polygon', 'MultiPolygon'].includes(candidato.type) ||
        !Array.isArray(candidato.coordinates)
      ) {
        setZonaError('El GeoJSON debe ser un Polygon o MultiPolygon con coordinates.')
        return
      }
      zonaParseada = { type: candidato.type, coordinates: candidato.coordinates }
    }

    setGuardandoZona(true)
    try {
      await setDoc(doc(db, 'organismos', editandoZonaId), { zonaCobertura: zonaParseada }, { merge: true })
      cancelarEdicionZona()
    } catch (err) {
      console.error('Error al guardar la zona de cobertura:', err)
      setZonaError('No pudimos guardar la zona. Inténtalo nuevamente.')
    } finally {
      setGuardandoZona(false)
    }
  }

  return (
    <div className={styles.page}>
      <Navbar />

      <main className={styles.main}>
        <div>
          <Link to="/admin" className={styles.volver}>
            ← Panel de administración
          </Link>
          <h1 className={styles.title}>Organismos activos</h1>
          <p className={styles.subtitle}>
            Activa o desactiva municipalidades del catálogo y edita su zona de
            cobertura. Para dar de alta operadores, usa{' '}
            <Link to="/admin/operadores" className={styles.footerLink}>
              Crear operador
            </Link>
            .
          </p>
        </div>

        <section className={styles.card}>
          <label className={styles.field}>
            <span className={styles.label}>Buscar</span>
            <input
              type="text"
              className={styles.input}
              value={filtro}
              onChange={(e) => setFiltro(e.target.value)}
              placeholder="Comuna, nombre o id…"
            />
          </label>

          {error && <p className={styles.error}>{error}</p>}
          {cargandoLista && <p className={styles.hint}>Cargando…</p>}
          {!cargandoLista && organismosFiltrados.length === 0 && !error && (
            <p className={styles.hint}>No hay organismos que coincidan con la búsqueda.</p>
          )}

          {organismosFiltrados.length > 0 && (
            <div className={styles.tableWrapper}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Comuna</th>
                    <th>Organismo</th>
                    <th>Id</th>
                    <th>Estado</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {organismosFiltrados.map((organismo) => (
                    <Fragment key={organismo.id}>
                      <tr>
                        <td>{organismo.comuna}</td>
                        <td>{organismo.nombre}</td>
                        <td>{organismo.id}</td>
                        <td>{organismo.activo ? 'Activo' : 'Inactivo'}</td>
                        <td className={styles.accionesForm}>
                          <button
                            type="button"
                            className={styles.editarBoton}
                            onClick={() => alternarActivo(organismo)}
                            disabled={actualizandoId === organismo.id}
                          >
                            {actualizandoId === organismo.id
                              ? 'Guardando…'
                              : organismo.activo
                                ? 'Desactivar'
                                : 'Activar'}
                          </button>
                          <button
                            type="button"
                            className={styles.editarBoton}
                            onClick={() =>
                              editandoZonaId === organismo.id
                                ? cancelarEdicionZona()
                                : iniciarEdicionZona(organismo)
                            }
                          >
                            {editandoZonaId === organismo.id ? 'Cerrar' : 'Zona de cobertura'}
                          </button>
                        </td>
                      </tr>
                      {editandoZonaId === organismo.id && (
                        <tr>
                          <td colSpan={5}>
                            <form className={styles.form} onSubmit={guardarZona} noValidate>
                              <label className={styles.field}>
                                <span className={styles.label}>
                                  GeoJSON de la zona (Polygon o MultiPolygon) — déjalo vacío para
                                  quitarla
                                </span>
                                <textarea
                                  className={styles.textarea}
                                  rows={8}
                                  value={zonaTexto}
                                  onChange={(e) => setZonaTexto(e.target.value)}
                                  placeholder='{"type": "Polygon", "coordinates": [...]}'
                                />
                              </label>
                              {zonaError && <p className={styles.error}>{zonaError}</p>}
                              <div className={styles.accionesForm}>
                                <button
                                  type="submit"
                                  className={styles.submit}
                                  disabled={guardandoZona}
                                >
                                  {guardandoZona ? 'Guardando…' : 'Guardar zona'}
                                </button>
                                <button
                                  type="button"
                                  className={styles.cancelar}
                                  onClick={cancelarEdicionZona}
                                  disabled={guardandoZona}
                                >
                                  Cancelar
                                </button>
                              </div>
                            </form>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  )
}
