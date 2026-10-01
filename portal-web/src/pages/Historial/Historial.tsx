import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import {
  collection,
  getCountFromServer,
  onSnapshot,
  orderBy,
  query,
  where,
} from 'firebase/firestore'
import type { QueryDocumentSnapshot } from 'firebase/firestore'
import { db } from '../../firebase/config'
import { useAuth } from '../../context/AuthContext'
import Navbar from '../../components/Navbar/Navbar'
import { COLOR_POR_ESTADO, ETIQUETA_POR_ESTADO } from '../../constants/reportes'
import { useCategorias } from '../../context/CategoriasContext'
import styles from './Historial.module.css'

interface ReporteHistorial {
  id: string
  categoria: string
  descripcion: string
  estado: string
  organismo: string | null
  fecha: Date | null
  /** null mientras se está contando; ver carga de confirmaciones más abajo. */
  confirmaciones: number | null
}

/** Convierte un doc de "reports" propio del usuario a una fila de la tabla. */
function mapearReporte(docSnap: QueryDocumentSnapshot): ReporteHistorial {
  const data = docSnap.data()
  const organismo = data.organismo as { nombre?: unknown } | undefined

  return {
    id: docSnap.id,
    categoria: typeof data.categoria === 'string' ? data.categoria : 'otro',
    descripcion: typeof data.descripcion === 'string' ? data.descripcion : '',
    estado: typeof data.estado === 'string' ? data.estado : 'desconocido',
    organismo: typeof organismo?.nombre === 'string' ? organismo.nombre : null,
    fecha: typeof data.createdAt?.toDate === 'function' ? data.createdAt.toDate() : null,
    confirmaciones: null,
  }
}

export default function Historial() {
  const { user, loading: sesionCargando } = useAuth()
  const { etiqueta } = useCategorias()
  const [reportes, setReportes] = useState<ReporteHistorial[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (sesionCargando || !user) {
      return
    }

    setCargando(true)
    const misReportes = query(
      collection(db, 'reports'),
      where('uid', '==', user.uid),
      orderBy('createdAt', 'desc'),
    )

    const unsubscribe = onSnapshot(
      misReportes,
      (snapshot) => {
        const base = snapshot.docs.map(mapearReporte)
        setReportes(base)
        setCargando(false)
        setError('')

        // El conteo de confirmaciones no vive en el propio documento (queda
        // congelado en 0 por las reglas), así que se cuenta aparte por cada
        // reporte — igual que en el mapa, pero acá se pide de una vez porque
        // la lista ya está acotada a "mis reportes".
        base.forEach((reporte) => {
          getCountFromServer(collection(db, 'reports', reporte.id, 'confirmations'))
            .then((snap) => {
              const total = snap.data().count
              setReportes((prev) =>
                prev.map((r) => (r.id === reporte.id ? { ...r, confirmaciones: total } : r)),
              )
            })
            .catch((err) => {
              console.error('Error al contar confirmaciones:', err)
            })
        })
      },
      (err) => {
        console.error('Error al leer el historial de reportes:', err)
        setError('No pudimos cargar tu historial. Intenta más tarde.')
        setCargando(false)
      },
    )

    return unsubscribe
  }, [user, sesionCargando])

  // Esta pantalla es personal: sin sesión, no hay "mis reportes" que mostrar.
  if (!sesionCargando && !user) {
    return <Navigate to="/login" replace />
  }

  return (
    <div className={styles.page}>
      <Navbar />

      <main className={styles.main}>
        <h1 className={styles.title}>Mi historial de reportes</h1>
        <p className={styles.subtitle}>
          Reportes que has creado y el estado en que se encuentran.
        </p>

        {(sesionCargando || cargando) && (
          <p className={styles.status}>Cargando tu historial…</p>
        )}
        {error && <p className={styles.statusError}>{error}</p>}
        {!sesionCargando && !cargando && !error && reportes.length === 0 && (
          <p className={styles.status}>Todavía no has creado ningún reporte.</p>
        )}

        {!cargando && !error && reportes.length > 0 && (
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Categoría</th>
                  <th>Descripción</th>
                  <th>Estado</th>
                  <th>Organismo</th>
                  <th>Confirmaciones</th>
                  <th>Fecha</th>
                  <th>Detalle</th>
                </tr>
              </thead>
              <tbody>
                {reportes.map((reporte) => (
                  <tr key={reporte.id}>
                    <td>{etiqueta(reporte.categoria)}</td>
                    <td className={styles.descripcion}>{reporte.descripcion}</td>
                    <td>
                      <span
                        className={styles.badge}
                        style={{
                          color: COLOR_POR_ESTADO[reporte.estado] ?? COLOR_POR_ESTADO.reportado,
                          borderColor:
                            COLOR_POR_ESTADO[reporte.estado] ?? COLOR_POR_ESTADO.reportado,
                        }}
                      >
                        {ETIQUETA_POR_ESTADO[reporte.estado] ?? reporte.estado}
                      </span>
                    </td>
                    <td>{reporte.organismo ?? '—'}</td>
                    <td>{reporte.confirmaciones === null ? '…' : reporte.confirmaciones}</td>
                    <td>
                      {reporte.fecha
                        ? reporte.fecha.toLocaleDateString('es-CL', {
                            day: 'numeric',
                            month: 'long',
                            year: 'numeric',
                          })
                        : '—'}
                    </td>
                    <td>
                      {/*
                        PENDIENTE: pantalla de detalle del reporte. Ahí iría,
                        entre otras cosas, el historial de cambios de estado
                        (subcolección reports/{id}/statusHistory: quién
                        cambió el estado, cuándo, de qué a qué y con qué
                        comentario). Por ahora el botón queda deshabilitado
                        a propósito — no hay ruta ni componente todavía.
                      */}
                      <button
                        type="button"
                        className={styles.detalleBoton}
                        disabled
                        title="Próximamente: detalle del reporte e historial de estados"
                      >
                        Ver detalle
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  )
}
