import { useEffect, useMemo, useRef, useState } from 'react'
import L from 'leaflet'
import type { Layer, PathOptions } from 'leaflet'
import { GeoJSON, MapContainer, TileLayer, useMap } from 'react-leaflet'
import type { Feature, FeatureCollection, Geometry } from 'geojson'
import { Link, Navigate } from 'react-router-dom'
import 'leaflet/dist/leaflet.css'
import '../../components/Map/leafletTema.css'
import { useRequiereAdmin } from '../../hooks/useRequiereAdmin'
import { useCategorias } from '../../context/CategoriasContext'
import { FILTROS_VACIOS } from '../../components/Reportes/filtros'
import { descargarTodosLosReportes } from '../../components/Reportes/useReportesPaginados'
import { cargarHistorial } from '../../components/Reportes/historial'
import { calcularTiempos, formatearDuracion, mediana, promedio } from '../../components/Reportes/tiempos'
import type { Reporte } from '../../components/Reportes/reporte'
import { fechaInput } from '../../components/Reportes/rangosRapidos'
import {
  agruparPorComuna,
  colorDeTramo,
  rangosDeTramos,
  tramoDeIntensidad,
} from './mapaCalor'
import type { ComunaCatalogo, EstadisticaComuna } from './mapaCalor'
import styles from './AdminMapaCalor.module.css'

/** Periodo que cubre el mapa. Con 90 basta cambiar este número (las lecturas crecen en proporción). */
const DIAS_PERIODO = 30
/** Reportes de una comuna cuyo historial se lee para calcular tiempos (tope de lecturas por clic). */
const MAXIMO_PARA_TIEMPOS = 150
const SIN_REPORTES: Reporte[] = [] // referencia estable para el efecto de tiempos
const REGION_INICIAL = '13' // Región Metropolitana
// De norte a sur, para el selector.
const ORDEN_REGIONES = ['15', '01', '02', '03', '04', '05', '13', '06', '07', '16', '08', '09', '14', '10', '11', '12']

type PropiedadesComuna = { CUT_COM?: string; Comuna?: string }
type ComunasGeo = FeatureCollection<Geometry, PropiedadesComuna>

const cacheRegiones = new Map<string, Promise<ComunasGeo>>()
function cargarRegion(codigo: string): Promise<ComunasGeo> {
  let carga = cacheRegiones.get(codigo)
  if (!carga) {
    carga = fetch(`/geo/region-${codigo}.geojson`).then((r) => {
      if (!r.ok) throw new Error(`No se encontró el límite de la región ${codigo}.`)
      return r.json() as Promise<ComunasGeo>
    })
    carga.catch(() => cacheRegiones.delete(codigo))
    cacheRegiones.set(codigo, carga)
  }
  return carga
}

/** Encuadra el mapa en la región apenas se dibuja o cambia. */
function Encuadrar({ datos }: { datos: ComunasGeo }) {
  const mapa = useMap()
  useEffect(() => {
    const limites = L.geoJSON(datos).getBounds()
    mapa.invalidateSize()
    if (limites.isValid()) mapa.fitBounds(limites, { padding: [8, 8], animate: false })
  }, [datos, mapa])
  return null
}

interface TiemposComuna {
  primeraAtencion: { mediana: number | null; promedio: number | null; n: number }
  resolucion: { mediana: number | null; promedio: number | null; n: number }
  revisados: number
  truncado: boolean
}

/** Lee el historial de los reportes de la comuna elegida (solo al hacer clic) y calcula sus tiempos. */
function useTiemposComuna(reportes: Reporte[] | null) {
  const [tiempos, setTiempos] = useState<TiemposComuna | null>(null)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState(false)

  useEffect(() => {
    setTiempos(null)
    setError(false)
    if (!reportes || reportes.length === 0) {
      setCargando(false)
      return
    }
    let vigente = true
    setCargando(true)
    const muestra = reportes.slice(0, MAXIMO_PARA_TIEMPOS)
    const primeras: number[] = []
    const resoluciones: number[] = []
    const siguiente = { i: 0 }

    // Pocas lecturas a la vez, para no saturar la conexión.
    async function trabajador() {
      while (vigente && siguiente.i < muestra.length) {
        const reporte = muestra[siguiente.i++]
        const t = calcularTiempos(reporte, await cargarHistorial(reporte.id))
        if (t.primeraAtencionMs !== null) primeras.push(t.primeraAtencionMs)
        if (t.resolucionMs !== null) resoluciones.push(t.resolucionMs)
      }
    }
    Promise.all([trabajador(), trabajador(), trabajador(), trabajador()])
      .then(() => {
        if (!vigente) return
        setTiempos({
          primeraAtencion: { mediana: mediana(primeras), promedio: promedio(primeras), n: primeras.length },
          resolucion: { mediana: mediana(resoluciones), promedio: promedio(resoluciones), n: resoluciones.length },
          revisados: muestra.length,
          truncado: reportes.length > muestra.length,
        })
      })
      .catch((err) => {
        console.error('Error al calcular los tiempos de la comuna:', err)
        if (vigente) setError(true)
      })
      .finally(() => vigente && setCargando(false))
    return () => {
      vigente = false
    }
  }, [reportes])

  return { tiempos, cargando, error }
}

function Tiempo({ titulo, dato }: { titulo: string; dato: TiemposComuna['primeraAtencion'] }) {
  return (
    <div className={styles.tiempo}>
      <span className={styles.tiempoTitulo}>{titulo}</span>
      {dato.mediana === null ? (
        <span className={styles.tiempoValor}>Sin datos</span>
      ) : (
        <>
          <span className={styles.tiempoValor}>{formatearDuracion(dato.mediana)}</span>
          <span className={styles.tiempoNota}>
            mediana · promedio {formatearDuracion(dato.promedio ?? dato.mediana)} · {dato.n}{' '}
            {dato.n === 1 ? 'reporte' : 'reportes'}
          </span>
        </>
      )}
    </div>
  )
}

export default function AdminMapaCalor() {
  const { cargando, autorizado } = useRequiereAdmin()
  const { etiqueta } = useCategorias()

  const [catalogo, setCatalogo] = useState<ComunaCatalogo[]>([])
  const [region, setRegion] = useState(REGION_INICIAL)
  // Los límites van con la región a la que pertenecen: así nunca se dibujan los de otra región.
  const [geo, setGeo] = useState<{ region: string; datos: ComunasGeo } | null>(null)
  const [errorGeo, setErrorGeo] = useState('')
  const [reportes, setReportes] = useState<Reporte[] | null>(null)
  const [truncado, setTruncado] = useState(false)
  const [errorDatos, setErrorDatos] = useState('')
  const [seleccion, setSeleccion] = useState<string | null>(null)
  const panelRef = useRef<HTMLElement>(null)

  // Catálogo de comunas (nombres y regiones), una vez.
  useEffect(() => {
    if (!autorizado) return
    fetch('/data/comunas-chile.json')
      .then((r) => r.json())
      .then((d: { comunas: ComunaCatalogo[] }) => setCatalogo(d.comunas))
      .catch((err) => console.error('No se pudo leer el catálogo de comunas:', err))
  }, [autorizado])

  // Reportes de los últimos DIAS_PERIODO días, de todo el país (una descarga; la región solo cambia lo que se dibuja).
  useEffect(() => {
    if (!autorizado) return
    let vigente = true
    const desde = new Date()
    desde.setDate(desde.getDate() - DIAS_PERIODO)
    descargarTodosLosReportes({ ...FILTROS_VACIOS, desde: fechaInput(desde) }, undefined)
      .then((r) => {
        if (!vigente) return
        setReportes(r.reportes)
        setTruncado(r.truncado)
      })
      .catch((err) => {
        console.error('Error al descargar los reportes del mapa de calor:', err)
        if (vigente) setErrorDatos('No pudimos cargar los reportes. Inténtalo nuevamente.')
      })
    return () => {
      vigente = false
    }
  }, [autorizado])

  // Límites de la región elegida.
  useEffect(() => {
    if (!autorizado) return
    let vigente = true
    setErrorGeo('')
    setSeleccion(null)
    cargarRegion(region)
      .then((d) => vigente && setGeo({ region, datos: d }))
      .catch((err) => {
        console.error('Error al cargar los límites comunales:', err)
        if (vigente) setErrorGeo('No pudimos cargar los límites de esta región.')
      })
    return () => {
      vigente = false
    }
  }, [autorizado, region])

  const datosGeo = geo && geo.region === region ? geo.datos : null

  const regiones = useMemo(() => {
    const vistas = new Map<string, string>()
    for (const c of catalogo) if (!vistas.has(c.codigoRegion)) vistas.set(c.codigoRegion, c.region)
    return ORDEN_REGIONES.filter((c) => vistas.has(c)).map((c) => ({ codigo: c, nombre: vistas.get(c) as string }))
  }, [catalogo])

  const { porComuna, sinComuna } = useMemo(
    () => agruparPorComuna(reportes ?? [], catalogo),
    [reportes, catalogo],
  )

  const nombreDe = useMemo(() => new Map(catalogo.map((c) => [c.codigo, c.nombre])), [catalogo])

  // Comunas de la región dibujada, con su valor (sin resolver) y el máximo para la escala.
  const filas = useMemo(() => {
    const codigos = (datosGeo?.features ?? [])
      .map((f) => f.properties?.CUT_COM)
      .filter((c): c is string => !!c)
    return codigos
      .map((codigo) => ({
        codigo,
        nombre: nombreDe.get(codigo) ?? codigo,
        estadistica: porComuna.get(codigo) ?? null,
      }))
      .sort(
        (a, b) =>
          (b.estadistica?.sinResolver ?? 0) - (a.estadistica?.sinResolver ?? 0) ||
          a.nombre.localeCompare(b.nombre, 'es'),
      )
  }, [datosGeo, porComuna, nombreDe])

  const maximo = Math.max(0, ...filas.map((f) => f.estadistica?.sinResolver ?? 0))
  const totalRegion = filas.reduce((s, f) => s + (f.estadistica?.total ?? 0), 0)
  const sinResolverRegion = filas.reduce((s, f) => s + (f.estadistica?.sinResolver ?? 0), 0)

  const seleccionada: EstadisticaComuna | null = seleccion
    ? (porComuna.get(seleccion) ?? {
        codigo: seleccion,
        total: 0,
        sinResolver: 0,
        resueltos: 0,
        cerrados: 0,
        porCategoria: {},
        reportes: SIN_REPORTES,
      })
    : null
  const { tiempos, cargando: calculando, error: errorTiempos } = useTiemposComuna(
    seleccionada ? seleccionada.reportes : null,
  )

  // En el teléfono el panel queda bajo el mapa: al elegir una comuna se lleva a la vista.
  useEffect(() => {
    if (seleccion && window.matchMedia('(max-width: 899px)').matches) {
      panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [seleccion])

  if (!cargando && !autorizado) {
    return <Navigate to="/" replace />
  }

  function estilo(feature?: Feature<Geometry, PropiedadesComuna>): PathOptions {
    const codigo = feature?.properties?.CUT_COM ?? ''
    const valor = porComuna.get(codigo)?.sinResolver ?? 0
    const { relleno, borde } = colorDeTramo(tramoDeIntensidad(valor, maximo))
    const elegida = codigo === seleccion
    return {
      fillColor: relleno,
      fillOpacity: 1,
      color: elegida ? '#f8fafc' : borde,
      weight: elegida ? 3 : 1,
    }
  }

  function alCadaComuna(feature: Feature<Geometry, PropiedadesComuna>, capa: Layer) {
    const codigo = feature.properties?.CUT_COM ?? ''
    const nombre = nombreDe.get(codigo) ?? feature.properties?.Comuna ?? codigo
    const e = porComuna.get(codigo)
    capa.bindTooltip(`${nombre}: ${e?.sinResolver ?? 0} sin resolver`, { sticky: true })
    capa.on('click', () => setSeleccion(codigo))
  }

  const desdePeriodo = fechaInput(new Date(Date.now() - DIAS_PERIODO * 86_400_000))
  const rangos = rangosDeTramos(maximo)
  const categorias = seleccionada
    ? Object.entries(seleccionada.porCategoria).sort((a, b) => b[1] - a[1])
    : []
  const maxCategoria = categorias[0]?.[1] ?? 0

  return (
    <main className={styles.main}>
      <header className={styles.encabezado}>
        <div>
          <h1 className={styles.titulo}>Mapa de calor</h1>
          <p className={styles.subtitulo}>
            Reportes sin resolver por comuna en los últimos {DIAS_PERIODO} días. Haz clic en una comuna para
            ver su detalle.
          </p>
        </div>
        <label className={styles.selector}>
          <span>Región</span>
          <select value={region} onChange={(e) => setRegion(e.target.value)}>
            {regiones.map((r) => (
              <option key={r.codigo} value={r.codigo}>
                {r.nombre}
              </option>
            ))}
          </select>
        </label>
      </header>

      {errorDatos && (
        <p className={styles.error} role="alert">
          {errorDatos}
        </p>
      )}
      {truncado && (
        <p className={styles.aviso}>El periodo tiene demasiados reportes: los datos pueden estar incompletos.</p>
      )}

      <div className={styles.resumen}>
        <span>
          <strong>{reportes === null ? '…' : totalRegion.toLocaleString('es-CL')}</strong> reportes en la región
        </span>
        <span>
          <strong>{reportes === null ? '…' : sinResolverRegion.toLocaleString('es-CL')}</strong> sin resolver
        </span>
        {sinComuna > 0 && (
          <span className={styles.resumenNota}>
            {sinComuna.toLocaleString('es-CL')} reportes del país sin comuna asignada no se ubican en el mapa
          </span>
        )}
      </div>

      <div className={styles.cuerpo}>
        <section className={styles.mapaBloque} aria-label="Mapa de reportes sin resolver por comuna">
          <div className={styles.mapa}>
            {errorGeo && <p className={styles.error}>{errorGeo}</p>}
            {!datosGeo && !errorGeo && <p className={styles.cargando}>Cargando mapa…</p>}
            {datosGeo && (
              <MapContainer center={[-33.45, -70.66]} zoom={9} zoomSnap={0.25} className={styles.leaflet} scrollWheelZoom>
                <TileLayer
                  attribution="&copy; OpenStreetMap"
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <Encuadrar datos={datosGeo} />
                <GeoJSON
                  key={`${region}-${seleccion}-${reportes?.length ?? 'x'}-${catalogo.length}`}
                  data={datosGeo}
                  style={estilo}
                  onEachFeature={alCadaComuna}
                />
              </MapContainer>
            )}
          </div>
          <div className={styles.leyenda} aria-label="Leyenda">
            <span className={styles.leyendaTitulo}>Sin resolver</span>
            <span className={styles.leyendaItem}>
              <i style={{ background: colorDeTramo(0).relleno, borderColor: colorDeTramo(0).borde }} /> 0
            </span>
            {maximo > 0 &&
              rangos.map(([desde, hasta], i) => (
                <span key={i} className={styles.leyendaItem}>
                  <i style={{ background: colorDeTramo(i + 1).relleno, borderColor: colorDeTramo(i + 1).borde }} />
                  {desde === hasta ? desde : `${desde}–${hasta}`}
                </span>
              ))}
          </div>
        </section>

        <aside className={styles.lateral}>
          <section ref={panelRef} className={styles.panel} aria-label="Detalle de la comuna">
            {!seleccionada ? (
              <p className={styles.panelVacio}>Elige una comuna en el mapa o en la lista para ver sus estadísticas.</p>
            ) : (
              <>
                <div className={styles.panelCabecera}>
                  <h2>{nombreDe.get(seleccionada.codigo) ?? seleccionada.codigo}</h2>
                  <button type="button" className={styles.cerrar} onClick={() => setSeleccion(null)} aria-label="Cerrar detalle">
                    ✕
                  </button>
                </div>

                <div className={styles.numeros}>
                  <div>
                    <strong className={styles.numeroAlerta}>{seleccionada.sinResolver}</strong>
                    <span>sin resolver</span>
                  </div>
                  <div>
                    <strong>{seleccionada.resueltos}</strong>
                    <span>resueltos</span>
                  </div>
                  <div>
                    <strong>{seleccionada.cerrados}</strong>
                    <span>cerrados</span>
                  </div>
                </div>

                <Link
                  to={`/admin/reportes?comuna=${encodeURIComponent(nombreDe.get(seleccionada.codigo) ?? '')}&desde=${desdePeriodo}`}
                  className={styles.verReportes}
                >
                  Ver reportes de esta comuna →
                </Link>

                <h3 className={styles.subtituloPanel}>Tiempos de respuesta</h3>
                {seleccionada.total === 0 && <p className={styles.nota}>Sin reportes en el periodo.</p>}
                {calculando && <p className={styles.nota}>Calculando tiempos…</p>}
                {errorTiempos && <p className={styles.nota}>No pudimos calcular los tiempos.</p>}
                {tiempos && (
                  <>
                    <Tiempo titulo="Primera atención" dato={tiempos.primeraAtencion} />
                    <Tiempo titulo="Resolución" dato={tiempos.resolucion} />
                    {tiempos.truncado && (
                      <p className={styles.nota}>
                        Calculado sobre los {tiempos.revisados} reportes más recientes de la comuna.
                      </p>
                    )}
                  </>
                )}

                <h3 className={styles.subtituloPanel}>Reportes por categoría</h3>
                {categorias.length === 0 ? (
                  <p className={styles.nota}>Sin reportes en el periodo.</p>
                ) : (
                  <ul className={styles.categorias}>
                    {categorias.map(([categoria, cantidad]) => (
                      <li key={categoria}>
                        <span className={styles.categoriaNombre}>{etiqueta(categoria)}</span>
                        <span className={styles.categoriaBarra}>
                          <span style={{ width: `${(cantidad / maxCategoria) * 100}%` }} />
                        </span>
                        <span className={styles.categoriaValor}>{cantidad}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </section>

          <section className={styles.ranking} aria-label="Comunas con más reportes sin resolver">
            <h2 className={styles.subtituloPanel}>Más reportes sin resolver</h2>
            {reportes === null ? (
              <p className={styles.nota}>Cargando…</p>
            ) : (
              <ol className={styles.listaRanking}>
                {filas.slice(0, 10).map((f) => (
                  <li key={f.codigo}>
                    <button
                      type="button"
                      className={`${styles.filaRanking} ${f.codigo === seleccion ? styles.filaActiva : ''}`}
                      onClick={() => setSeleccion(f.codigo)}
                    >
                      <span>{f.nombre}</span>
                      <strong>{f.estadistica?.sinResolver ?? 0}</strong>
                    </button>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </aside>
      </div>
    </main>
  )
}
