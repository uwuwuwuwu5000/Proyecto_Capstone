import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { collection, doc, getDoc, getDocs, onSnapshot, query, setDoc, where } from 'firebase/firestore'
import { db } from '../../firebase/config'
import { useRequiereAdmin } from '../../hooks/useRequiereAdmin'
import Navbar from '../../components/Navbar/Navbar'
import { COMUNAS_CHILE } from '../../constants/comunas'
import styles from './Admin.module.css'

interface OrganismoEncontrado {
  id: string
  nombre: string
  comuna: string
  region: string
}

interface OperadorFila {
  id: string
  nombre: string
  organismoId: string
  organismoNombre: string
  telefonoContacto: string
  correoContacto: string
  direccionContacto: string
  activo: boolean
}

// Minúsculas, números o "_", empezando por letra — 3 a 40 caracteres en total.
const ID_OPERADOR_REGEX = /^[a-z][a-z0-9_]{2,39}$/

export default function AdminOperadores() {
  const { cargando, autorizado } = useRequiereAdmin()

  const [operadores, setOperadores] = useState<OperadorFila[]>([])

  const [comunaSeleccionada, setComunaSeleccionada] = useState('')
  const [buscando, setBuscando] = useState(false)
  const [organismoEncontrado, setOrganismoEncontrado] = useState<OrganismoEncontrado | null>(null)

  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [idOperador, setIdOperador] = useState('')
  const [nombreOperador, setNombreOperador] = useState('')
  const [telefonoContacto, setTelefonoContacto] = useState('')
  const [correoContacto, setCorreoContacto] = useState('')
  const [direccionContacto, setDireccionContacto] = useState('')
  const [activoOperador, setActivoOperador] = useState(true)

  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [actualizandoId, setActualizandoId] = useState<string | null>(null)

  useEffect(() => {
    if (!autorizado) {
      return
    }
    const unsubscribe = onSnapshot(collection(db, 'operadores'), async (snapshot) => {
      const lista = await Promise.all(
        snapshot.docs.map(async (operadorSnap) => {
          const data = operadorSnap.data()
          const organismoId = typeof data.organismoId === 'string' ? data.organismoId : ''
          let organismoNombre = organismoId
          if (organismoId) {
            const organismoSnap = await getDoc(doc(db, 'organismos', organismoId))
            const organismoData = organismoSnap.data()
            if (typeof organismoData?.nombre === 'string') {
              organismoNombre = organismoData.nombre
            }
          }
          return {
            id: operadorSnap.id,
            nombre: typeof data.nombre === 'string' ? data.nombre : operadorSnap.id,
            organismoId,
            organismoNombre,
            telefonoContacto: typeof data.telefonoContacto === 'string' ? data.telefonoContacto : '',
            correoContacto: typeof data.correoContacto === 'string' ? data.correoContacto : '',
            direccionContacto:
              typeof data.direccionContacto === 'string' ? data.direccionContacto : '',
            activo: data.activo !== false,
          }
        }),
      )
      lista.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
      setOperadores(lista)
    })
    return unsubscribe
  }, [autorizado])

  if (!cargando && !autorizado) {
    return <Navigate to="/" replace />
  }

  function limpiarFormulario() {
    setEditandoId(null)
    setIdOperador('')
    setNombreOperador('')
    setTelefonoContacto('')
    setCorreoContacto('')
    setDireccionContacto('')
    setActivoOperador(true)
    setOrganismoEncontrado(null)
    setComunaSeleccionada('')
    setError('')
    setAviso('')
  }

  async function buscarOrganismo(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')
    setAviso('')
    setOrganismoEncontrado(null)

    if (!comunaSeleccionada) {
      setError('Selecciona una comuna para buscar el organismo responsable.')
      return
    }

    setBuscando(true)
    try {
      const resultado = await getDocs(
        query(collection(db, 'organismos'), where('comuna', '==', comunaSeleccionada)),
      )
      if (resultado.empty) {
        setError(`No se encontró ningún organismo para "${comunaSeleccionada}" en el catálogo.`)
        return
      }
      const organismoDoc = resultado.docs[0]
      const data = organismoDoc.data()
      setOrganismoEncontrado({
        id: organismoDoc.id,
        nombre: typeof data.nombre === 'string' ? data.nombre : organismoDoc.id,
        comuna: typeof data.comuna === 'string' ? data.comuna : comunaSeleccionada,
        region: typeof data.region === 'string' ? data.region : '—',
      })
      setEditandoId(null)
      setIdOperador('')
      setNombreOperador('')
      setTelefonoContacto('')
      setCorreoContacto('')
      setDireccionContacto('')
      setActivoOperador(true)
    } catch (err) {
      console.error('Error al buscar el organismo:', err)
      setError('No pudimos buscar en el catálogo. Inténtalo nuevamente.')
    } finally {
      setBuscando(false)
    }
  }

  function iniciarEdicion(operador: OperadorFila) {
    setError('')
    setAviso('')
    setEditandoId(operador.id)
    setIdOperador(operador.id)
    setNombreOperador(operador.nombre)
    setTelefonoContacto(operador.telefonoContacto)
    setCorreoContacto(operador.correoContacto)
    setDireccionContacto(operador.direccionContacto)
    setActivoOperador(operador.activo)
    setOrganismoEncontrado({
      id: operador.organismoId,
      nombre: operador.organismoNombre,
      comuna: '—',
      region: '—',
    })
  }

  async function guardarOperador(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')
    setAviso('')

    if (!organismoEncontrado) {
      setError('Primero busca el organismo responsable por comuna.')
      return
    }
    const id = idOperador.trim()
    if (!ID_OPERADOR_REGEX.test(id)) {
      setError('El id debe usar solo minúsculas, números o "_", entre 3 y 40 caracteres.')
      return
    }
    if (!nombreOperador.trim()) {
      setError('Ingresa un nombre para el operador.')
      return
    }

    setGuardando(true)
    try {
      await setDoc(doc(db, 'operadores', id), {
        id,
        nombre: nombreOperador.trim(),
        organismoId: organismoEncontrado.id,
        telefonoContacto: telefonoContacto.trim() || null,
        correoContacto: correoContacto.trim() || null,
        direccionContacto: direccionContacto.trim() || null,
        activo: activoOperador,
      })
      setAviso(`Operador "${nombreOperador.trim()}" guardado correctamente.`)
      if (!editandoId) {
        limpiarFormulario()
      }
    } catch (err) {
      console.error('Error al guardar el operador:', err)
      setError('No pudimos guardar el operador. Inténtalo nuevamente.')
    } finally {
      setGuardando(false)
    }
  }

  async function alternarActivo(operador: OperadorFila) {
    setActualizandoId(operador.id)
    setError('')
    try {
      await setDoc(doc(db, 'operadores', operador.id), { activo: !operador.activo }, { merge: true })
    } catch (err) {
      console.error('Error al actualizar el operador:', err)
      setError('No pudimos actualizar el estado. Inténtalo nuevamente.')
    } finally {
      setActualizandoId(null)
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
          <h1 className={styles.title}>Crear operador</h1>
          <p className={styles.subtitle}>
            Busca el organismo responsable por comuna y da de alta al operador
            que va a gestionar sus reportes.
          </p>
        </div>

        <section className={styles.card}>
          {!organismoEncontrado && (
            <form className={styles.form} onSubmit={buscarOrganismo} noValidate>
              <label className={styles.field}>
                <span className={styles.label}>Comuna</span>
                <select
                  className={styles.input}
                  value={comunaSeleccionada}
                  onChange={(e) => setComunaSeleccionada(e.target.value)}
                >
                  <option value="">Selecciona una comuna…</option>
                  {COMUNAS_CHILE.map((comuna) => (
                    <option key={comuna} value={comuna}>
                      {comuna}
                    </option>
                  ))}
                </select>
              </label>
              {error && <p className={styles.error}>{error}</p>}
              <button type="submit" className={styles.submit} disabled={buscando}>
                {buscando ? 'Buscando…' : 'Buscar organismo responsable'}
              </button>
            </form>
          )}

          {organismoEncontrado && (
            <form className={styles.form} onSubmit={guardarOperador} noValidate>
              <div className={styles.tableWrapper}>
                <table className={styles.table}>
                  <tbody>
                    <tr>
                      <th>Organismo responsable</th>
                      <td>
                        {organismoEncontrado.nombre} ({organismoEncontrado.id})
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <label className={styles.field}>
                <span className={styles.label}>Id del operador</span>
                <input
                  type="text"
                  className={styles.input}
                  value={idOperador}
                  onChange={(e) => setIdOperador(e.target.value.trim().toLowerCase())}
                  placeholder="op_maipu"
                  disabled={!!editandoId}
                />
              </label>

              <label className={styles.field}>
                <span className={styles.label}>Nombre del operador</span>
                <input
                  type="text"
                  className={styles.input}
                  value={nombreOperador}
                  onChange={(e) => setNombreOperador(e.target.value)}
                  placeholder="Municipalidad de Maipú — Aseo y Ornato"
                />
              </label>

              <div className={styles.grid2}>
                <label className={styles.field}>
                  <span className={styles.label}>Teléfono de contacto (opcional)</span>
                  <input
                    type="text"
                    className={styles.input}
                    value={telefonoContacto}
                    onChange={(e) => setTelefonoContacto(e.target.value)}
                  />
                </label>
                <label className={styles.field}>
                  <span className={styles.label}>Correo de contacto (opcional)</span>
                  <input
                    type="email"
                    className={styles.input}
                    value={correoContacto}
                    onChange={(e) => setCorreoContacto(e.target.value)}
                  />
                </label>
              </div>

              <label className={styles.field}>
                <span className={styles.label}>Dirección de contacto (opcional)</span>
                <input
                  type="text"
                  className={styles.input}
                  value={direccionContacto}
                  onChange={(e) => setDireccionContacto(e.target.value)}
                />
              </label>

              <label className={styles.checkboxRow}>
                <input
                  type="checkbox"
                  checked={activoOperador}
                  onChange={(e) => setActivoOperador(e.target.checked)}
                />
                Operador activo
              </label>

              {error && <p className={styles.error}>{error}</p>}
              {aviso && <p className={styles.aviso}>{aviso}</p>}

              <div className={styles.accionesForm}>
                <button type="submit" className={styles.submit} disabled={guardando}>
                  {guardando ? 'Guardando…' : editandoId ? 'Guardar cambios' : 'Crear operador'}
                </button>
                <button
                  type="button"
                  className={styles.cancelar}
                  onClick={limpiarFormulario}
                  disabled={guardando}
                >
                  Cancelar
                </button>
              </div>
            </form>
          )}
        </section>

        <section className={styles.card}>
          <h2 className={styles.cardTitle}>Operadores existentes</h2>
          {operadores.length === 0 && (
            <p className={styles.hint}>Todavía no hay operadores creados.</p>
          )}
          {operadores.length > 0 && (
            <div className={styles.tableWrapper}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Operador</th>
                    <th>Organismo responsable</th>
                    <th>Estado</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {operadores.map((operador) => (
                    <tr key={operador.id}>
                      <td>
                        {operador.nombre} ({operador.id})
                      </td>
                      <td>{operador.organismoNombre}</td>
                      <td>{operador.activo ? 'Activo' : 'Inactivo'}</td>
                      <td className={styles.accionesForm}>
                        <button
                          type="button"
                          className={styles.editarBoton}
                          onClick={() => iniciarEdicion(operador)}
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          className={styles.editarBoton}
                          onClick={() => alternarActivo(operador)}
                          disabled={actualizandoId === operador.id}
                        >
                          {actualizandoId === operador.id
                            ? 'Guardando…'
                            : operador.activo
                              ? 'Desactivar'
                              : 'Activar'}
                        </button>
                      </td>
                    </tr>
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
