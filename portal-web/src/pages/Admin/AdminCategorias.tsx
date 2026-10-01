import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore'
import { db } from '../../firebase/config'
import { useRequiereAdmin } from '../../hooks/useRequiereAdmin'
import { useCategorias } from '../../context/CategoriasContext'
import type { Categoria } from '../../context/CategoriasContext'
import Navbar from '../../components/Navbar/Navbar'
import styles from './Admin.module.css'

// Igual que la regla categoriaCatalogoValida() en firestore.rules.
const ID_CATEGORIA_REGEX = /^[a-z][a-z0-9_]{2,39}$/
const NOMBRE_MAX = 60
const DESCRIPCION_MAX = 200

export default function AdminCategorias() {
  const { cargando, autorizado } = useRequiereAdmin()
  const { categorias, cargando: cargandoCategorias } = useCategorias()

  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [id, setId] = useState('')
  const [nombre, setNombre] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [orden, setOrden] = useState('')
  const [activa, setActiva] = useState(true)

  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')

  const [actualizandoId, setActualizandoId] = useState<string | null>(null)
  const [errorLista, setErrorLista] = useState('')

  if (!cargando && !autorizado) {
    return <Navigate to="/" replace />
  }

  // Sugiere el siguiente múltiplo de 10 después de la última categoría,
  // sin contar "Otro" (u otras que se hayan dejado al final a propósito).
  const ordenSugerido = Math.min(
    980,
    Math.max(0, ...categorias.map((c) => c.orden).filter((o) => o < 900)) + 10,
  )

  function limpiarFormulario() {
    setEditandoId(null)
    setId('')
    setNombre('')
    setDescripcion('')
    setOrden('')
    setActiva(true)
    setError('')
  }

  function iniciarEdicion(categoria: Categoria) {
    setEditandoId(categoria.id)
    setId(categoria.id)
    setNombre(categoria.nombre)
    setDescripcion(categoria.descripcion)
    setOrden(String(categoria.orden))
    setActiva(categoria.activa)
    setError('')
    setAviso('')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function guardar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')
    setAviso('')

    const idLimpio = id.trim()
    const nombreLimpio = nombre.trim()
    const descripcionLimpia = descripcion.trim()
    const ordenNumero = orden.trim() === '' ? ordenSugerido : Number(orden)

    if (!editandoId && !ID_CATEGORIA_REGEX.test(idLimpio)) {
      setError('El id debe empezar con una letra y usar solo minúsculas, números o "_" (3 a 40 caracteres).')
      return
    }
    if (!nombreLimpio || nombreLimpio.length > NOMBRE_MAX) {
      setError(`El nombre es obligatorio y puede tener hasta ${NOMBRE_MAX} caracteres.`)
      return
    }
    if (descripcionLimpia.length > DESCRIPCION_MAX) {
      setError(`La descripción puede tener hasta ${DESCRIPCION_MAX} caracteres.`)
      return
    }
    if (!Number.isInteger(ordenNumero) || ordenNumero < 0 || ordenNumero > 999) {
      setError('El orden debe ser un número entero entre 0 y 999.')
      return
    }

    setGuardando(true)
    try {
      if (editandoId) {
        await updateDoc(doc(db, 'categorias', editandoId), {
          nombre: nombreLimpio,
          descripcion: descripcionLimpia || null,
          orden: ordenNumero,
          activa,
          updatedAt: serverTimestamp(),
        })
        setAviso(`Categoría "${nombreLimpio}" actualizada.`)
        limpiarFormulario()
      } else {
        const existente = await getDoc(doc(db, 'categorias', idLimpio))
        if (existente.exists()) {
          setError(`Ya existe una categoría con el id "${idLimpio}". Edítala desde la lista.`)
          return
        }
        await setDoc(doc(db, 'categorias', idLimpio), {
          id: idLimpio,
          nombre: nombreLimpio,
          descripcion: descripcionLimpia || null,
          orden: ordenNumero,
          activa,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        })
        setAviso(`Categoría "${nombreLimpio}" creada.`)
        limpiarFormulario()
      }
    } catch (err) {
      console.error('Error al guardar la categoría:', err)
      setError('No pudimos guardar la categoría. Inténtalo nuevamente.')
    } finally {
      setGuardando(false)
    }
  }

  async function alternarActiva(categoria: Categoria) {
    if (
      categoria.activa &&
      !window.confirm(
        `"${categoria.nombre}" dejará de ofrecerse para reportes nuevos. Los reportes que ya la tienen no cambian. ¿Desactivar?`,
      )
    ) {
      return
    }
    setActualizandoId(categoria.id)
    setErrorLista('')
    try {
      await updateDoc(doc(db, 'categorias', categoria.id), {
        activa: !categoria.activa,
        updatedAt: serverTimestamp(),
      })
    } catch (err) {
      console.error('Error al cambiar el estado de la categoría:', err)
      setErrorLista('No pudimos actualizar la categoría. Inténtalo nuevamente.')
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
          <h1 className={styles.title}>Categorías</h1>
          <p className={styles.subtitle}>
            Crea y edita las categorías que se ofrecen al reportar. Las categorías no se borran: se
            desactivan, y los reportes que ya las tienen siguen mostrando su nombre.
          </p>
        </div>

        <section className={styles.card}>
          <h2 className={styles.cardTitle}>
            {editandoId ? `Editar "${editandoId}"` : 'Nueva categoría'}
          </h2>
          <form className={styles.form} onSubmit={guardar} noValidate>
            <div className={styles.grid2}>
              <label className={styles.field}>
                <span className={styles.label}>Id</span>
                <input
                  type="text"
                  className={styles.input}
                  value={id}
                  onChange={(e) => setId(e.target.value.trim().toLowerCase())}
                  placeholder="senaletica"
                  disabled={!!editandoId}
                  maxLength={40}
                />
              </label>
              <label className={styles.field}>
                <span className={styles.label}>Orden</span>
                <input
                  type="number"
                  className={styles.input}
                  value={orden}
                  onChange={(e) => setOrden(e.target.value)}
                  placeholder={String(ordenSugerido)}
                  min={0}
                  max={999}
                  step={1}
                />
              </label>
            </div>
            <p className={styles.hint}>
              {editandoId
                ? 'El id no se puede cambiar: es lo que guardan los reportes.'
                : 'El id se guarda en cada reporte y no se puede cambiar después. Solo minúsculas, números y "_".'}{' '}
              El orden define la posición en las listas (menor primero); usar saltos de 10 permite
              insertar categorías entre medio.
            </p>

            <label className={styles.field}>
              <span className={styles.label}>Nombre</span>
              <input
                type="text"
                className={styles.input}
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Señalética dañada"
                maxLength={NOMBRE_MAX}
              />
            </label>

            <label className={styles.field}>
              <span className={styles.label}>Descripción (opcional)</span>
              <textarea
                className={styles.textarea}
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
                placeholder="Ayuda al ciudadano a elegir: qué tipo de problemas entran en esta categoría."
                maxLength={DESCRIPCION_MAX}
                rows={3}
              />
            </label>

            <label className={styles.checkboxRow}>
              <input
                type="checkbox"
                checked={activa}
                onChange={(e) => setActiva(e.target.checked)}
              />
              Activa (se ofrece para reportes nuevos)
            </label>

            {error && <p className={styles.error}>{error}</p>}
            {aviso && <p className={styles.aviso}>{aviso}</p>}

            <div className={styles.accionesForm}>
              <button type="submit" className={styles.submit} disabled={guardando}>
                {guardando ? 'Guardando…' : editandoId ? 'Guardar cambios' : 'Crear categoría'}
              </button>
              {editandoId && (
                <button
                  type="button"
                  className={styles.cancelar}
                  onClick={limpiarFormulario}
                  disabled={guardando}
                >
                  Cancelar
                </button>
              )}
            </div>
          </form>
        </section>

        <section className={styles.card}>
          <h2 className={styles.cardTitle}>Catálogo</h2>
          {errorLista && <p className={styles.error}>{errorLista}</p>}
          {cargandoCategorias && <p className={styles.hint}>Cargando…</p>}
          {!cargandoCategorias && categorias.length === 0 && (
            <p className={styles.hint}>
              El catálogo está vacío: mientras no haya categorías activas, no se pueden crear
              reportes.
            </p>
          )}
          {categorias.length > 0 && (
            <div className={styles.tableWrapper}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Orden</th>
                    <th>Nombre</th>
                    <th>Id</th>
                    <th>Estado</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {categorias.map((categoria) => (
                    <tr key={categoria.id}>
                      <td>{categoria.orden}</td>
                      <td>
                        {categoria.nombre}
                        {categoria.descripcion && (
                          <>
                            <br />
                            <small>{categoria.descripcion}</small>
                          </>
                        )}
                      </td>
                      <td>{categoria.id}</td>
                      <td>{categoria.activa ? 'Activa' : 'Inactiva'}</td>
                      <td className={styles.accionesForm}>
                        <button
                          type="button"
                          className={styles.editarBoton}
                          onClick={() => iniciarEdicion(categoria)}
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          className={styles.editarBoton}
                          onClick={() => alternarActiva(categoria)}
                          disabled={actualizandoId === categoria.id}
                        >
                          {actualizandoId === categoria.id
                            ? 'Guardando…'
                            : categoria.activa
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
