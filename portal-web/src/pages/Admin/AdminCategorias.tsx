import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent, KeyboardEvent, PointerEvent } from 'react'
import { Navigate } from 'react-router-dom'
import {
  collection,
  doc,
  getCountFromServer,
  getDoc,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore'
import { db } from '../../firebase/config'
import { useRequiereAdmin } from '../../hooks/useRequiereAdmin'
import { useCategorias } from '../../context/CategoriasContext'
import type { Categoria } from '../../context/CategoriasContext'
import { useConfirmacion } from '../../components/Dialogo/useConfirmacion'
import { contarReportes } from '../../components/Reportes/accionesLote'
import styles from './Admin.module.css'

// Igual que la regla categoriaCatalogoValida() en firestore.rules.
const ID_CATEGORIA_REGEX = /^[a-z][a-z0-9_]{2,39}$/
const NOMBRE_MAX = 60
const DESCRIPCION_MAX = 200

/** Mueve un elemento de una posición a otra (sin modificar el arreglo original). */
function mover<T>(lista: T[], desde: number, hasta: number): T[] {
  const copia = [...lista]
  const [elemento] = copia.splice(desde, 1)
  copia.splice(hasta, 0, elemento)
  return copia
}

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
  const { confirmar, dialogo } = useConfirmacion()

  // Reportes por categoría (conteo en el servidor: no descarga los reportes).
  const [reportesPorCategoria, setReportesPorCategoria] = useState<Map<string, number>>(
    () => new Map(),
  )
  const idsCategorias = categorias.map((c) => c.id).join(',')
  useEffect(() => {
    if (!autorizado || !idsCategorias) {
      return
    }
    let vigente = true
    Promise.all(
      idsCategorias.split(',').map(async (categoriaId) => {
        const conteo = await getCountFromServer(
          query(collection(db, 'reports'), where('categoria', '==', categoriaId)),
        ).catch(() => null)
        return [categoriaId, conteo?.data().count ?? -1] as const
      }),
    ).then((pares) => {
      if (vigente) setReportesPorCategoria(new Map(pares))
    })
    return () => {
      vigente = false
    }
  }, [autorizado, idsCategorias])

  // ---- Orden arrastrando ----
  // Mientras se arrastra (y hasta que Firestore confirma) se muestra este orden.
  const [ordenLocal, setOrdenLocal] = useState<string[] | null>(null)
  const [arrastrandoId, setArrastrandoId] = useState<string | null>(null)
  const [guardandoOrden, setGuardandoOrden] = useState(false)
  const cuerpoTablaRef = useRef<HTMLTableSectionElement>(null)

  // Cuando el catálogo ya refleja el orden guardado, se deja de usar el local.
  useEffect(() => {
    if (ordenLocal && !arrastrandoId && !guardandoOrden && ordenLocal.join(',') === idsCategorias) {
      setOrdenLocal(null)
    }
  }, [ordenLocal, arrastrandoId, guardandoOrden, idsCategorias])

  const categoriaPorId = useMemo(() => new Map(categorias.map((c) => [c.id, c])), [categorias])
  const filas = ordenLocal
    ? ordenLocal.map((idFila) => categoriaPorId.get(idFila)).filter((c): c is Categoria => !!c)
    : categorias

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
    if (categoria.activa) {
      const enUso = reportesPorCategoria.get(categoria.id) ?? 0
      const aceptado = await confirmar({
        titulo: `Desactivar "${categoria.nombre}"`,
        mensaje: (
          <>
            <p>Dejará de ofrecerse al crear reportes nuevos, en la app y en el portal.</p>
            {enUso > 0 ? (
              <p>
                <strong>Está en uso en {contarReportes(enUso)}</strong>: no cambian, siguen
                mostrando esta categoría y se pueden filtrar por ella.
              </p>
            ) : (
              <p>Ningún reporte la usa todavía.</p>
            )}
          </>
        ),
        confirmar: 'Desactivar',
        peligroso: enUso > 0,
      })
      if (!aceptado) return
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

  /** Guarda el orden mostrado: 10, 20, 30… (solo escribe las que cambian). */
  async function guardarOrden(ids: string[]) {
    const paso = Math.max(1, Math.min(10, Math.floor(999 / Math.max(ids.length, 1))))
    const lote = writeBatch(db)
    let cambios = 0
    ids.forEach((idFila, i) => {
      const nuevoOrden = (i + 1) * paso
      if (categoriaPorId.get(idFila)?.orden !== nuevoOrden) {
        lote.update(doc(db, 'categorias', idFila), { orden: nuevoOrden, updatedAt: serverTimestamp() })
        cambios += 1
      }
    })
    if (cambios === 0) {
      setOrdenLocal(null)
      return
    }
    setGuardandoOrden(true)
    setErrorLista('')
    try {
      await lote.commit()
    } catch (err) {
      console.error('Error al guardar el orden:', err)
      setErrorLista('No pudimos guardar el nuevo orden. Inténtalo nuevamente.')
      setOrdenLocal(null)
    } finally {
      setGuardandoOrden(false)
    }
  }

  // Arrastre con el puntero (mouse, dedo o lápiz) desde el asa de la fila.
  function empezarArrastre(e: PointerEvent<HTMLButtonElement>, categoriaId: string) {
    if (guardandoOrden) return
    e.currentTarget.setPointerCapture(e.pointerId)
    setArrastrandoId(categoriaId)
    setOrdenLocal(filas.map((c) => c.id))
  }

  function moverArrastre(e: PointerEvent<HTMLButtonElement>) {
    if (!arrastrandoId || !ordenLocal || !cuerpoTablaRef.current) return
    const filasDom = Array.from(cuerpoTablaRef.current.rows)
    // Posición destino: la primera fila cuyo centro queda bajo el puntero.
    const actual = ordenLocal.indexOf(arrastrandoId)
    const bajoPuntero = filasDom.findIndex((fila) => {
      const caja = fila.getBoundingClientRect()
      return e.clientY < caja.top + caja.height / 2
    })
    // Al bajar, la fila sale de su lugar y las de abajo suben una posición.
    const destino =
      bajoPuntero === -1
        ? filasDom.length - 1
        : bajoPuntero > actual
          ? bajoPuntero - 1
          : bajoPuntero
    if (destino !== actual) {
      setOrdenLocal(mover(ordenLocal, actual, destino))
    }
  }

  function terminarArrastre() {
    if (!arrastrandoId) return
    setArrastrandoId(null)
    if (ordenLocal) void guardarOrden(ordenLocal)
  }

  // Teclado: flechas arriba / abajo sobre el asa mueven una posición.
  function moverConTeclado(e: KeyboardEvent<HTMLButtonElement>, categoriaId: string) {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return
    e.preventDefault()
    if (guardandoOrden) return
    const ids = filas.map((c) => c.id)
    const actual = ids.indexOf(categoriaId)
    const destino = e.key === 'ArrowUp' ? actual - 1 : actual + 1
    if (destino < 0 || destino >= ids.length) return
    const nuevos = mover(ids, actual, destino)
    setOrdenLocal(nuevos)
    void guardarOrden(nuevos)
  }

  return (
    <>
      <main className={styles.main}>
        <div>
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
          <p className={styles.hint}>
            Arrastra una fila desde <span aria-hidden="true">⠿</span> para cambiar su posición en las
            listas de la app y el portal (con el teclado: enfoca el asa y usa las flechas).
            {guardandoOrden && ' Guardando orden…'}
          </p>
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
              <table className={`${styles.table} ${styles.tablaCategorias}`}>
                <thead>
                  <tr>
                    <th>
                      <span className={styles.textoLargo}>Orden</span>
                      <span className={styles.textoCorto} aria-hidden="true">
                        N.º
                      </span>
                    </th>
                    <th>Nombre</th>
                    <th>Id</th>
                    <th className={`${styles.colReportesCategoria} ${styles.numero}`}>Reportes</th>
                    <th className={styles.colEstadoCategoria}>Estado</th>
                    <th>
                      <span className={styles.soloLector}>Acciones</span>
                    </th>
                  </tr>
                </thead>
                <tbody ref={cuerpoTablaRef}>
                  {filas.map((categoria) => {
                    const enUso = reportesPorCategoria.get(categoria.id)
                    const textoReportes =
                      enUso === undefined ? '…' : enUso < 0 ? '—' : enUso.toLocaleString('es-CL')
                    return (
                      <tr
                        key={categoria.id}
                        className={arrastrandoId === categoria.id ? styles.filaArrastrada : undefined}
                      >
                        <td>
                          <span className={styles.celdaOrden}>
                            <button
                              type="button"
                              className={styles.asaArrastre}
                              aria-label={`Mover "${categoria.nombre}" (posición ${filas.indexOf(categoria) + 1} de ${filas.length}). Usa las flechas arriba y abajo.`}
                              onPointerDown={(e) => empezarArrastre(e, categoria.id)}
                              onPointerMove={moverArrastre}
                              onPointerUp={terminarArrastre}
                              onPointerCancel={terminarArrastre}
                              onKeyDown={(e) => moverConTeclado(e, categoria.id)}
                              disabled={guardandoOrden}
                            >
                              ⠿
                            </button>
                            {categoria.orden}
                          </span>
                        </td>
                        <td>
                          {categoria.nombre}
                          {categoria.descripcion && (
                            <span className={styles.descripcionCategoria}>
                              {categoria.descripcion}
                            </span>
                          )}
                          <span className={`${styles.subtextoCelda} ${styles.soloAngostoCategorias}`}>
                            {textoReportes} {enUso === 1 ? 'reporte' : 'reportes'}
                          </span>
                          <span className={`${styles.soloAngostoCategorias} ${styles.estadoBajo}`}>
                            <span
                              className={`${styles.pildora} ${categoria.activa ? styles.pildoraActiva : styles.pildoraInactiva}`}
                            >
                              {categoria.activa ? 'Activa' : 'Inactiva'}
                            </span>
                          </span>
                        </td>
                        <td className={styles.idCategoria}>{categoria.id}</td>
                        <td className={`${styles.colReportesCategoria} ${styles.numero}`}>
                          {textoReportes}
                        </td>
                        <td className={styles.colEstadoCategoria}>
                          <span
                            className={`${styles.pildora} ${categoria.activa ? styles.pildoraActiva : styles.pildoraInactiva}`}
                          >
                            {categoria.activa ? 'Activa' : 'Inactiva'}
                          </span>
                        </td>
                        <td>
                          <div className={styles.accionesFila}>
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
                          </div>
                        </td>
                      </tr>
                      )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
      {dialogo}
    </>
  )
}
