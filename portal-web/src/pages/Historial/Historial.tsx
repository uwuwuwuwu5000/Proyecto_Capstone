import { useEffect, useState } from 'react'
import { Navigate, useSearchParams } from 'react-router-dom'
import {
  collection,
  getCountFromServer,
  onSnapshot,
  orderBy,
  query,
  where,
} from 'firebase/firestore'
import { db } from '../../firebase/config'
import { useAuth } from '../../context/AuthContext'
import Navbar from '../../components/Navbar/Navbar'
import DetalleReporte from '../../components/Reportes/DetalleReporte'
import { mapearReporte } from '../../components/Reportes/reporte'
import type { Reporte } from '../../components/Reportes/reporte'
import { COLOR_POR_ESTADO, ETIQUETA_POR_ESTADO } from '../../constants/reportes'
import { useCategorias } from '../../context/CategoriasContext'
import styles from './Historial.module.css'

export default function Historial() {
  const { user, loading: sesionCargando } = useAuth()
  const { etiqueta } = useCategorias()
  const [reportes, setReportes] = useState<Reporte[]>([])
  // Conteo de confirmaciones por reporte; ausente mientras se está contando.
  const [confirmaciones, setConfirmaciones] = useState<Record<string, number>>({})
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [params, setParams] = useSearchParams()
  // `?reporte=<id>` abre el detalle (enlace desde la campana de avisos).
  const [detalleId, setDetalleId] = useState<string | null>(params.get('reporte'))

  useEffect(() => {
    if (params.has('reporte')) setParams({}, { replace: true })
  }, [params, setParams])

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
        const lista = snapshot.docs.map(mapearReporte)
        setReportes(lista)
        setCargando(false)
        setError('')

        // El conteo de confirmaciones no vive en el propio documento (queda
        // congelado en 0 por las reglas), así que se cuenta aparte por cada
        // reporte — igual que en el mapa, pero acá se pide de una vez porque
        // la lista ya está acotada a "mis reportes".
        lista.forEach((reporte) => {
          getCountFromServer(collection(db, 'reports', reporte.id, 'confirmations'))
            .then((snap) => {
              const total = snap.data().count
              setConfirmaciones((prev) => ({ ...prev, [reporte.id]: total }))
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

  // Se busca en la lista viva: si el reporte cambia de estado con el detalle
  // abierto, el detalle se actualiza solo.
  const reporteDetalle = detalleId ? reportes.find((r) => r.id === detalleId) ?? null : null

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
            {/* En el teléfono cada fila se muestra como una tarjeta: las
                celdas llevan data-label para rotular cada dato (ver CSS). */}
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
                    <td data-label="Categoría" className={styles.categoria}>
                      {etiqueta(reporte.categoria)}
                    </td>
                    <td data-label="Descripción" className={styles.descripcion}>
                      {reporte.descripcion}
                    </td>
                    <td data-label="Estado">
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
                    <td data-label="Organismo">{reporte.organismoNombre ?? '—'}</td>
                    <td data-label="Confirmaciones">
                      {confirmaciones[reporte.id] ?? '…'}
                    </td>
                    <td data-label="Fecha">
                      {reporte.fecha
                        ? reporte.fecha.toLocaleDateString('es-CL', {
                            day: 'numeric',
                            month: 'long',
                            year: 'numeric',
                          })
                        : '—'}
                    </td>
                    <td className={styles.celdaDetalle}>
                      <button
                        type="button"
                        className={styles.detalleBoton}
                        onClick={() => setDetalleId(reporte.id)}
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

      {reporteDetalle && (
        <DetalleReporte
          reporte={reporteDetalle}
          operadorNombre={null}
          onCerrar={() => setDetalleId(null)}
          vista="ciudadano"
        />
      )}
    </div>
  )
}
