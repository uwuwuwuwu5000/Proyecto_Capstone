import L from 'leaflet'
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png'
import markerIcon from 'leaflet/dist/images/marker-icon.png'
import markerShadow from 'leaflet/dist/images/marker-shadow.png'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { MapContainer, Marker, TileLayer, Tooltip, useMap, useMapEvents } from 'react-leaflet'
import FotoReporte from '../Reportes/FotoReporte'
import { collection, doc, getCountFromServer, getDoc } from 'firebase/firestore'
import type { QueryDocumentSnapshot } from 'firebase/firestore'
import { USAR_EMULADOR, db } from '../../firebase/config'
import { useAuth } from '../../context/AuthContext'
import { ESTADOS_EN_ORDEN, ETIQUETA_POR_ESTADO, COLOR_POR_ESTADO } from '../../constants/reportes'
import { useCategorias } from '../../context/CategoriasContext'
import VerificacionReporte from '../../confianza/VerificacionReporte'
import { leerValidacion } from '../../confianza/tipos'
import type { Validacion } from '../../confianza/tipos'
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
import CapaAgrupada, { ZOOM_MAXIMO } from './CapaAgrupada'
import { REGION_INICIAL, cargarRegiones, regionDePunto } from './regiones'
import type { Region } from './regiones'
import { MAXIMO_POR_REGION, useReportesRegion } from './useReportesRegion'
import { cajaDePuntos } from '@ciudad-alerta/comun'
import type { CajaGeografica } from '@ciudad-alerta/comun'
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

/** Solo con los emuladores (pruebas de pantalla): deja el mapa a mano para ubicar un reporte. */
function ExponerMapaParaPruebas() {
  const map = useMap()
  useEffect(() => {
    if (USAR_EMULADOR) (window as unknown as { __mapa?: unknown }).__mapa = map
  }, [map])
  return null
}

/**
 * Encuadra el mapa en la región o en los reportes filtrados cuando cambia la
 * región, un filtro o termina de cargar. No vuelve a encuadrar con cada
 * actualización en vivo: no debe mover el mapa mientras alguien lo explora.
 */
function ControlEncuadre({ caja, clave }: { caja: CajaGeografica | null; clave: string }) {
  const map = useMap()
  const cajaRef = useRef(caja)
  cajaRef.current = caja

  useEffect(() => {
    const c = cajaRef.current
    if (!c) return
    map.fitBounds(
      [
        [c.minLat, c.minLng],
        [c.maxLat, c.maxLng],
      ],
      { padding: [24, 24], maxZoom: 16 },
    )
  }, [map, clave])

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
  const { etiqueta, categorias } = useCategorias()
  // Región que se muestra (código de 2 dígitos, o 'actual' = donde está quien mira) y filtros.
  const [regiones, setRegiones] = useState<Region[]>([])
  const [errorRegiones, setErrorRegiones] = useState('')
  const [seleccionRegion, setSeleccionRegion] = useState<string>(REGION_INICIAL)
  const [regionActual, setRegionActual] = useState<Region | null>(null)
  const [ubicando, setUbicando] = useState(false)
  const [mensajeUbicacion, setMensajeUbicacion] = useState('')
  const [filtroCategoria, setFiltroCategoria] = useState('todas')
  const [filtroEstado, setFiltroEstado] = useState('todos')
  // Fotos cargadas bajo demanda (al abrir un marcador), cacheadas por id de reporte.
  const [fotos, setFotos] = useState<Record<string, EstadoFoto>>({})
  // Conteo de confirmaciones, también bajo demanda (ver EstadoConteo arriba).
  const [confirmaciones, setConfirmaciones] = useState<Record<string, EstadoConteo>>({})
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

  // Las 16 regiones (catálogo y límites del propio portal).
  useEffect(() => {
    cargarRegiones()
      .then(setRegiones)
      .catch((err) => {
        console.error('Error al cargar las regiones:', err)
        setErrorRegiones('No pudimos cargar la lista de regiones.')
      })
  }, [])

  const region = useMemo<Region | null>(
    () =>
      seleccionRegion === 'actual'
        ? regionActual
        : (regiones.find((r) => r.codigo === seleccionRegion) ?? null),
    [seleccionRegion, regionActual, regiones],
  )

  // Leer /reports exige sesión iniciada. Solo la región elegida, no todo el país.
  const datos = useReportesRegion<Reporte>(region, !!user && !sesionCargando, mapearReporte)
  const reportes = datos.reportes
  const cargando = datos.cargando
  const error = datos.error || errorRegiones

  const visibles = useMemo(
    () =>
      reportes.filter(
        (r) =>
          (filtroCategoria === 'todas' || r.categoria === filtroCategoria) &&
          (filtroEstado === 'todos' || r.estado === filtroEstado),
      ),
    [reportes, filtroCategoria, filtroEstado],
  )

  /** «Mi región»: se pide la ubicación solo cuando se elige esa opción. */
  function cambiarRegion(valor: string) {
    setMensajeUbicacion('')
    if (valor !== 'actual' || regionActual) {
      setSeleccionRegion(valor)
      return
    }
    if (!navigator.geolocation) {
      setMensajeUbicacion('Tu navegador no permite obtener la ubicación. Elige una región en la lista.')
      return
    }
    setUbicando(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUbicando(false)
        const detectada = regionDePunto({ lat: pos.coords.latitude, lng: pos.coords.longitude }, regiones)
        if (detectada) {
          setRegionActual(detectada)
          setSeleccionRegion('actual')
        } else {
          setMensajeUbicacion('No pudimos saber en qué región estás (¿estás fuera de Chile?). Elige una región en la lista.')
        }
      },
      () => {
        setUbicando(false)
        setMensajeUbicacion('No pudimos obtener tu ubicación. Igual puedes elegir una región en la lista.')
      },
      { timeout: 10_000 },
    )
  }

  // Lo que el mapa debe mostrar completo: los reportes filtrados o, si no hay, la región entera.
  const caja = useMemo<CajaGeografica | null>(() => cajaDePuntos(visibles) ?? region?.caja ?? null, [visibles, region])
  const claveEncuadre = `${region?.codigo ?? ''}|${filtroCategoria}|${filtroEstado}|${cargando ? 'c' : 'l'}`

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
  // El reporte abierto se sigue viendo aunque un filtro lo oculte.
  const puntosDelMapa = seleccionado && !visibles.some((r) => r.id === seleccionado.id) ? [...visibles, seleccionado] : visibles

  function renderDetalle(reporte: Reporte) {
    const estadoFoto = fotos[reporte.id]
    const estadoConteo = confirmaciones[reporte.id]
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

          <VerificacionReporte
            reporte={reporte}
            onConfirmado={() =>
              // Actualización optimista del conteo ya cargado, sin volver a consultar.
              setConfirmaciones((prev) => {
                const actual = prev[reporte.id]
                if (!actual || actual.total === undefined) return prev
                return { ...prev, [reporte.id]: { ...actual, total: actual.total + 1 } }
              })
            }
          />

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
      {completo && (
        <div className={styles.filtros}>
          <label className={styles.filtro}>
            <span>Región</span>
            <select
              value={seleccionRegion}
              disabled={ubicando}
              onChange={(e) => cambiarRegion(e.target.value)}
            >
              <option value="actual">
                {ubicando ? 'Buscando tu ubicación…' : `Mi región${regionActual ? ' · ' + regionActual.nombreCorto : ''}`}
              </option>
              {regiones.map((r) => (
                <option key={r.codigo} value={r.codigo}>
                  {r.nombreCorto}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.filtro}>
            <span>Categoría</span>
            <select value={filtroCategoria} onChange={(e) => setFiltroCategoria(e.target.value)}>
              <option value="todas">Todas</option>
              {categorias.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                  {c.activa ? '' : ' (inactiva)'}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.filtro}>
            <span>Estado</span>
            <select value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)}>
              <option value="todos">Todos</option>
              {ESTADOS_EN_ORDEN.map((estado) => (
                <option key={estado} value={estado}>
                  {ETIQUETA_POR_ESTADO[estado]}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
      {mensajeUbicacion && <p className={styles.statusError}>{mensajeUbicacion}</p>}
      <div className={completo ? styles.mapaMarcoCompleto : styles.mapaMarco}>
        <MapContainer
          center={CENTRO_SANTIAGO}
          zoom={12}
          // A pantalla completa el mapa es lo único de la página: conviene
          // que el scroll del mouse haga zoom. Incrustado en la Landing se
          // desactiva para no secuestrar el scroll de la página.
          scrollWheelZoom={completo}
          maxZoom={ZOOM_MAXIMO}
          className={completo ? styles.mapCompleto : styles.map}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            maxZoom={ZOOM_MAXIMO}
          />
          <ExponerMapaParaPruebas />
          <ControlEncuadre caja={caja} clave={claveEncuadre} />
          <ControlSeleccion
            lat={seleccionado?.lat ?? null}
            lng={seleccionado?.lng ?? null}
            onTocarMapa={cerrarDetalle}
          />
          {/* Los reportes muy cercanos se agrupan en un círculo con el total (como en la app). */}
          <CapaAgrupada
            puntos={puntosDelMapa}
            seleccionadoId={seleccionadoId}
            titulo={(r) => `${etiqueta(r.categoria)} · ${ETIQUETA_POR_ESTADO[r.estado] ?? r.estado}`}
            onElegir={abrirDetalle}
            renderPunto={(reporte) => {
              const esSeleccionado = reporte.id === seleccionadoId
              const conteo = confirmaciones[reporte.id]
              return (
                <Marker
                  key={reporte.id}
                  position={[reporte.lat, reporte.lng]}
                  icon={
                    esSeleccionado
                      ? ICONOS_SELECCIONADOS_POR_ESTADO[reporte.estado] ?? ICONOS_SELECCIONADOS_POR_ESTADO.reportado
                      : ICONOS_POR_ESTADO[reporte.estado] ?? ICONO_ESTADO_DESCONOCIDO
                  }
                  zIndexOffset={esSeleccionado ? 1000 : 0}
                  eventHandlers={{
                    // Permite a las pruebas de pantalla (Playwright) ubicar el pin de cada reporte.
                    add: (e) => e.target.getElement()?.setAttribute('data-reporte-id', reporte.id),
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
            }}
          />
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
      {user && cargando && <p className={styles.status}>Cargando las incidencias de {region?.nombreCorto}…</p>}
      {user && !cargando && !error && region && visibles.length === 0 && (
        <p className={styles.status}>No hay incidencias en {region.nombreCorto} con estos filtros.</p>
      )}
      {user && !cargando && !error && visibles.length > 0 && (
        <p className={styles.status}>
          {visibles.length.toLocaleString('es-CL')} {visibles.length === 1 ? 'incidencia' : 'incidencias'} en{' '}
          {region?.nombreCorto}, cada una en su ubicación. Las que están en el mismo lugar se juntan en un círculo con
          el total: tócalo para acercarte.
          {datos.hayMas && ` Se muestran las ${MAXIMO_POR_REGION} más recientes.`}
        </p>
      )}
      {error && <p className={styles.statusError}>{error}</p>}

      {user && visibles.length > 0 && (
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
