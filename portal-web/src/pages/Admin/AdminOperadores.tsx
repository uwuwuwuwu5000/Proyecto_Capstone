import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router-dom'
import { collection, doc, getDoc, getDocs, query, setDoc, where } from 'firebase/firestore'
import { db } from '../../firebase/config'
import { useRequiereAdmin } from '../../hooks/useRequiereAdmin'
import Navbar from '../../components/Navbar/Navbar'
import { useConfirmacion } from '../../components/Dialogo/useConfirmacion'
import { COMUNAS_CHILE } from '../../constants/comunas'
import { useOperadores } from './operadores'
import type { Operador } from './operadores'
import styles from './Admin.module.css'

interface OrganismoEncontrado {
  id: string
  nombre: string
  comuna: string
  region: string
}

// Minúsculas, números o "_", empezando por letra — 3 a 40 caracteres en total.
const ID_OPERADOR_REGEX = /^[a-z][a-z0-9_]{2,39}$/

export default function AdminOperadores() {
  const { cargando, autorizado } = useRequiereAdmin()
  const { confirmar, dialogo } = useConfirmacion()
  const [params] = useSearchParams()
  const { operadores, cargando: cargandoOperadores } = useOperadores(autorizado)
  // Nombre de cada organismo, para la tabla (se leen una vez cada uno).
  const [nombresOrganismo, setNombresOrganismo] = useState<Map<string, string>>(() => new Map())

  // El formulario se abre con "+ Nuevo operador" o al editar.
  const [formularioAbierto, setFormularioAbierto] = useState(false)
  // ?sinCuenta=1 (acceso del inicio del panel): solo los que no tienen cuenta.
  const [soloSinCuenta, setSoloSinCuenta] = useState(() => params.get('sinCuenta') === '1')

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
    const faltantes = Array.from(
      new Set(operadores.map((o) => o.organismoId).filter((id) => id && !nombresOrganismo.has(id))),
    )
    if (faltantes.length === 0) {
      return
    }
    Promise.all(
      faltantes.map(async (id) => {
        const snap = await getDoc(doc(db, 'organismos', id)).catch(() => null)
        const nombre = snap?.data()?.nombre
        return [id, typeof nombre === 'string' ? nombre : id] as const
      }),
    ).then((pares) => {
      setNombresOrganismo((previos) => new Map([...previos, ...pares]))
    })
  }, [operadores, nombresOrganismo])

  if (!cargando && !autorizado) {
    return <Navigate to="/" replace />
  }

  const operadoresVisibles = soloSinCuenta
    ? operadores.filter((o) => o.activo && o.cuentas.length === 0)
    : operadores

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
  }

  function cerrarFormulario() {
    limpiarFormulario()
    setAviso('')
    setFormularioAbierto(false)
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

  function iniciarEdicion(operador: Operador) {
    setFormularioAbierto(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
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
      nombre: nombresOrganismo.get(operador.organismoId) ?? operador.organismoId,
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
      // merge: al editar no se pierden las cuentas registradas en el operador.
      await setDoc(
        doc(db, 'operadores', id),
        {
          id,
          nombre: nombreOperador.trim(),
          organismoId: organismoEncontrado.id,
          telefonoContacto: telefonoContacto.trim() || null,
          correoContacto: correoContacto.trim() || null,
          direccionContacto: direccionContacto.trim() || null,
          activo: activoOperador,
        },
        { merge: true },
      )
      setAviso(`Operador "${nombreOperador.trim()}" guardado correctamente.`)
      limpiarFormulario()
      setFormularioAbierto(false)
    } catch (err) {
      console.error('Error al guardar el operador:', err)
      setError('No pudimos guardar el operador. Inténtalo nuevamente.')
    } finally {
      setGuardando(false)
    }
  }

  async function alternarActivo(operador: Operador) {
    if (operador.activo) {
      const aceptado = await confirmar({
        titulo: `Desactivar ${operador.nombre}`,
        mensaje: (
          <>
            <p>
              Sus cuentas dejarán de poder gestionar reportes, y los reportes nuevos de su organismo
              quedarán sin operador asignado.
            </p>
            <p>Los reportes que ya tiene asignados no cambian de operador.</p>
          </>
        ),
        confirmar: 'Desactivar',
        peligroso: true,
      })
      if (!aceptado) return
    }
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
          <div className={styles.encabezadoAcciones}>
            <h1 className={styles.title}>Operadores</h1>
            {!formularioAbierto && (
              <button
                type="button"
                className={styles.botonCrear}
                onClick={() => {
                  limpiarFormulario()
                  setAviso('')
                  setFormularioAbierto(true)
                }}
              >
                + Nuevo operador
              </button>
            )}
          </div>
          <p className={styles.subtitle}>
            Quienes gestionan los reportes de cada organismo. Da de alta un operador y luego crea la
            cuenta con la que entra al portal.
          </p>
        </div>

        {aviso && !formularioAbierto && <p className={styles.aviso}>{aviso}</p>}

        {(formularioAbierto || (!cargandoOperadores && operadores.length === 0)) && (
          <section className={styles.card}>
            <h2 className={styles.cardTitle}>{editandoId ? `Editar "${editandoId}"` : 'Nuevo operador'}</h2>
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
                <div className={styles.accionesForm}>
                  <button type="submit" className={styles.submit} disabled={buscando}>
                    {buscando ? 'Buscando…' : 'Buscar organismo responsable'}
                  </button>
                  {operadores.length > 0 && (
                    <button type="button" className={styles.cancelar} onClick={cerrarFormulario}>
                      Cancelar
                    </button>
                  )}
                </div>
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
                    onClick={cerrarFormulario}
                    disabled={guardando}
                  >
                    Cancelar
                  </button>
                </div>
              </form>
            )}
          </section>
        )}

        <section className={styles.card}>
          <div className={styles.encabezadoAcciones}>
            <h2 className={`${styles.cardTitle} ${styles.sinMargen}`}>Operadores existentes</h2>
            <label className={styles.checkboxRow}>
              <input
                type="checkbox"
                checked={soloSinCuenta}
                onChange={(e) => setSoloSinCuenta(e.target.checked)}
              />
              Solo activos sin cuenta
            </label>
          </div>
          {cargandoOperadores && <p className={styles.hint}>Cargando…</p>}
          {!cargandoOperadores && operadoresVisibles.length === 0 && (
            <p className={styles.hint}>
              {soloSinCuenta
                ? 'Todos los operadores activos tienen al menos una cuenta.'
                : 'Todavía no hay operadores creados.'}
            </p>
          )}
          {operadoresVisibles.length > 0 && (
            <div className={styles.tableWrapper}>
              <table className={`${styles.table} ${styles.tablaOperadores}`}>
                <thead>
                  <tr>
                    <th>Operador</th>
                    <th className={styles.colOrganismo}>Organismo responsable</th>
                    <th>Cuentas</th>
                    <th className={styles.colEstado}>Estado</th>
                    <th>
                      <span className={styles.soloLector}>Acciones</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {operadoresVisibles.map((operador) => {
                    const organismo =
                      nombresOrganismo.get(operador.organismoId) ?? operador.organismoId
                    return (
                      <tr key={operador.id}>
                        <td>
                          {operador.nombre}
                          <span className={styles.subtextoCelda}>{operador.id}</span>
                          <span
                            className={`${styles.subtextoCelda} ${styles.subtextoNormal} ${styles.soloAngosto}`}
                          >
                            {organismo}
                          </span>
                          {/* Teléfono: el estado va bajo el nombre (su columna se oculta). */}
                          <span className={`${styles.soloAngosto} ${styles.estadoBajo}`}>
                            <span
                              className={`${styles.pildora} ${operador.activo ? styles.pildoraActiva : styles.pildoraInactiva}`}
                            >
                              {operador.activo ? 'Activo' : 'Inactivo'}
                            </span>
                          </span>
                        </td>
                        <td className={styles.colOrganismo}>{organismo}</td>
                        <td>
                          {operador.cuentas.length > 0 ? (
                            <>
                              {operador.cuentas.length}{' '}
                              {operador.cuentas.length === 1 ? 'cuenta' : 'cuentas'}
                              {operador.cuentas.map((cuenta) => (
                                <span key={cuenta.uid} className={styles.subtextoCelda}>
                                  {cuenta.correo}
                                </span>
                              ))}
                            </>
                          ) : operador.activo ? (
                            <Link
                              to={`/admin/cuentas?operador=${encodeURIComponent(operador.id)}`}
                              className={styles.editarBoton}
                            >
                              Crear cuenta
                            </Link>
                          ) : (
                            <span className={styles.subtextoCelda}>Sin cuenta</span>
                          )}
                        </td>
                        <td className={styles.colEstado}>
                          <span
                            className={`${styles.pildora} ${operador.activo ? styles.pildoraActiva : styles.pildoraInactiva}`}
                          >
                            {operador.activo ? 'Activo' : 'Inactivo'}
                          </span>
                        </td>
                        <td>
                          <div className={styles.accionesFila}>
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
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
          <p className={styles.notaTabla}>
            Las cuentas se registran en el operador al crearlas desde el portal; las creadas antes
            de este cambio no aparecen.
          </p>
        </section>
      </main>
      {dialogo}
    </div>
  )
}
