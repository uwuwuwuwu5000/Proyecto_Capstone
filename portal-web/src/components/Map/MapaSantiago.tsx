import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png'
import markerIcon from 'leaflet/dist/images/marker-icon.png'
import markerShadow from 'leaflet/dist/images/marker-shadow.png'
import { useEffect, useState } from 'react'
import { MapContainer, Marker, Popup, TileLayer } from 'react-leaflet'
import {
  collection,
  doc,
  getCountFromServer,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore'
import type { QueryDocumentSnapshot } from 'firebase/firestore'
import { FirebaseError } from 'firebase/app'
import { db } from '../../firebase/config'
import { useAuth } from '../../context/AuthContext'
import styles from './MapaSantiago.module.css'

// El ícono por defecto de Leaflet apunta a rutas relativas que Vite no
// resuelve al empaquetar; se deja como respaldo por si algún marcador queda
// sin ícono explícito (los del mapa siempre usan crearIconoEstado más abajo).
const iconoPorDefecto = L.icon({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
})
L.Marker.prototype.options.icon = iconoPorDefecto

// Centro aproximado de Santiago (Plaza de Armas), para cuando aún no hay
// reportes que centren el mapa por sí solos.
const CENTRO_SANTIAGO: [number, number] = [-33.4372, -70.6506]

// Colores de estado de reportes (paleta "Ciudad Alerta", igual que la app móvil).
const COLOR_POR_ESTADO: Record<string, string> = {
  reportado: '#1ca9c9',
  en_revision: '#7fd3e4',
  derivado: '#a5b4c3',
  en_proceso: '#4a90a4',
  resuelto: '#f8fafc',
  cerrado: '#5c677d',
}
const ESTADOS_EN_ORDEN = [
  'reportado',
  'en_revision',
  'derivado',
  'en_proceso',
  'resuelto',
  'cerrado',
]
const ETIQUETA_POR_ESTADO: Record<string, string> = {
  reportado: 'Reportado',
  en_revision: 'En revisión',
  derivado: 'Derivado',
  en_proceso: 'En proceso',
  resuelto: 'Resuelto',
  cerrado: 'Cerrado',
}

function crearIconoEstado(color: string): L.DivIcon {
  return L.divIcon({
    className: styles.pin,
    html: `<span style="background:${color}"></span>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
    popupAnchor: [0, -10],
  })
}

// Un ícono por estado, precalculado una sola vez (no en cada render).
const ICONOS_POR_ESTADO: Record<string, L.DivIcon> = Object.fromEntries(
  Object.entries(COLOR_POR_ESTADO).map(([estado, color]) => [
    estado,
    crearIconoEstado(color),
  ]),
)
const ICONO_ESTADO_DESCONOCIDO = crearIconoEstado(COLOR_POR_ESTADO.reportado)

// La foto de un reporte llega por una de dos vías (foto.kind en el doc):
// ya con URL resuelta (Cloud Storage) o como referencia a un doc en
// "reportPhotos" que hay que ir a buscar (base64, plan gratuito sin Storage).
type FotoInfo =
  | { tipo: 'cloud-storage'; url: string }
  | { tipo: 'firestore'; path: string }

interface Reporte {
  id: string
  uid: string
  categoria: string
  descripcion: string
  estado: string
  lat: number
  lng: number
  fecha: Date | null
  foto: FotoInfo | null
}

/** Estado de carga de la foto de un reporte, cacheado por id de reporte. */
interface EstadoFoto {
  cargando: boolean
  src?: string
  error?: string
}

/**
 * Estado de carga del conteo de confirmaciones, cacheado por id de reporte.
 * El campo reports/{id}.confirmaciones queda siempre en 0 (las reglas de
 * seguridad impiden que el cliente lo incremente); el número real solo
 * existe contando los documentos de la subcolección confirmations, igual
 * que hace la propia app móvil.
 */
interface EstadoConteo {
  cargando: boolean
  total?: number
  error?: string
}

/** Convierte un doc de "reports" a Reporte, o null si le falta la ubicación. */
function mapearReporte(docSnap: QueryDocumentSnapshot): Reporte | null {
  const data = docSnap.data()
  const ubicacion = data.ubicacion as { lat?: unknown; lng?: unknown } | undefined
  const lat = ubicacion?.lat
  const lng = ubicacion?.lng

  if (typeof lat !== 'number' || typeof lng !== 'number') {
    return null
  }

  const fotoRaw = data.foto as
    | { kind?: unknown; path?: unknown; url?: unknown }
    | null
    | undefined

  let foto: FotoInfo | null = null
  if (fotoRaw?.kind === 'cloud-storage' && typeof fotoRaw.url === 'string') {
    foto = { tipo: 'cloud-storage', url: fotoRaw.url }
  } else if (fotoRaw?.kind === 'firestore' && typeof fotoRaw.path === 'string') {
    foto = { tipo: 'firestore', path: fotoRaw.path }
  }

  return {
    id: docSnap.id,
    uid: typeof data.uid === 'string' ? data.uid : '',
    categoria: typeof data.categoria === 'string' ? data.categoria : 'Sin categoría',
    descripcion: typeof data.descripcion === 'string' ? data.descripcion : '',
    estado: typeof data.estado === 'string' ? data.estado : 'desconocido',
    lat,
    lng,
    fecha: typeof data.createdAt?.toDate === 'function' ? data.createdAt.toDate() : null,
    foto,
  }
}

export default function MapaSantiago() {
  const { user, loading: sesionCargando } = useAuth()

  const [reportes, setReportes] = useState<Reporte[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  // Fotos cargadas bajo demanda (al abrir un marcador), cacheadas por id de reporte.
  const [fotos, setFotos] = useState<Record<string, EstadoFoto>>({})
  // Conteo de confirmaciones, también bajo demanda (ver EstadoConteo arriba).
  const [confirmaciones, setConfirmaciones] = useState<Record<string, EstadoConteo>>({})
  // Reportes que el usuario actual ya confirmó en esta sesión (oculta el botón).
  const [confirmados, setConfirmados] = useState<Record<string, boolean>>({})
  // Reportes con una confirmación en curso (deshabilita el botón mientras espera).
  const [confirmando, setConfirmando] = useState<Record<string, boolean>>({})
  // Mensaje puntual tras intentar confirmar (p. ej. "Ya confirmaste este reporte").
  const [mensajeConfirmacion, setMensajeConfirmacion] = useState<Record<string, string>>({})

  async function confirmarReporte(reporte: Reporte) {
    if (!user || confirmando[reporte.id] || confirmados[reporte.id]) {
      return
    }

    setConfirmando((prev) => ({ ...prev, [reporte.id]: true }))
    setMensajeConfirmacion((prev) => ({ ...prev, [reporte.id]: '' }))
    try {
      // Único efecto en la base de datos: este documento. No se toca
      // reports/{id} (el contador "confirmaciones" queda pendiente, es tarea
      // del sistema de confianza) ni users/{autorUid}.
      await setDoc(doc(db, 'reports', reporte.id, 'confirmations', user.uid), {
        uid: user.uid,
        reportId: reporte.id,
        createdAt: serverTimestamp(),
      })

      setConfirmados((prev) => ({ ...prev, [reporte.id]: true }))
      // Actualización optimista del conteo ya cargado, sin volver a consultar.
      setConfirmaciones((prev) => {
        const actual = prev[reporte.id]
        if (!actual || actual.total === undefined) {
          return prev
        }
        return { ...prev, [reporte.id]: { ...actual, total: actual.total + 1 } }
      })
    } catch (err) {
      // El id del documento es el propio uid: un segundo intento es un
      // "update" sobre un documento existente, y las reglas lo rechazan con
      // permission-denied — así es como Firestore garantiza una sola
      // confirmación por usuario y reporte, sin lógica extra en el cliente.
      const code = err instanceof FirebaseError ? err.code : ''
      if (code === 'permission-denied') {
        setConfirmados((prev) => ({ ...prev, [reporte.id]: true }))
        setMensajeConfirmacion((prev) => ({
          ...prev,
          [reporte.id]: 'Ya confirmaste este reporte.',
        }))
      } else {
        console.error('Error al confirmar el reporte:', err)
        setMensajeConfirmacion((prev) => ({
          ...prev,
          [reporte.id]: 'No pudimos registrar tu confirmación.',
        }))
      }
    } finally {
      setConfirmando((prev) => ({ ...prev, [reporte.id]: false }))
    }
  }

  async function cargarConfirmaciones(reporte: Reporte) {
    if (confirmaciones[reporte.id]) {
      return // ya se cargó o está cargando
    }
    setConfirmaciones((prev) => ({ ...prev, [reporte.id]: { cargando: true } }))
    try {
      const snap = await getCountFromServer(
        collection(db, 'reports', reporte.id, 'confirmations'),
      )
      setConfirmaciones((prev) => ({
        ...prev,
        [reporte.id]: { cargando: false, total: snap.data().count },
      }))
    } catch (err) {
      console.error('Error al contar confirmaciones:', err)
      setConfirmaciones((prev) => ({
        ...prev,
        [reporte.id]: { cargando: false, error: 'No se pudo cargar.' },
      }))
    }
  }

  async function cargarFoto(reporte: Reporte) {
    const { foto } = reporte
    if (!foto || fotos[reporte.id]) {
      return // sin foto, o ya se cargó / está cargando
    }

    // Cloud Storage: la URL ya viene resuelta, no hay que consultar Firestore.
    if (foto.tipo === 'cloud-storage') {
      setFotos((prev) => ({ ...prev, [reporte.id]: { cargando: false, src: foto.url } }))
      return
    }

    // Firestore: hay que ir a buscar el dataUrl al doc de "reportPhotos".
    setFotos((prev) => ({ ...prev, [reporte.id]: { cargando: true } }))
    try {
      const snap = await getDoc(doc(db, foto.path))
      const dataUrl = snap.data()?.dataUrl
      setFotos((prev) => ({
        ...prev,
        [reporte.id]:
          typeof dataUrl === 'string'
            ? { cargando: false, src: dataUrl }
            : { cargando: false, error: 'No se encontró la foto.' },
      }))
    } catch (err) {
      console.error('Error al leer la foto del reporte:', err)
      setFotos((prev) => ({
        ...prev,
        [reporte.id]: { cargando: false, error: 'No se pudo cargar la foto.' },
      }))
    }
  }

  useEffect(() => {
    // Igual que la app móvil: leer /reports exige sesión iniciada.
    if (sesionCargando) {
      return
    }
    if (!user) {
      setReportes([])
      setCargando(false)
      setError('')
      return
    }

    setCargando(true)
    const unsubscribe = onSnapshot(
      collection(db, 'reports'),
      (snapshot) => {
        const siguientes: Reporte[] = []
        snapshot.forEach((docSnap) => {
          const reporte = mapearReporte(docSnap)
          if (reporte) {
            siguientes.push(reporte)
          }
        })
        setReportes(siguientes)
        setCargando(false)
        setError('')
      },
      (err) => {
        console.error('Error al leer reports:', err)
        setError('No pudimos cargar los reportes del mapa. Intenta más tarde.')
        setCargando(false)
      },
    )

    return unsubscribe
  }, [user, sesionCargando])

  return (
    <div>
      <MapContainer
        center={CENTRO_SANTIAGO}
        zoom={12}
        scrollWheelZoom={false}
        className={styles.map}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {reportes.map((reporte) => {
          const estadoFoto = fotos[reporte.id]
          const estadoConteo = confirmaciones[reporte.id]
          const esAutor = !!user && reporte.uid === user.uid
          const yaConfirmado = !!confirmados[reporte.id]
          const confirmandoAhora = !!confirmando[reporte.id]

          return (
            <Marker
              key={reporte.id}
              position={[reporte.lat, reporte.lng]}
              icon={ICONOS_POR_ESTADO[reporte.estado] ?? ICONO_ESTADO_DESCONOCIDO}
              eventHandlers={{
                click: () => {
                  cargarConfirmaciones(reporte)
                  if (reporte.foto) {
                    cargarFoto(reporte)
                  }
                },
              }}
            >
              <Popup>
                <strong>{reporte.categoria}</strong>
                <br />
                {reporte.descripcion}
                <br />
                Estado: {reporte.estado}
                <br />
                Confirmaciones:{' '}
                {estadoConteo?.cargando && 'cargando…'}
                {estadoConteo?.error && estadoConteo.error}
                {estadoConteo?.total !== undefined && estadoConteo.total}
                {!estadoConteo && '—'}

                {!esAutor && (
                  <div className={styles.confirmar}>
                    {yaConfirmado ? (
                      <span className={styles.confirmarHecho}>
                        ✓ Ya confirmaste este reporte
                      </span>
                    ) : (
                      <button
                        type="button"
                        className={styles.confirmarBoton}
                        disabled={confirmandoAhora}
                        onClick={() => confirmarReporte(reporte)}
                      >
                        {confirmandoAhora
                          ? 'Confirmando…'
                          : 'Confirmar que existe'}
                      </button>
                    )}
                    {mensajeConfirmacion[reporte.id] && (
                      <p className={styles.confirmarMensaje}>
                        {mensajeConfirmacion[reporte.id]}
                      </p>
                    )}
                  </div>
                )}

                {reporte.fecha && (
                  <>
                    <br />
                    {reporte.fecha.toLocaleDateString('es-CL', {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                    })}
                  </>
                )}

                {reporte.foto && (
                  <div className={styles.foto}>
                    {estadoFoto?.cargando && <p>Cargando foto…</p>}
                    {estadoFoto?.error && <p>{estadoFoto.error}</p>}
                    {estadoFoto?.src && (
                      <img src={estadoFoto.src} alt="Foto del reporte" />
                    )}
                  </div>
                )}
              </Popup>
            </Marker>
          )
        })}
      </MapContainer>

      {!sesionCargando && !user && (
        <p className={styles.status}>
          Inicia sesión para ver los reportes en el mapa.
        </p>
      )}
      {user && cargando && <p className={styles.status}>Cargando reportes…</p>}
      {user && !cargando && !error && reportes.length === 0 && (
        <p className={styles.status}>Todavía no hay reportes para mostrar.</p>
      )}
      {error && <p className={styles.statusError}>{error}</p>}

      {user && reportes.length > 0 && (
        <ul className={styles.leyenda}>
          {ESTADOS_EN_ORDEN.map((estado) => (
            <li key={estado} className={styles.leyendaItem}>
              <span
                className={styles.leyendaPunto}
                style={{ background: COLOR_POR_ESTADO[estado] }}
              />
              {ETIQUETA_POR_ESTADO[estado]}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
