import { useEffect, useRef, useState } from 'react'
import { comprimirImagen } from '../../privacidad/comprimir'
import type { FotoProtegida } from '../../privacidad/privacidad'
import type { ClipboardEvent, FormEvent, KeyboardEvent } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet'
import { useAuth } from '../../context/AuthContext'
import { useCategorias } from '../../context/CategoriasContext'
import { useRequiereAdmin } from '../../hooks/useRequiereAdmin'
import { ICONOS_SELECCIONADOS_POR_ESTADO } from '../../components/Map/estadoIconos'
import { calcularAsignacion } from '../../components/Reportes/asignacion'
import type { Asignacion, Punto } from '../../components/Reportes/asignacion'
import {
  crearReporteAdmin,
  DESCRIPCION_MAX,
  DESCRIPCION_MIN,
} from '../../components/Reportes/crearReporte'
import styles from './Admin.module.css'

const CENTRO_SANTIAGO: [number, number] = [-33.4372, -70.6506]
const ICONO_PUNTO = ICONOS_SELECCIONADOS_POR_ESTADO.reportado

/** Clic en el mapa: ubica (o mueve) el punto del reporte. */
function SelectorPunto({ onElegir }: { onElegir: (punto: Punto) => void }) {
  useMapEvents({
    click: (e) => onElegir({ lat: e.latlng.lat, lng: e.latlng.lng }),
  })
  return null
}

/** Pausa al escribir antes de marcar: así el pin no salta con cada tecla. */
const ESPERA_COORDENADAS_MS = 600

/** Lleva el mapa al punto escrito en los campos de coordenadas. */
function CentrarEn({ destino }: { destino: { punto: Punto; vez: number } | null }) {
  const mapa = useMap()
  useEffect(() => {
    if (destino) {
      mapa.flyTo([destino.punto.lat, destino.punto.lng], Math.max(mapa.getZoom(), 16), {
        duration: 0.6,
      })
    }
  }, [destino, mapa])
  return null
}

/** Número decimal con punto o coma ("-33,4372" también vale). */
function leerNumero(texto: string): number | null {
  const limpio = texto.trim().replace(',', '.')
  if (!/^-?\d+(\.\d+)?$/.test(limpio)) return null
  return Number(limpio)
}

/**
 * Coordenadas copiadas en un solo campo, como las entrega Google Maps:
 * "-33.4372, -70.6506". Devuelve null si el texto no tiene esa forma.
 */
function leerPar(texto: string): Punto | null {
  const limpio = texto.trim()
  // Con punto decimal, la coma solo puede separar el par. Sin él, la coma
  // puede ser decimal ("-33,5107"): el par se separa con espacio o ";".
  const partes = limpio.includes('.')
    ? limpio.split(/\s*[,;]\s*|\s+/)
    : limpio.split(/\s*;\s*|,\s+|\s+/)
  if (partes.length !== 2) return null
  const lat = leerNumero(partes[0])
  const lng = leerNumero(partes[1])
  return lat !== null && lng !== null ? { lat, lng } : null
}

export default function AdminCrearReporte() {
  const { cargando, autorizado } = useRequiereAdmin()
  const { user } = useAuth()
  const { categorias } = useCategorias()
  const activas = categorias.filter((c) => c.activa)

  const [punto, setPunto] = useState<Punto | null>(null)
  const [latTexto, setLatTexto] = useState('')
  const [lngTexto, setLngTexto] = useState('')
  const [avisoCoordenadas, setAvisoCoordenadas] = useState('')
  // Cada punto escrito a mano centra el mapa, aunque sea el mismo de antes.
  const [destino, setDestino] = useState<{ punto: Punto; vez: number } | null>(null)
  // Texto que puso el mapa en los campos (clic o arrastre): ese texto no
  // debe volver a interpretarse ni mover el mapa.
  const textoDesdeMapa = useRef<{ lat: string; lng: string } | null>(null)
  const [categoria, setCategoria] = useState('')
  const [descripcion, setDescripcion] = useState('')

  const [asignacion, setAsignacion] = useState<Asignacion | null>(null)
  const [calculando, setCalculando] = useState(false)
  const [errorAsignacion, setErrorAsignacion] = useState('')

  // Foto: se difumina apenas se elige, y la vista previa ya es la versión
  // protegida, que es la única que se publica.
  const [foto, setFoto] = useState<FotoProtegida | null>(null)
  const [procesandoFoto, setProcesandoFoto] = useState(false)
  const [errorFoto, setErrorFoto] = useState('')
  const [arrastrando, setArrastrando] = useState(false)
  const entradaFoto = useRef<HTMLInputElement>(null)

  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const [creadoId, setCreadoId] = useState<string | null>(null)

  // La asignación depende del punto y, cuando no hay municipalidad activa,
  // también de la categoría (organismo genérico). Se recalcula al cambiar
  // cualquiera de los dos; una respuesta vieja no pisa a una más nueva.
  useEffect(() => {
    if (!punto) {
      setAsignacion(null)
      return
    }
    let vigente = true
    setCalculando(true)
    setErrorAsignacion('')
    calcularAsignacion(punto, categoria || 'otro')
      .then((resultado) => {
        if (vigente) setAsignacion(resultado)
      })
      .catch((err) => {
        console.error('Error al calcular la asignación:', err)
        if (vigente) {
          setAsignacion(null)
          setErrorAsignacion('No pudimos calcular el organismo de este punto. Inténtalo nuevamente.')
        }
      })
      .finally(() => {
        if (vigente) setCalculando(false)
      })
    return () => {
      vigente = false
    }
  }, [punto, categoria])

  // Coordenadas escritas a mano: cuando se deja de escribir y ambas son
  // válidas, el punto se marca solo y el mapa va hacia él.
  useEffect(() => {
    const delMapa = textoDesdeMapa.current
    if (delMapa && delMapa.lat === latTexto && delMapa.lng === lngTexto) {
      return
    }
    if (!latTexto.trim() || !lngTexto.trim()) {
      setAvisoCoordenadas('')
      return
    }
    const espera = setTimeout(() => {
      const lat = leerNumero(latTexto)
      const lng = leerNumero(lngTexto)
      if (lat === null || lng === null) {
        setAvisoCoordenadas(
          'Escribe la latitud y la longitud como números decimales, p. ej. -33.4372 y -70.6506.',
        )
        return
      }
      if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
        setAvisoCoordenadas('La latitud va de -90 a 90 y la longitud de -180 a 180.')
        return
      }
      // En Chile ambas son negativas: un signo olvidado lleva el punto a otro continente.
      setAvisoCoordenadas(
        lat > 0 || lng > 0 ? 'Ojo: en Chile la latitud y la longitud son negativas.' : '',
      )
      const nuevo = { lat, lng }
      setPunto((actual) =>
        actual && actual.lat === lat && actual.lng === lng ? actual : nuevo,
      )
      setDestino((previo) => ({ punto: nuevo, vez: (previo?.vez ?? 0) + 1 }))
      setCreadoId(null)
    }, ESPERA_COORDENADAS_MS)
    return () => clearTimeout(espera)
  }, [latTexto, lngTexto])

  if (!cargando && !autorizado) {
    return <Navigate to="/" replace />
  }

  /** Punto elegido en el mapa (clic o arrastre): los campos lo reflejan. */
  function elegirPunto(nuevo: Punto) {
    const lat = nuevo.lat.toFixed(6)
    const lng = nuevo.lng.toFixed(6)
    textoDesdeMapa.current = { lat, lng }
    setPunto(nuevo)
    setLatTexto(lat)
    setLngTexto(lng)
    setAvisoCoordenadas('')
    setCreadoId(null)
  }

  /**
   * Pegar el par completo copiado de Google Maps ("-33.4372, -70.6506") en
   * cualquiera de los dos campos lo reparte entre ambos. Solo al pegar: al
   * escribirlo a mano, "-33.4372, -7" ya parecería un par antes de terminar.
   */
  function pegarCoordenadas(e: ClipboardEvent<HTMLInputElement>) {
    const par = leerPar(e.clipboardData.getData('text'))
    if (par) {
      e.preventDefault()
      setLatTexto(String(par.lat))
      setLngTexto(String(par.lng))
    }
  }

  // Enter en un campo de coordenadas no envía el reporte a medio llenar.
  function bloquearEnter(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') e.preventDefault()
  }

  async function elegirFoto(archivo: File | undefined) {
    if (!archivo) return
    setErrorFoto('')
    setFoto(null)
    setProcesandoFoto(true)
    try {
      const comprimida = await comprimirImagen(archivo)
      // Los modelos (~19 MB) solo se descargan la primera vez que se elige una foto.
      const { anonimizar } = await import('../../privacidad/privacidad')
      setFoto(await anonimizar(comprimida))
    } catch (err) {
      setErrorFoto(err instanceof Error ? err.message : 'No se pudo procesar la foto.')
    } finally {
      setProcesandoFoto(false)
      if (entradaFoto.current) entradaFoto.current.value = ''
    }
  }

  async function crear(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')
    setCreadoId(null)

    if (!user) return
    if (!punto) {
      setError('Haz clic en el mapa para ubicar el reporte.')
      return
    }
    if (!categoria) {
      setError('Elige una categoría.')
      return
    }
    const largo = descripcion.trim().length
    if (largo < DESCRIPCION_MIN || largo > DESCRIPCION_MAX) {
      setError(`La descripción debe tener entre ${DESCRIPCION_MIN} y ${DESCRIPCION_MAX} caracteres.`)
      return
    }

    if (procesandoFoto) {
      setError('Espera a que termine de procesarse la fotografía.')
      return
    }

    setGuardando(true)
    try {
      const id = await crearReporteAdmin({ uid: user.uid, punto, categoria, descripcion, foto })
      setCreadoId(id)
      setPunto(null)
      setLatTexto('')
      setLngTexto('')
      setCategoria('')
      setDescripcion('')
      setFoto(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear el reporte.')
    } finally {
      setGuardando(false)
    }
  }

  const largoDescripcion = descripcion.trim().length

  return (
      <main className={`${styles.main} ${styles.mainAncho}`}>
        <div>
          <Link to="/admin/reportes" className={styles.volver}>
            ← Volver a Administrar reportes
          </Link>
          <h1 className={styles.title}>Crear reporte</h1>
          <p className={styles.subtitle}>
            Registra una incidencia en cualquier punto del mapa. Se asigna a su organismo y operador
            igual que un reporte hecho desde la app.
          </p>
        </div>

        <section className={styles.card}>
          {/* Escritorio: mapa a la izquierda y datos a la derecha. Con menos
              ancho (tablet, teléfono), todo en una columna. */}
          <form className={`${styles.form} ${styles.crearGrid}`} onSubmit={crear} noValidate>
            <div className={styles.crearColumna}>
              <div className={styles.field}>
                <span className={styles.label}>Ubicación</span>
                <p className={styles.hintCampo}>
                  Haz clic en el mapa para marcar el punto (puedes arrastrar el pin para ajustarlo), o
                  escribe sus coordenadas y el pin se ubicará solo.
                </p>
                <div className={styles.coordenadas}>
                  <div className={styles.field}>
                    <label htmlFor="crear-reporte-lat" className={styles.labelChico}>
                      Latitud
                    </label>
                    <input
                      id="crear-reporte-lat"
                      className={styles.input}
                      inputMode="decimal"
                      autoComplete="off"
                      placeholder="-33.437200"
                      value={latTexto}
                      onChange={(e) => setLatTexto(e.target.value)}
                      onPaste={pegarCoordenadas}
                      onKeyDown={bloquearEnter}
                    />
                  </div>
                  <div className={styles.field}>
                    <label htmlFor="crear-reporte-lng" className={styles.labelChico}>
                      Longitud
                    </label>
                    <input
                      id="crear-reporte-lng"
                      className={styles.input}
                      inputMode="decimal"
                      autoComplete="off"
                      placeholder="-70.650600"
                      value={lngTexto}
                      onChange={(e) => setLngTexto(e.target.value)}
                      onPaste={pegarCoordenadas}
                      onKeyDown={bloquearEnter}
                    />
                  </div>
                </div>
                {avisoCoordenadas && <p className={styles.errorCampo}>{avisoCoordenadas}</p>}
                <MapContainer
                  center={CENTRO_SANTIAGO}
                  zoom={12}
                  className={styles.mapaCrear}
                >
                  <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  />
                  <SelectorPunto onElegir={elegirPunto} />
                  <CentrarEn destino={destino} />
                  {punto && (
                    <Marker
                      position={[punto.lat, punto.lng]}
                      icon={ICONO_PUNTO}
                      draggable
                      eventHandlers={{
                        dragend: (ev) => {
                          const { lat, lng } = ev.target.getLatLng()
                          elegirPunto({ lat, lng })
                        },
                      }}
                    />
                  )}
                </MapContainer>
              </div>

              <div className={styles.asignacion} aria-live="polite">
                {!punto ? (
                  <p className={styles.asignacionVacia}>Todavía no has marcado un punto.</p>
                ) : (
                  <dl className={styles.asignacionDatos}>
                    {calculando ? (
                      <>
                        <dt>Asignación</dt>
                        <dd className={styles.asignacionPendiente}>Calculando comuna y organismo…</dd>
                      </>
                    ) : errorAsignacion || !asignacion ? (
                      <>
                        <dt>Asignación</dt>
                        <dd className={styles.asignacionError}>{errorAsignacion || 'Sin calcular.'}</dd>
                      </>
                    ) : (
                      <>
                        <dt>Comuna</dt>
                        <dd>
                          {asignacion.comuna.comuna ?? 'No identificada'}
                          {asignacion.comuna.region && (
                            <span className={styles.subtextoCelda}>{asignacion.comuna.region}</span>
                          )}
                        </dd>
                        <dt>Organismo</dt>
                        <dd>
                          {asignacion.organismo.nombre}
                          {asignacion.esGenerico && (
                            <span className={styles.subtextoCelda}>
                              {asignacion.comuna.comuna
                                ? 'La municipalidad de esta comuna no está activa: se usa el organismo genérico de la categoría.'
                                : 'Punto fuera de las comunas conocidas: se usa el organismo genérico de la categoría.'}
                              {!categoria && ' Cambiará al elegir la categoría.'}
                            </span>
                          )}
                        </dd>
                        <dt>Operador</dt>
                        <dd>
                          {asignacion.operadorId ? (
                            <>
                              {asignacion.operadorNombre ?? asignacion.operadorId}
                              <span className={styles.subtextoCelda}>{asignacion.operadorId}</span>
                            </>
                          ) : (
                            <span className={styles.subtextoCelda}>
                              Sin operador asignado. Podrás vincularlo después desde Administrar
                              reportes.
                            </span>
                          )}
                        </dd>
                      </>
                    )}
                  </dl>
                )}
              </div>
            </div>

            <div className={styles.crearColumna}>
              <div className={styles.field}>
                <label htmlFor="crear-reporte-categoria" className={styles.label}>
                  Categoría
                </label>
                <select
                  id="crear-reporte-categoria"
                  className={styles.input}
                  value={categoria}
                  onChange={(e) => setCategoria(e.target.value)}
                >
                  <option value="">Elige una categoría</option>
                  {activas.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}
                    </option>
                  ))}
                </select>
              </div>

              <div className={styles.field}>
                <label htmlFor="crear-reporte-descripcion" className={styles.label}>
                  Descripción
                </label>
                <textarea
                  id="crear-reporte-descripcion"
                  className={styles.textarea}
                  rows={4}
                  maxLength={DESCRIPCION_MAX}
                  value={descripcion}
                  onChange={(e) => setDescripcion(e.target.value)}
                  placeholder="Describe qué ocurre y dónde, con detalles que ayuden a ubicarlo."
                />
                <span className={styles.contador}>
                  {largoDescripcion}/{DESCRIPCION_MAX}
                  {largoDescripcion > 0 && largoDescripcion < DESCRIPCION_MIN &&
                    ` · mínimo ${DESCRIPCION_MIN} caracteres`}
                </span>
              </div>

              <div className={styles.field}>
                <span className={styles.label}>Fotografía</span>
                <p className={styles.hintCampo}>
                  Antes de publicarla se difuminan los rostros y las personas que aparezcan; la vista
                  previa es la imagen que se guardará.
                </p>
                <input
                  ref={entradaFoto}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  hidden
                  onChange={(e) => void elegirFoto(e.target.files?.[0])}
                />
                <div
                  className={`${styles.zonaFoto} ${arrastrando ? styles.zonaFotoActiva : ''}`}
                  role="button"
                  tabIndex={0}
                  aria-disabled={procesandoFoto}
                  aria-label="Adjuntar fotografía: arrastra una imagen o haz clic para elegirla"
                  onClick={() => !procesandoFoto && entradaFoto.current?.click()}
                  onKeyDown={(e) => {
                    if ((e.key === 'Enter' || e.key === ' ') && !procesandoFoto) {
                      e.preventDefault()
                      entradaFoto.current?.click()
                    }
                  }}
                  onDragOver={(e) => {
                    e.preventDefault()
                    setArrastrando(true)
                  }}
                  onDragLeave={() => setArrastrando(false)}
                  onDrop={(e) => {
                    e.preventDefault()
                    setArrastrando(false)
                    if (!procesandoFoto) void elegirFoto(e.dataTransfer.files?.[0])
                  }}
                >
                  {procesandoFoto ? (
                    <span className={styles.zonaFotoTexto} aria-live="polite">
                      Protegiendo la imagen… la primera vez puede tardar unos segundos.
                    </span>
                  ) : foto ? (
                    <>
                      <img
                        src={foto.dataUrl}
                        alt="Vista previa de la fotografía con rostros difuminados"
                        className={styles.zonaFotoImagen}
                      />
                      <span className={styles.zonaFotoTexto}>
                        Difuminado aplicado: {foto.privacidad.rostros} rostro(s) y{' '}
                        {foto.privacidad.personas} persona(s) lejana(s). Arrastra otra imagen o haz
                        clic para cambiarla.
                      </span>
                    </>
                  ) : (
                    <>
                      <span className={styles.zonaFotoTitulo}>Arrastra una imagen aquí</span>
                      <span className={styles.zonaFotoTexto}>o haz clic para adjuntarla (JPG, PNG o WebP)</span>
                    </>
                  )}
                </div>
                {foto && !procesandoFoto && (
                  <button type="button" className={styles.quitarFoto} onClick={() => setFoto(null)}>
                    Quitar fotografía
                  </button>
                )}
                {errorFoto && <p className={styles.errorCampo}>{errorFoto}</p>}
              </div>

              {error &&<p className={styles.error}>{error}</p>}
              {creadoId && (
                <p className={styles.aviso}>
                  Reporte creado. Ya aparece en el mapa.{' '}
                  <Link to={`/admin/reportes?reporte=${creadoId}`} className={styles.footerLink}>
                    Ver el reporte creado
                  </Link>
                </p>
              )}

              <button type="submit" className={styles.submit} disabled={guardando || calculando || procesandoFoto}>
                {guardando ? 'Creando…' : 'Crear reporte'}
              </button>
            </div>
          </form>
        </section>
      </main>
  )
}
