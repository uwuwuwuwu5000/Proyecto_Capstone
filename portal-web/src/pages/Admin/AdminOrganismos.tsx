import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { collection, doc, getDocs, onSnapshot, setDoc } from 'firebase/firestore'
import { db } from '../../firebase/config'
import { useRequiereAdmin } from '../../hooks/useRequiereAdmin'
import { useConfirmacion } from '../../components/Dialogo/useConfirmacion'
import { ESTADOS_FINALIZADOS } from '../../components/Reportes/tiempos'
import PaginadorPaginas from '../../components/Paginacion/PaginadorPaginas'
import { useOperadores } from './operadores'
import styles from './Admin.module.css'

// El mapa (Leaflet) se descarga solo al abrir un límite.
const DialogoLimiteComuna = lazy(() => import('../../components/Map/DialogoLimiteComuna'))

interface OrganismoFila {
  id: string
  nombre: string
  comuna: string
  region: string
  activo: boolean
}

interface ConteoReportes {
  total: number
  abiertos: number
}

type FiltroEstado = '' | 'activos' | 'inactivos'

/** Tamaños de página disponibles; el primero es el valor por defecto. */
const TAMANOS_PAGINA = [25, 50, 100]

export default function AdminOrganismos() {
  const { cargando, autorizado } = useRequiereAdmin()
  const { confirmar, dialogo } = useConfirmacion()
  const { operadores } = useOperadores(autorizado)

  const [organismos, setOrganismos] = useState<OrganismoFila[]>([])
  const [cargandoLista, setCargandoLista] = useState(true)
  const [error, setError] = useState('')
  const [reportesPorOrganismo, setReportesPorOrganismo] = useState<Map<string, ConteoReportes> | null>(
    null,
  )

  const [filtro, setFiltro] = useState('')
  const [filtroEstado, setFiltroEstado] = useState<FiltroEstado>('')
  const [filtroRegion, setFiltroRegion] = useState('')
  const [actualizandoId, setActualizandoId] = useState<string | null>(null)
  const [limiteDe, setLimiteDe] = useState<OrganismoFila | null>(null)
  const [pagina, setPagina] = useState(0)
  const [filasPorPagina, setFilasPorPagina] = useState(TAMANOS_PAGINA[0])
  const tablaRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!autorizado) {
      return
    }
    return onSnapshot(
      collection(db, 'organismos'),
      (snapshot) => {
        const lista = snapshot.docs.map((docSnap) => {
          const data = docSnap.data()
          return {
            id: docSnap.id,
            nombre: typeof data.nombre === 'string' ? data.nombre : docSnap.id,
            comuna: typeof data.comuna === 'string' ? data.comuna : '—',
            region: typeof data.region === 'string' ? data.region : '',
            activo: data.activo !== false,
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
  }, [autorizado])

  // Reportes por organismo: una sola lectura al entrar (no en vivo), para no
  // releer todos los reportes con cada cambio. Cuando se pagine el listado de
  // reportes, este conteo debe pasar a consultas de conteo por organismo.
  useEffect(() => {
    if (!autorizado) {
      return
    }
    getDocs(collection(db, 'reports'))
      .then((snapshot) => {
        const conteo = new Map<string, ConteoReportes>()
        for (const d of snapshot.docs) {
          const data = d.data()
          const organismoId = typeof data.organismo?.id === 'string' ? data.organismo.id : null
          if (!organismoId) continue
          const fila = conteo.get(organismoId) ?? { total: 0, abiertos: 0 }
          fila.total += 1
          if (!ESTADOS_FINALIZADOS.has(data.estado)) fila.abiertos += 1
          conteo.set(organismoId, fila)
        }
        setReportesPorOrganismo(conteo)
      })
      .catch((err) => {
        console.error('Error al contar reportes por organismo:', err)
        setReportesPorOrganismo(new Map())
      })
  }, [autorizado])

  const operadoresPorOrganismo = useMemo(() => {
    const mapa = new Map<string, { activos: number; total: number; cuentas: number }>()
    for (const op of operadores) {
      const fila = mapa.get(op.organismoId) ?? { activos: 0, total: 0, cuentas: 0 }
      fila.total += 1
      if (op.activo) fila.activos += 1
      fila.cuentas += op.cuentas.length
      mapa.set(op.organismoId, fila)
    }
    return mapa
  }, [operadores])

  const regiones = useMemo(
    () =>
      Array.from(new Set(organismos.map((o) => o.region).filter(Boolean))).sort((a, b) =>
        a.localeCompare(b, 'es'),
      ),
    [organismos],
  )

  if (!cargando && !autorizado) {
    return <Navigate to="/" replace />
  }

  const filtroNormalizado = filtro.trim().toLowerCase()
  const organismosFiltrados = organismos.filter((o) => {
    if (filtroEstado === 'activos' && !o.activo) return false
    if (filtroEstado === 'inactivos' && o.activo) return false
    if (filtroRegion && o.region !== filtroRegion) return false
    return (
      !filtroNormalizado ||
      `${o.nombre} ${o.comuna} ${o.id}`.toLowerCase().includes(filtroNormalizado)
    )
  })
  const totalActivos = organismos.filter((o) => o.activo).length

  // La lista ya está en memoria: se corta por páginas. Si al activar o desactivar
  // una fila la última página queda vacía, se vuelve a la última que tenga filas.
  const totalPaginas = Math.max(1, Math.ceil(organismosFiltrados.length / filasPorPagina))
  const paginaActual = Math.min(pagina, totalPaginas - 1)
  const organismosPagina = organismosFiltrados.slice(
    paginaActual * filasPorPagina,
    (paginaActual + 1) * filasPorPagina,
  )

  function irAPagina(nueva: number) {
    setPagina(nueva)
    // Al cambiar de página se vuelve al inicio de la tabla.
    tablaRef.current?.scrollIntoView({ block: 'start' })
  }

  async function alternarActivo(organismo: OrganismoFila) {
    if (organismo.activo) {
      const ops = operadoresPorOrganismo.get(organismo.id)
      const reportes = reportesPorOrganismo?.get(organismo.id)
      const aceptado = await confirmar({
        titulo: `Desactivar ${organismo.nombre}`,
        mensaje: (
          <>
            <p>
              Los <strong>reportes nuevos</strong> hechos en {organismo.comuna} dejarán de llegar a
              esta municipalidad: se asignarán al organismo genérico de su categoría, sin operador.
            </p>
            <p>
              Lo existente no cambia
              {ops?.activos
                ? `: sus ${ops.activos} operador(es) activo(s) seguirán gestionando`
                : ''}
              {reportes?.abiertos ? ` los ${reportes.abiertos} reporte(s) abierto(s)` : ''}.
            </p>
          </>
        ),
        confirmar: 'Desactivar',
        peligroso: true,
      })
      if (!aceptado) return
    }
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

  return (
    <>
      <main className={`${styles.main} ${styles.mainAncho}`}>
        <div>
          <h1 className={styles.title}>Organismos activos</h1>
          <p className={styles.subtitle}>
            Activa o desactiva municipalidades del catálogo. Un reporte se asigna a la
            municipalidad cuyo límite comunal oficial lo contiene, si está activa. Para dar de alta
            operadores, usa{' '}
            <Link to="/admin/operadores" className={styles.footerLink}>
              Operadores
            </Link>
            .
          </p>
        </div>

        <section className={styles.card}>
          <div className={styles.filtrosTabla}>
            <label className={`${styles.field} ${styles.filtroBuscar}`}>
              <span className={styles.label}>Buscar</span>
              <input
                type="search"
                className={styles.input}
                value={filtro}
                onChange={(e) => {
                  setFiltro(e.target.value)
                  setPagina(0)
                }}
                placeholder="Comuna, nombre o id…"
              />
            </label>
            <label className={styles.field}>
              <span className={styles.label}>Estado</span>
              <select
                className={styles.input}
                value={filtroEstado}
                onChange={(e) => {
                  setFiltroEstado(e.target.value as FiltroEstado)
                  setPagina(0)
                }}
              >
                <option value="">Todos</option>
                <option value="activos">Activos</option>
                <option value="inactivos">Inactivos</option>
              </select>
            </label>
            <label className={styles.field}>
              <span className={styles.label}>Región</span>
              <select
                className={styles.input}
                value={filtroRegion}
                onChange={(e) => {
                  setFiltroRegion(e.target.value)
                  setPagina(0)
                }}
              >
                <option value="">Todas</option>
                {regiones.map((region) => (
                  <option key={region} value={region}>
                    {region}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <p className={styles.resumenTabla}>
            {organismosFiltrados.length.toLocaleString('es-CL')} de{' '}
            {organismos.length.toLocaleString('es-CL')} organismos · {totalActivos} activos
          </p>

          {error && <p className={styles.error}>{error}</p>}
          {cargandoLista && <p className={styles.hint}>Cargando…</p>}
          {!cargandoLista && organismosFiltrados.length === 0 && !error && (
            <p className={styles.hint}>No hay organismos que coincidan con los filtros.</p>
          )}

          {organismosFiltrados.length > 0 && (
            <div className={styles.tableWrapper} ref={tablaRef}>
              <table className={`${styles.table} ${styles.tablaOrganismos}`}>
                <thead>
                  <tr>
                    <th>Comuna</th>
                    <th className={styles.colOrganismo}>Organismo</th>
                    <th className={styles.colRegion}>Región</th>
                    <th className={`${styles.colSecundaria} ${styles.numero}`}>Operadores</th>
                    <th className={`${styles.colSecundaria} ${styles.numero}`}>Cuentas</th>
                    <th className={`${styles.colReportes} ${styles.numero}`}>
                      Reportes
                      <span className={styles.subtextoCelda}>abiertos / total</span>
                    </th>
                    <th>Estado</th>
                    <th>
                      <span className={styles.soloLector}>Acciones</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {organismosPagina.map((organismo) => {
                    const ops = operadoresPorOrganismo.get(organismo.id)
                    const reportes = reportesPorOrganismo?.get(organismo.id)
                    return (
                      <tr key={organismo.id}>
                        <td>
                          {organismo.comuna}
                          {/* Teléfono: el organismo va bajo la comuna. */}
                          <span
                            className={`${styles.subtextoCelda} ${styles.subtextoNormal} ${styles.soloAngosto}`}
                          >
                            {organismo.nombre}
                          </span>
                        </td>
                        <td className={styles.colOrganismo}>
                          {organismo.nombre}
                          <span className={styles.subtextoCelda}>{organismo.id}</span>
                        </td>
                        <td className={styles.colRegion}>{organismo.region || '—'}</td>
                        <td className={`${styles.colSecundaria} ${styles.numero}`}>
                          {ops ? `${ops.activos} / ${ops.total}` : '0'}
                        </td>
                        <td className={`${styles.colSecundaria} ${styles.numero}`}>
                          {ops?.cuentas ?? 0}
                        </td>
                        <td className={`${styles.colReportes} ${styles.numero}`}>
                          {reportesPorOrganismo === null
                            ? '…'
                            : `${reportes?.abiertos ?? 0} / ${reportes?.total ?? 0}`}
                        </td>
                        <td>
                          <span
                            className={`${styles.pildora} ${organismo.activo ? styles.pildoraActiva : styles.pildoraInactiva}`}
                          >
                            {organismo.activo ? 'Activo' : 'Inactivo'}
                          </span>
                        </td>
                        <td>
                          <div className={styles.accionesFila}>
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
                              onClick={() => setLimiteDe(organismo)}
                            >
                              Ver límite
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
          <PaginadorPaginas
            pagina={paginaActual}
            totalPaginas={totalPaginas}
            total={organismosFiltrados.length}
            tamano={filasPorPagina}
            tamanos={TAMANOS_PAGINA}
            onTamano={(n) => {
              setFilasPorPagina(n)
              setPagina(0)
            }}
            idSelector="filas-organismos"
            etiqueta="Paginación de organismos"
            onCambiar={irAPagina}
          />
          <p className={styles.notaTabla}>
            Operadores: activos / total. Cuentas: las creadas desde el portal para sus operadores.
          </p>
        </section>
      </main>

      {limiteDe && (
        <Suspense fallback={null}>
          <DialogoLimiteComuna
            organismoId={limiteDe.id}
            nombre={`${limiteDe.nombre} · ${limiteDe.comuna}`}
            onCerrar={() => setLimiteDe(null)}
          />
        </Suspense>
      )}
      {dialogo}
    </>
  )
}
