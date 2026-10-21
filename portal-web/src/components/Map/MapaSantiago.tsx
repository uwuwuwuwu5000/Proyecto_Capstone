import L from 'leaflet'
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png'
import markerIcon from 'leaflet/dist/images/marker-icon.png'
import markerShadow from 'leaflet/dist/images/marker-shadow.png'
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { MapContainer, Marker, TileLayer, Tooltip, useMapEvents } from 'react-leaflet'
import FotoReporte from '../Reportes/FotoReporte'
import {
  collection,
  doc,
  getCountFromServer,
  getDoc,
  onSnapshot,
} from 'firebase/firestore'
import type { QueryDocumentSnapshot } from 'firebase/firestore'
import { db } from '../../firebase/config'
import { useAuth } from '../../context/AuthContext'
import { ESTADOS_EN_ORDEN, ETIQUETA_POR_ESTADO, COLOR_POR_ESTADO } from '../../constants/reportes'
import { useCategorias } from '../../context/CategoriasContext'
import BarraVerificacion from '../../confianza/BarraVerificacion'
import { leerValidacion } from '../../confianza/tipos'
import type { Validacion } from '../../confianza/tipos'
import { ErrorConfirmacion, avisoPesoCero, confirmarReporte as confirmarConPeso, mensajeDeError } from '../../confianza/confirmar'
import {
  ICONOS_POR_ESTADO,
  ICONOS_SELECCIONADOS_POR_ESTADO,
  ICONO_ESTADO_DESCONOCIDO,
} from './estadoIconos'
import HistorialEstados from '../Reportes/HistorialEstados'
import { EstadoPildora } from '../Reportes/TarjetaReporte'
import { formatearFecha } from '../Reportes/reporte'
import { cargarHistorial } from '../Reportes/historial'
import type { CambioEstado } from '../Reportes/historial'
import styles from './MapaSantiago.module.css'

// El ícono por defecto de Leaflet apunta a rutas relativas que Vite no
// resuelve al empaquetar; se deja como respaldo por si algún marcador queda
// sin ícono explícito (los del mapa siempre usan ICONOS_POR_ESTADO más abajo).
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
  validacion: Validacion
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
    validacion: leerValidacion(data.validacion),
  }
}

// Ancho que ocupa el panel lateral en escritorio (340 px + márgenes).
const ANCHO_PANEL = 352

// El resumen al pasar el mouse solo tiene sentido con mouse: en una pantalla
// táctil, Leaflet también lo abre al tocar el pin y quedaría encima de la
// hoja de detalle. Ahí el toque abre el detalle directamente.
const ADMITE_HOVER =
  typeof window !== 'undefined' && window.matchMedia('(hover: hover) and (pointer: fine)').matches

/**
 * Dentro del mapa: cierra el detalle al tocar una zona vacía y, al abrir un
 * reporte, mueve el mapa lo justo para que su pin no quede tapado por el
 * panel (a la derecha en escritorio, la hoja inferior en el teléfono).
 */
function ControlSeleccion({
  lat,
  lng,
  onTocarMapa,
}: {
  lat: number | null
  lng: number | null
  onTocarMapa: () => void
}) {
  const map = useMapEvents({ click: onTocarMapa })

  useEffect(() => {
    if (lat === null || lng === null) {
      return
    }
    const tamano = map.getSize()
    const punto = map.latLngToContainerPoint([lat, lng])
    if (window.matchMedia('(max-width: 640px)').matches) {
      // La hoja tapa hasta el 65% inferior: el pin debe quedar arriba.
      if (punto.y > tamano.y * 0.3) {
        map.panBy([0, punto.y - tamano.y * 0.2])
      }
    } else {
      const anchoLibre = tamano.x - ANCHO_PANEL
      if (punto.x > anchoLibre - 24) {
        map.panBy([punto.x - anchoLibre / 2, 0])
      }
    }
  }, [map, lat, lng])

  return null
}

interface EstadoHistorial {
  cargando: boolean
  /** Estado del reporte cuando se leyó el historial. */
  estado: string
  cambios?: CambioEstado[]
  error?: string
}

interface MapaSantiagoProps {
  /**
   * 'tarjeta' (por defecto): tamaño fijo, para incrustar dentro de una
   * página (Landing). 'pantallaCompleta': ocupa todo el alto disponible de
   * su contenedor — pensado para una página dedicada solo al mapa.
   */
  variante?: 'tarjeta' | 'pantallaCompleta'
}

export default function MapaSantiago({ variante = 'tarjeta' }: MapaSantiagoProps) {
  const completo = variante === 'pantallaCompleta'
  const { user, perfil, loading: sesionCargando } = useAuth()
  const { etiqueta } = useCategorias()
  // Las cuentas operador ven el mapa público, pero no confirman reportes:
  // los gestionan (las reglas también se lo impiden).
  const esOperador = perfil?.role === 'operador'

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
  const [mensajeConfirmacion, setMensajeConfirmacion] = useState<
    Record<string, { texto: string; tipo: 'ok' | 'aviso' | 'error' }>
  >({})
  // Historial de estados, pedido solo al apretar "Ver historial". Se guarda
  // con el estado que tenía el reporte al leerlo: si cambió, se vuelve a leer.
  const [historiales, setHistoriales] = useState<Record<string, EstadoHistorial>>({})
  const [historialAbierto, setHistorialAbierto] = useState<Record<string, boolean>>({})
  // Reporte abierto en el panel de detalle (null = ninguno).
  const [seleccionadoId, setSeleccionadoId] = useState<string | null>(null)

  const cerrarDetalle = useCallback(() => setSeleccionadoId(null), [])

  useEffect(() => {
    if (!seleccionadoId) {
      return
    }
    const alPresionar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSeleccionadoId(null)
    }
    window.addEventListener('keydown', alPresionar)
    return () => window.removeEventListener('keydown', alPresionar)
  }, [seleccionadoId])

  async function alternarHistorial(reporte: Reporte) {
    const abrir = !historialAbierto[reporte.id]
    setHistorialAbierto((prev) => ({ ...prev, [reporte.id]: abrir }))
    const actual = historiales[reporte.id]
    if (!abrir || actual?.cargando || (actual?.cambios && actual.estado === reporte.estado)) {
      return
    }
    setHistoriales((prev) => ({
      ...prev,
      [reporte.id]: { cargando: true, estado: reporte.estado },
    }))
    try {
      const cambios = await cargarHistorial(reporte.id)
      setHistoriales((prev) => ({
        ...prev,
        [reporte.id]: { cargando: false, estado: reporte.estado, cambios },
      }))
    } catch (err) {
      console.error('Error al leer el historial de estados:', err)
      setHistoriales((prev) => ({
        ...prev,
        [reporte.id]: {
          cargando: false,
          estado: reporte.estado,
          error: 'No se pudo cargar el historial.',
        },
      }))
    }
  }

  async function confirmarReporte(reporte: Reporte) {
    if (!user || confirmando[reporte.id] || confirmados[reporte.id]) {
      return
    }

    setConfirmando((prev) => ({ ...prev, [reporte.id]: true }))
    setMensajeConfirmacion((prev) => {
      const { [reporte.id]: _quitado, ...resto } = prev
      return resto
    })
    try {
      // `email_verified` del token es lo que ven las reglas (el del perfil
      // de Auth puede ir adelantado hasta que el token se renueva).
      const token = await user.getIdTokenResult()
      const resultado = await confirmarConPeso(db, {
        reportId: reporte.id,
        uid: user.uid,
        correoVerificado: token.claims.email_verified === true,
        creadaEnMs: perfil?.createdAt?.getTime() ?? null,
      })

      setConfirmados((prev) => ({ ...prev, [reporte.id]: true }))
      setMensajeConfirmacion((prev) => ({
        ...prev,
        [reporte.id]: resultado.motivoPesoCero
          ? { texto: avisoPesoCero(resultado.motivoPesoCero), tipo: 'aviso' }
          : {
              texto: resultado.recienValidado
                ? 'Gracias. Tu confirmación dejó este reporte validado por la comunidad.'
                : 'Gracias. Tu confirmación sumó a la verificación de la comunidad.',
              tipo: 'ok',
            },
      }))
      // Actualización optimista del conteo ya cargado, sin volver a consultar.
      setConfirmaciones((prev) => {
        const actual = prev[reporte.id]
        if (!actual || actual.total === undefined) {
          return prev
        }
        return { ...prev, [reporte.id]: { ...actual, total: actual.total + 1 } }
      })
    } catch (err) {
      if (err instanceof ErrorConfirmacion && err.codigo === 'ya_confirmo') {
        setConfirmados((prev) => ({ ...prev, [reporte.id]: true }))
      }
      setMensajeConfirmacion((prev) => ({
        ...prev,
        [reporte.id]: { texto: mensajeDeError(err), tipo: 'error' },
      }))
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

  function abrirDetalle(reporte: Reporte) {
    setSeleccionadoId(reporte.id)
    cargarConfirmaciones(reporte)
    if (reporte.foto) {
      cargarFoto(reporte)
    }
  }

  // Se busca en la lista viva: si el reporte cambia de estado mientras está
  // abierto, el panel lo refleja; si desaparece, el panel se cierra solo.
  const seleccionado = seleccionadoId
    ? reportes.find((r) => r.id === seleccionadoId) ?? null
    : null

  function renderDetalle(reporte: Reporte) {
    const estadoFoto = fotos[reporte.id]
    const estadoConteo = confirmaciones[reporte.id]
    const esAutor = !!user && reporte.uid === user.uid
    const yaConfirmado = !!confirmados[reporte.id]
    const confirmandoAhora = !!confirmando[reporte.id]
    const historial = historiales[reporte.id]
    const verHistorial = !!historialAbierto[reporte.id]

    return (
      <aside className={styles.panel} aria-labelledby="detalle-mapa-titulo">
        <div className={styles.panelCabecera}>
          <div>
            <h2 id="detalle-mapa-titulo" className={styles.panelTitulo}>
              {etiqueta(reporte.categoria)}
            </h2>
            <EstadoPildora estado={reporte.estado} />
          </div>
          <button
            type="button"
            className={styles.panelCerrar}
            onClick={cerrarDetalle}
            aria-label="Cerrar detalle del reporte"
          >
            ✕
          </button>
        </div>

        <div className={styles.panelCuerpo}>
          {reporte.foto && (
            <div className={styles.foto}>
              {estadoFoto?.cargando && <p className={styles.fotoAviso}>Cargando foto…</p>}
              {estadoFoto?.error && <p className={styles.fotoAviso}>{estadoFoto.error}</p>}
              {estadoFoto?.src && <img src={estadoFoto.src} alt="Foto del reporte" />}
            </div>
          )}

          <p className={styles.panelDescripcion}>{reporte.descripcion}</p>

          <dl className={styles.panelDatos}>
            <dt>Fecha</dt>
            <dd>{formatearFecha(reporte.fecha, true)}</dd>
            <dt>Confirmaciones</dt>
            <dd>
              {estadoConteo?.cargando && 'cargando…'}
              {estadoConteo?.error && estadoConteo.error}
              {estadoConteo?.total !== undefined && estadoConteo.total}
              {!estadoConteo && '—'}
            </dd>
          </dl>

          <BarraVerificacion validacion={reporte.validacion} />

          {!esAutor && !esOperador && (
            <div className={styles.confirmar}>
              {yaConfirmado ? (
                <span className={styles.confirmarHecho}>✓ Ya confirmaste este reporte</span>
              ) : (
                <button
                  type="button"
                  className={styles.confirmarBoton}
                  disabled={confirmandoAhora}
                  onClick={() => confirmarReporte(reporte)}
                >
                  {confirmandoAhora ? 'Confirmando…' : 'Confirmar que existe'}
                </button>
              )}
              {mensajeConfirmacion[reporte.id] && (
                <p
                  className={`${styles.confirmarMensaje} ${
                    mensajeConfirmacion[reporte.id].tipo === 'aviso'
                      ? styles.confirmarAviso
                      : mensajeConfirmacion[reporte.id].tipo === 'ok'
                        ? styles.confirmarOk
                        : ''
                  }`}
                  role={mensajeConfirmacion[reporte.id].tipo === 'error' ? 'alert' : 'status'}
                >
                  {mensajeConfirmacion[reporte.id].texto}
                </p>
              )}
            </div>
          )}

          {/* El administrador pasa de aquí a la administración del mismo reporte (detalle, estado, veredicto, moderación). */}
          {perfil?.role === 'admin' && (
            <Link to={`/admin/reportes?reporte=${reporte.id}`} className={styles.enlaceAdmin}>
              Editar / ver más en administración →
            </Link>
          )}

          <div className={styles.historial}>
            <button
              type="button"
              className={styles.historialBoton}
              onClick={() => alternarHistorial(reporte)}
              aria-expanded={verHistorial}
            >
              {verHistorial ? 'Ocultar historial de estados' : 'Ver historial de estados'}
            </button>
            {verHistorial && (
              <>
                {historial?.cargando && <p className={styles.historialAviso}>Cargando…</p>}
                {historial?.error && <p className={styles.historialAviso}>{historial.error}</p>}
                {historial?.cambios && (
                  <HistorialEstados
                    cambios={historial.cambios}
                    fechaCreacion={reporte.fecha}
                    compacto
                  />
                )}
              </>
            )}
          </div>
        </div>
      </aside>
    )
  }

  return (
    <div className={completo ? styles.raizCompleta : undefined}>
      <div className={completo ? styles.mapaMarcoCompleto : styles.mapaMarco}>
        <MapContainer
          center={CENTRO_SANTIAGO}
          zoom={12}
          // A pantalla completa el mapa es lo único de la página: conviene
          // que el scroll del mouse haga zoom. Incrustado en la Landing se
          // desactiva para no secuestrar el scroll de la página.
          scrollWheelZoom={completo}
          className={completo ? styles.mapCompleto : styles.map}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <ControlSeleccion
            lat={seleccionado?.lat ?? null}
            lng={seleccionado?.lng ?? null}
            onTocarMapa={cerrarDetalle}
          />
          {reportes.map((reporte) => {
            const esSeleccionado = reporte.id === seleccionadoId
            const conteo = confirmaciones[reporte.id]
            return (
              <Marker
                key={reporte.id}
                position={[reporte.lat, reporte.lng]}
                icon={
                  esSeleccionado
                    ? ICONOS_SELECCIONADOS_POR_ESTADO[reporte.estado] ??
                      ICONOS_SELECCIONADOS_POR_ESTADO.reportado
                    : ICONOS_POR_ESTADO[reporte.estado] ?? ICONO_ESTADO_DESCONOCIDO
                }
                zIndexOffset={esSeleccionado ? 1000 : 0}
                eventHandlers={{
                  click: () => abrirDetalle(reporte),
                  // Las confirmaciones del resumen se piden la primera vez que
                  // se pasa el mouse (y quedan guardadas para el detalle).
                  mouseover: () => cargarConfirmaciones(reporte),
                }}
              >
                {ADMITE_HOVER && !esSeleccionado && (
                  <Tooltip direction="top" offset={[0, -10]}>
                    {reporte.foto && (
                      <div className={styles.tooltipFoto}>
                        <FotoReporte foto={reporte.foto} inmediata />
                      </div>
                    )}
                    <strong>{etiqueta(reporte.categoria)}</strong>
                    {' · '}
                    {ETIQUETA_POR_ESTADO[reporte.estado] ?? reporte.estado}
                    <br />
                    {formatearFecha(reporte.fecha, true)}
                    <br />
                    Confirmaciones:{' '}
                    {conteo?.total !== undefined ? conteo.total : conteo?.error ? '—' : '…'}
                    <br />
                    <em className={styles.tooltipAccion}>Clic para ver el detalle</em>
                  </Tooltip>
                )}
              </Marker>
            )
          })}
        </MapContainer>

        {/* Fuera del MapContainer a propósito: así el zoom y el arrastre del
            mapa no lo afectan (ver .panel en el CSS). */}
        {seleccionado && renderDetalle(seleccionado)}
      </div>

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
