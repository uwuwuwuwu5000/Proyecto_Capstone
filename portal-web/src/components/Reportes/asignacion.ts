// Asignación de un reporte nuevo a su comuna, organismo y operador.
//
// Replica paso a paso lo que hace la app móvil (ComunaService,
// CatalogoComunasService y RoutingService en la rama main-mobile), con los
// mismos archivos de límites y catálogo (public/geo y public/data, copiados de
// sus assets). Un mismo punto debe quedar asignado igual se reporte desde el
// teléfono o desde el portal: si se cambia algo aquí, hay que cambiarlo allá.
import { collection, doc, getDoc, getDocs, limit, query, where } from 'firebase/firestore'
import { db } from '../../firebase/config'

export interface Punto {
  lat: number
  lng: number
}

export interface ComunaDetectada {
  comuna: string | null
  region: string | null
  /** Código Único Territorial (CUT), cuando se identificó en el catálogo. */
  codigo: string | null
  /** Municipalidad que atiende la comuna, según el catálogo oficial. */
  organismoId: string | null
  fuente: 'limites_oficiales' | 'no_disponible'
}

/** Copia reducida del organismo que se guarda en el reporte. */
export interface OrganismoReporte {
  id: string
  nombre: string
  tipo: string
  comuna?: string | null
}

export interface Asignacion {
  comuna: ComunaDetectada
  organismo: OrganismoReporte
  /** true si se usó el organismo genérico de la categoría. */
  esGenerico: boolean
  operadorId: string | null
  /** Nombre del operador, solo para mostrarlo antes de crear el reporte. */
  operadorNombre: string | null
}

// ---------------------------------------------------------------------------
// Organismos genéricos: mismos valores que ORGANISMOS en report.model.ts del
// móvil. Se usan cuando la comuna no se identificó o su municipalidad no está
// activa. Una categoría nueva del catálogo cae en la OIRS, igual que allá.
// ---------------------------------------------------------------------------

const OIRS: OrganismoReporte = { id: 'muni_oirs', nombre: 'OIRS Municipal', tipo: 'municipio' }
const ASEO: OrganismoReporte = { id: 'muni_aseo', nombre: 'Dirección de Aseo y Ornato', tipo: 'municipio' }
const OBRAS: OrganismoReporte = {
  id: 'muni_obras',
  nombre: 'Dirección de Obras Municipales',
  tipo: 'municipio',
}

const ORGANISMOS_GENERICOS: Readonly<Record<string, OrganismoReporte>> = {
  microbasural: ASEO,
  luminaria: { id: 'elec_dist', nombre: 'Empresa distribuidora eléctrica', tipo: 'empresa_electrica' },
  fuga_agua: { id: 'sanitaria', nombre: 'Empresa sanitaria', tipo: 'empresa_sanitaria' },
  arbol_peligroso: ASEO,
  calle_deteriorada: OBRAS,
  accesibilidad: OBRAS,
  otro: OIRS,
}

export function organismoGenerico(categoria: string): OrganismoReporte {
  return ORGANISMOS_GENERICOS[categoria] ?? OIRS
}

// ---------------------------------------------------------------------------
// Límites comunales oficiales
// ---------------------------------------------------------------------------

type Caja = [number, number, number, number]
type Anillo = number[][]
/** GeoJSON: el primer anillo es el contorno y los siguientes, huecos; [lng, lat]. */
export type Poligono = Anillo[]

interface IndiceRegional {
  regiones: { codigo: string; archivo: string }[]
  comunas: { cut: string; region: string; caja: Caja }[]
}

interface ComunaIndexada {
  nombre: string
  codigo: string | null
  region: string | null
  /** Caja envolvente [minLng, minLat, maxLng, maxLat] para descartar rápido. */
  caja: Caja
  poligonos: Poligono[]
}

const SIN_DATO: ComunaDetectada = {
  comuna: null,
  region: null,
  codigo: null,
  organismoId: null,
  fuente: 'no_disponible',
}

/** Propiedades donde puede venir cada dato según la fuente del GeoJSON. */
const CLAVES_CODIGO = ['CUT_COM', 'COD_COMUNA', 'CODIGO', 'cod_comuna', 'codigo_comuna', 'cut']
const CLAVES_COMUNA = ['Comuna', 'COMUNA', 'comuna', 'NOM_COM', 'NOM_COMUNA', 'nombre', 'name']
const CLAVES_REGION = ['Region', 'REGION', 'region', 'NOM_REG', 'NOM_REGION']

// Se cargan una vez por sesión y se comparten entre llamadas.
let cargaIndice: Promise<IndiceRegional | null> | null = null
const regionesCargadas = new Map<string, Promise<ComunaIndexada[]>>()

function cargarIndice(): Promise<IndiceRegional | null> {
  if (!cargaIndice) {
    cargaIndice = fetch('/geo/indice.json')
      .then((r) => (r.ok ? (r.json() as Promise<IndiceRegional>) : null))
      .catch(() => null)
      .then((indice) => {
        // Si falló, se olvida para reintentar en la próxima detección.
        if (!indice) cargaIndice = null
        return indice
      })
  }
  return cargaIndice
}

function cargarRegion(codigo: string, archivo: string): Promise<ComunaIndexada[]> {
  let carga = regionesCargadas.get(codigo)
  if (!carga) {
    carga = fetch(`/geo/${archivo}`)
      .then((r) => {
        if (!r.ok) throw new Error(`No se encontró ${archivo} (${r.status}).`)
        return r.json()
      })
      .then(indexar)
      .catch((err) => {
        console.warn('Límites comunales no disponibles:', err)
        return []
      })
    regionesCargadas.set(codigo, carga)
    void carga.then((comunas) => {
      if (comunas.length === 0) regionesCargadas.delete(codigo)
    })
  }
  return carga
}

function leerPropiedad(propiedades: Record<string, unknown> | undefined, claves: string[]): string | null {
  if (!propiedades) return null
  for (const clave of claves) {
    const valor = propiedades[clave]
    if (typeof valor === 'string' && valor.trim()) return valor.trim()
    if (typeof valor === 'number' && Number.isFinite(valor)) return String(valor)
  }
  return null
}

function indexar(geojson: {
  features?: { properties?: Record<string, unknown>; geometry?: { type: string; coordinates: unknown } }[]
}): ComunaIndexada[] {
  const resultado: ComunaIndexada[] = []
  for (const feature of geojson.features ?? []) {
    const nombre = leerPropiedad(feature.properties, CLAVES_COMUNA)
    const geometria = feature.geometry
    if (!nombre || !geometria) continue

    // Polygon es una lista de anillos; MultiPolygon, una lista de polígonos.
    const poligonos: Poligono[] =
      geometria.type === 'Polygon'
        ? [geometria.coordinates as Poligono]
        : geometria.type === 'MultiPolygon'
          ? (geometria.coordinates as Poligono[])
          : []
    if (poligonos.length === 0) continue

    resultado.push({
      nombre: normalizarNombre(nombre),
      codigo: leerPropiedad(feature.properties, CLAVES_CODIGO),
      region: leerPropiedad(feature.properties, CLAVES_REGION),
      caja: calcularCaja(poligonos),
      poligonos,
    })
  }
  return resultado
}

function calcularCaja(poligonos: Poligono[]): Caja {
  let minLng = Infinity
  let minLat = Infinity
  let maxLng = -Infinity
  let maxLat = -Infinity
  for (const poligono of poligonos) {
    for (const [lng, lat] of poligono[0] ?? []) {
      minLng = Math.min(minLng, lng)
      minLat = Math.min(minLat, lat)
      maxLng = Math.max(maxLng, lng)
      maxLat = Math.max(maxLat, lat)
    }
  }
  return [minLng, minLat, maxLng, maxLat]
}

function dentroDeCaja(punto: Punto, caja: Caja): boolean {
  return punto.lng >= caja[0] && punto.lat >= caja[1] && punto.lng <= caja[2] && punto.lat <= caja[3]
}

/** Trazado de rayos: un número impar de cruces con el borde significa "dentro". */
function dentroDeAnillo(punto: Punto, anillo: Anillo): boolean {
  // GeoJSON guarda las coordenadas como [longitud, latitud].
  const x = punto.lng
  const y = punto.lat
  let dentro = false
  for (let i = 0, j = anillo.length - 1; i < anillo.length; j = i++) {
    const [xi, yi] = anillo[i]
    const [xj, yj] = anillo[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      dentro = !dentro
    }
  }
  return dentro
}

/** El primer anillo es el contorno; los siguientes, huecos. */
function dentroDePoligono(punto: Punto, poligono: Poligono): boolean {
  const [exterior, ...huecos] = poligono
  if (!exterior || !dentroDeAnillo(punto, exterior)) return false
  return !huecos.some((hueco) => dentroDeAnillo(punto, hueco))
}

/** "MAIPÚ" → "Maipú"; "SAN JOSÉ DE MAIPO" → "San José de Maipo". */
function normalizarNombre(nombre: string): string {
  const menores = new Set(['de', 'del', 'la', 'las', 'los', 'y'])
  return nombre
    .trim()
    .toLocaleLowerCase('es-CL')
    .split(/\s+/)
    .map((palabra, indice) =>
      indice > 0 && menores.has(palabra)
        ? palabra
        : palabra.charAt(0).toLocaleUpperCase('es-CL') + palabra.slice(1),
    )
    .join(' ')
    .slice(0, 80)
}

async function porLimitesOficiales(punto: Punto): Promise<ComunaDetectada> {
  const indice = await cargarIndice()
  if (!indice) return SIN_DATO

  // Solo se descargan las regiones cuyas comunas podrían contener el punto
  // (para Santiago, un único archivo de 84 KB).
  const regiones = new Set(
    indice.comunas.filter((c) => dentroDeCaja(punto, c.caja)).map((c) => c.region),
  )
  const archivos = indice.regiones.filter((r) => regiones.has(r.codigo))
  const candidatas = (await Promise.all(archivos.map((r) => cargarRegion(r.codigo, r.archivo)))).flat()

  for (const comuna of candidatas) {
    if (!dentroDeCaja(punto, comuna.caja)) continue
    if (comuna.poligonos.some((poligono) => dentroDePoligono(punto, poligono))) {
      return {
        comuna: comuna.nombre,
        region: comuna.region,
        codigo: comuna.codigo,
        organismoId: null,
        fuente: 'limites_oficiales',
      }
    }
  }
  return SIN_DATO
}

// ---------------------------------------------------------------------------
// Catálogo oficial de comunas (346, con su municipalidad)
// ---------------------------------------------------------------------------

interface ComunaCatalogo {
  codigo: string
  nombre: string
  /** Nombre sin tildes ni signos, para comparar entre fuentes. */
  clave: string
  region: string
  organismoId: string
}

/** Variantes ortográficas de una misma comuna entre fuentes. */
const ALIAS: Readonly<Record<string, string>> = {
  coihaique: 'coyhaique',
  aisen: 'aysen',
  'til til': 'tiltil',
  'llay llay': 'llaillay',
  marchihue: 'marchigue',
  paiguano: 'paihuano',
  trehuaco: 'treguaco',
  'cabo de hornos ex navarino': 'cabo de hornos',
  navarino: 'cabo de hornos',
  'la calera': 'calera',
  'alto bio bio': 'alto biobio',
}

let cargaCatalogo: Promise<{
  porCodigo: Map<string, ComunaCatalogo>
  porClave: Map<string, ComunaCatalogo>
} | null> | null = null

function cargarCatalogo() {
  if (!cargaCatalogo) {
    cargaCatalogo = fetch('/data/comunas-chile.json')
      .then((r) => {
        if (!r.ok) throw new Error(`Catálogo de comunas no disponible (${r.status}).`)
        return r.json() as Promise<{ comunas: ComunaCatalogo[] }>
      })
      .then((archivo) => {
        const porCodigo = new Map<string, ComunaCatalogo>()
        const porClave = new Map<string, ComunaCatalogo>()
        for (const comuna of archivo.comunas) {
          porCodigo.set(comuna.codigo, comuna)
          porClave.set(comuna.clave, comuna)
        }
        return { porCodigo, porClave }
      })
      .catch((err) => {
        console.error(err)
        cargaCatalogo = null
        return null
      })
  }
  return cargaCatalogo
}

function claveComuna(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

async function buscarEnCatalogo(codigo: string | null, nombre: string | null): Promise<ComunaCatalogo | null> {
  const catalogo = await cargarCatalogo()
  if (!catalogo) return null

  if (codigo) {
    // Algunas fuentes pierden el cero inicial ("5101" en vez de "05101").
    const encontrada = catalogo.porCodigo.get(codigo.padStart(5, '0'))
    if (encontrada) return encontrada
  }
  if (nombre) {
    const clave = claveComuna(nombre)
    const buscada = ALIAS[clave] ?? clave
    const exacta = catalogo.porClave.get(buscada)
    if (exacta) return exacta
    // Último intento: sin espacios ("Til Til" frente a "Tiltil").
    const compacta = buscada.replace(/ /g, '')
    for (const comuna of catalogo.porClave.values()) {
      if (comuna.clave.replace(/ /g, '') === compacta) return comuna
    }
  }
  return null
}

/** Comuna del punto, con su nombre oficial y la municipalidad que la atiende. */
export async function detectarComuna(punto: Punto): Promise<ComunaDetectada> {
  const detectada = await porLimitesOficiales(punto)
  if (!detectada.comuna && !detectada.codigo) return detectada

  const oficial = await buscarEnCatalogo(detectada.codigo, detectada.comuna)
  if (!oficial) return detectada

  return {
    comuna: oficial.nombre,
    region: oficial.region,
    codigo: oficial.codigo,
    organismoId: oficial.organismoId,
    fuente: detectada.fuente,
  }
}

/** Límite oficial de una comuna, para dibujarlo en un mapa. */
export interface LimiteComuna {
  codigo: string
  nombre: string
  poligonos: Poligono[]
}

/**
 * Límites de las comunas que atiende una municipalidad (casi siempre una;
 * Cabo de Hornos atiende también la Antártica, que no tiene geometría).
 */
export async function limitesDeOrganismo(organismoId: string): Promise<LimiteComuna[]> {
  const [catalogo, indice] = await Promise.all([cargarCatalogo(), cargarIndice()])
  if (!catalogo || !indice) {
    throw new Error('No se pudieron cargar los límites comunales.')
  }
  const comunas = [...catalogo.porCodigo.values()].filter((c) => c.organismoId === organismoId)

  const limites: LimiteComuna[] = []
  for (const comuna of comunas) {
    const entrada = indice.comunas.find((c) => c.cut === comuna.codigo)
    const region = entrada && indice.regiones.find((r) => r.codigo === entrada.region)
    if (!region) continue
    const geometrias = await cargarRegion(region.codigo, region.archivo)
    const geometria = geometrias.find((g) => g.codigo?.padStart(5, '0') === comuna.codigo)
    if (geometria) {
      limites.push({ codigo: comuna.codigo, nombre: comuna.nombre, poligonos: geometria.poligonos })
    }
  }
  return limites
}

// ---------------------------------------------------------------------------
// Organismo y operador
// ---------------------------------------------------------------------------

/** La municipalidad, si existe y está activa; si no, null. */
async function leerMunicipio(organismoId: string): Promise<OrganismoReporte | null> {
  const snap = await getDoc(doc(db, 'organismos', organismoId))
  if (!snap.exists()) return null
  const datos = snap.data()
  if (datos.activo === false) return null
  return {
    id: typeof datos.id === 'string' ? datos.id : snap.id,
    nombre: typeof datos.nombre === 'string' ? datos.nombre : snap.id,
    tipo: typeof datos.tipo === 'string' ? datos.tipo : 'municipio',
    comuna: typeof datos.comuna === 'string' ? datos.comuna : null,
  }
}

/**
 * Operador activo del organismo, o null. Con varios, el primero por id, para
 * que la asignación sea siempre la misma (igual que el móvil). Los organismos
 * genéricos no tienen operadores.
 */
async function resolverOperador(
  organismoId: string,
): Promise<{ id: string; nombre: string | null } | null> {
  if (!/^muni_\d{5}$/.test(organismoId)) return null
  const snap = await getDocs(
    query(
      collection(db, 'operadores'),
      where('organismoId', '==', organismoId),
      where('activo', '==', true),
      limit(10),
    ),
  )
  const operadores = snap.docs
    .map((d) => {
      const datos = d.data()
      return {
        id: typeof datos.id === 'string' ? datos.id : d.id,
        nombre: typeof datos.nombre === 'string' ? datos.nombre : null,
      }
    })
    .sort((a, b) => a.id.localeCompare(b.id))
  return operadores[0] ?? null
}

/** Comuna, organismo y operador que recibiría un reporte en este punto. */
export async function calcularAsignacion(punto: Punto, categoria: string): Promise<Asignacion> {
  const comuna = await detectarComuna(punto)
  const municipio = comuna.organismoId ? await leerMunicipio(comuna.organismoId) : null
  const organismo = municipio ?? organismoGenerico(categoria)
  const operador = await resolverOperador(organismo.id)
  return {
    comuna,
    organismo,
    esGenerico: !municipio,
    operadorId: operador?.id ?? null,
    operadorNombre: operador?.nombre ?? null,
  }
}
