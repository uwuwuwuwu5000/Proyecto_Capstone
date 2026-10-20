#!/usr/bin/env node
/**
 * Ubicaciones de los reportes: dónde está guardado cada uno y si algo no cuadra.
 * Responde la pregunta de los casos MS8 y MS9 del plan de pruebas.
 *
 *   node scripts/ubicaciones-reportes.mjs              solo lee (recomendado primero)
 *   node scripts/ubicaciones-reportes.mjs --csv        además deja diagnostico/ubicaciones.csv
 *   node scripts/ubicaciones-reportes.mjs --aplicar    completa región, comuna y geohash faltantes
 *
 * Opciones: --region="Metropolitana" (filtra por texto de la región guardada o
 * calculada), --limite=200.
 *
 * Usa la misma clave de cuenta de servicio que los otros scripts:
 *   set GOOGLE_APPLICATION_CREDENTIALS=C:\claves\ciudad-alerta-admin.json
 *
 * Para cada reporte muestra reportId, comuna, latitud y longitud tal como
 * están en Firestore, en qué campo vienen las coordenadas, y lo compara con
 * los límites comunales oficiales de la app (src/assets/geo):
 *
 *   - reportes en el MISMO PUNTO o a menos de 30 m: el mapa los agrupa (MS9);
 *   - coordenadas faltantes, fuera de Chile, invertidas o en un punto por
 *     defecto (Plaza de Armas, 0,0): el mapa los dibujaría mal (MS8);
 *   - precisión baja (más de 500 m): ubicación aproximada, típica de un
 *     computador sin GPS, que pone muchos reportes en el mismo lugar;
 *   - comuna o región guardada distinta de la que dicen las coordenadas;
 *   - región faltante: el mapa por región no lo encuentra;
 *   - geohash que no corresponde a las coordenadas: "Cerca de mí" no lo encuentra.
 *
 * --aplicar NUNCA cambia coordenadas, una comuna ya guardada, el organismo ni
 * el operador. Solo completa `region` y `comuna` cuando faltan y corrige el
 * geohash. Antes de escribir guarda un respaldo en diagnostico/.
 */
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const argumento = (nombre) =>
  process.argv.find((a) => a.startsWith(`--${nombre}=`))?.slice(nombre.length + 3).trim().replace(/^"(.*)"$/, '$1') || null;
const APLICAR = process.argv.includes('--aplicar');
const CSV = process.argv.includes('--csv');
const FILTRO_REGION = argumento('region');
const LIMITE = Number(argumento('limite') ?? 0) || null;

/** Puntos que delatan una ubicación inventada por la app o el navegador. */
const PUNTOS_POR_DEFECTO = [
  { nombre: 'Plaza de Armas (centro por defecto del mapa)', lat: -33.4372, lng: -70.6506 },
  { nombre: '0, 0 (golfo de Guinea)', lat: 0, lng: 0 },
];
const PRECISION_BAJA_M = 500;

function terminar(mensaje) {
  console.error(`\n✖ ${mensaje}\n`);
  process.exit(1);
}

// ── Credenciales ─────────────────────────────────────────────────────────────
const rutaClave = process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim().replace(/^"(.*)"$/, '$1');
if (!rutaClave) terminar('Falta GOOGLE_APPLICATION_CREDENTIALS. Ejemplo: set GOOGLE_APPLICATION_CREDENTIALS=C:\\claves\\ciudad-alerta-admin.json');
process.env.GOOGLE_APPLICATION_CREDENTIALS = rutaClave;
let projectId;
try {
  projectId = JSON.parse(readFileSync(rutaClave, 'utf8')).project_id;
} catch (error) {
  terminar(error.code === 'ENOENT' ? `No existe ${rutaClave}.` : `${rutaClave} no es una clave válida.`);
}

// ── Límites comunales y catálogo (los mismos archivos que usa la app) ───────
const GEO = join(RAIZ, 'src', 'assets', 'geo');
const archivoCatalogo = join(RAIZ, 'src', 'assets', 'data', 'comunas-chile.json');
if (!existsSync(join(GEO, 'indice.json')) || !existsSync(archivoCatalogo)) {
  terminar('No se encontraron src/assets/geo/indice.json o src/assets/data/comunas-chile.json. Ejecuta el script desde la raíz del proyecto.');
}
const indice = JSON.parse(readFileSync(join(GEO, 'indice.json'), 'utf8'));
const catalogo = JSON.parse(readFileSync(archivoCatalogo, 'utf8')).comunas;
const comunaPorCodigo = new Map(catalogo.map((c) => [c.codigo, c]));

const requerir = createRequire(join(RAIZ, 'package.json'));
let geohashForLocation = null;
try {
  ({ geohashForLocation } = requerir('geofire-common'));
} catch {
  console.warn('  ⚠ No se encontró geofire-common: se omite la revisión del geohash (npm install).');
}

const regionesCargadas = new Map();
function comunasDeRegion(codigo) {
  if (!regionesCargadas.has(codigo)) {
    const archivo = indice.regiones.find((r) => r.codigo === codigo)?.archivo;
    const geojson = archivo ? JSON.parse(readFileSync(join(GEO, archivo), 'utf8')) : { features: [] };
    regionesCargadas.set(
      codigo,
      geojson.features.map((f) => ({
        codigo: String(f.properties?.CUT_COM ?? '').padStart(5, '0'),
        nombre: f.properties?.Comuna ?? null,
        poligonos: f.geometry?.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry?.type === 'MultiPolygon' ? f.geometry.coordinates : [],
      })),
    );
  }
  return regionesCargadas.get(codigo);
}

function dentroDeAnillo(lat, lng, anillo) {
  let dentro = false;
  for (let i = 0, j = anillo.length - 1; i < anillo.length; j = i++) {
    const [xi, yi] = anillo[i];
    const [xj, yj] = anillo[j];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) dentro = !dentro;
  }
  return dentro;
}

/** Comuna oficial (del catálogo) que contiene el punto, o null. */
function comunaDe(lat, lng) {
  const regiones = new Set(
    indice.comunas.filter((c) => lng >= c.caja[0] && lat >= c.caja[1] && lng <= c.caja[2] && lat <= c.caja[3]).map((c) => c.region),
  );
  for (const region of regiones) {
    for (const comuna of comunasDeRegion(region)) {
      const dentro = comuna.poligonos.some(([exterior, ...huecos]) => exterior && dentroDeAnillo(lat, lng, exterior) && !huecos.some((h) => dentroDeAnillo(lat, lng, h)));
      if (dentro) {
        const oficial = comunaPorCodigo.get(comuna.codigo);
        return { codigo: comuna.codigo, nombre: oficial?.nombre ?? comuna.nombre, region: oficial?.region ?? null };
      }
    }
  }
  return null;
}

const normalizar = (t) =>
  String(t ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * Coordenadas del reporte y en qué campo venían. La app guarda
 * `ubicacion: { lat, lng, accuracy }`; se aceptan otros formatos para detectar
 * reportes escritos por otra vía (portal, pruebas a mano).
 */
function coordenadasDe(r) {
  const numero = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const candidatos = [
    ['ubicacion.lat/lng', r.ubicacion?.lat, r.ubicacion?.lng],
    ['ubicacion (GeoPoint)', r.ubicacion?.latitude ?? r.ubicacion?._latitude, r.ubicacion?.longitude ?? r.ubicacion?._longitude],
    ['latitude/longitude', r.latitude, r.longitude],
    ['lat/lng', r.lat, r.lng],
    ['location', r.location?.latitude ?? r.location?.lat, r.location?.longitude ?? r.location?.lng],
  ];
  for (const [campo, lat, lng] of candidatos) {
    if (numero(lat) !== null && numero(lng) !== null) return { campo, lat, lng, precision: numero(r.ubicacion?.accuracy) };
  }
  return null;
}

const fecha = (t) =>
  t?.toDate?.().toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Santiago' }) ?? '—';
const corto = (t, n) => (String(t ?? '').length > n ? `${String(t).slice(0, n - 1)}…` : String(t ?? '—'));

// ── Lectura ──────────────────────────────────────────────────────────────────
initializeApp({ credential: applicationDefault(), projectId });
const db = getFirestore();

console.log(`\nProyecto: ${projectId} · ${APLICAR ? 'MODO APLICAR (escribe)' : 'solo lectura'}\n`);

let consulta = db.collection('reports');
if (LIMITE) consulta = consulta.limit(LIMITE);
const documentos = (await consulta.get()).docs.sort(
  (a, b) => (a.get('createdAt')?.toMillis?.() ?? 0) - (b.get('createdAt')?.toMillis?.() ?? 0),
);

const filas = [];
for (const d of documentos) {
  const r = d.data();
  const coords = coordenadasDe(r);
  const obs = [];
  const cambios = {};
  let calculada = null;

  if (!coords) {
    obs.push('SIN COORDENADAS: el mapa no puede dibujarlo');
  } else {
    const { lat, lng } = coords;
    if (coords.campo !== 'ubicacion.lat/lng') obs.push(`coordenadas en «${coords.campo}», no en ubicacion.lat/lng: la app no las lee`);
    if (lat > -17 || lat < -57 || lng > -66 || lng < -110) {
      obs.push(lat <= -66 && lat >= -76 && lng <= -17 && lng >= -57 ? 'LATITUD Y LONGITUD INVERTIDAS' : 'FUERA DE CHILE');
    }
    for (const p of PUNTOS_POR_DEFECTO) {
      if (Math.abs(lat - p.lat) < 0.0001 && Math.abs(lng - p.lng) < 0.0001) obs.push(`punto por defecto: ${p.nombre}`);
    }
    if (coords.precision !== null && coords.precision > PRECISION_BAJA_M) {
      obs.push(`precisión baja (±${Math.round(coords.precision)} m): ubicación aproximada, sin GPS`);
    }

    calculada = comunaDe(lat, lng);
    if (!calculada) {
      if (!obs.some((o) => o.startsWith('FUERA') || o.startsWith('LATITUD'))) obs.push('fuera de los límites comunales (¿en el mar?)');
    } else {
      if (!r.comuna) {
        obs.push(`sin comuna guardada (por coordenadas: ${calculada.nombre})`);
        cambios.comuna = calculada.nombre;
        cambios.comunaFuente = 'limites_oficiales';
      } else if (normalizar(r.comuna) !== normalizar(calculada.nombre)) {
        obs.push(`comuna guardada «${r.comuna}», pero las coordenadas caen en ${calculada.nombre}`);
      }
      if (!r.region) {
        obs.push('sin región: el mapa por región lo busca por comuna');
        if (calculada.region) cambios.region = calculada.region;
      } else if (calculada.region && normalizar(r.region) !== normalizar(calculada.region)) {
        obs.push(`región guardada «${r.region}», pero las coordenadas caen en ${calculada.region}`);
      }
    }

    // Con coordenadas en otro campo la app no ve el reporte igual: el geohash
    // se corrige solo para el formato de la app.
    if (geohashForLocation && coords.campo === 'ubicacion.lat/lng') {
      const largo = typeof r.geohash === 'string' && r.geohash.length ? r.geohash.length : 10;
      const esperado = geohashForLocation([lat, lng], largo);
      if (r.geohash !== esperado) {
        obs.push(r.geohash ? 'geohash no corresponde a las coordenadas' : 'sin geohash');
        cambios.geohash = esperado;
      }
    }
  }

  filas.push({
    id: d.id,
    ref: d.ref,
    creado: fecha(r.createdAt),
    comuna: r.comuna ?? null,
    region: r.region ?? null,
    regionCalculada: calculada?.region ?? null,
    coords,
    obs,
    cambios,
    anterior: Object.fromEntries(Object.keys(cambios).map((k) => [k, r[k] ?? null])),
  });
}

const visibles = FILTRO_REGION
  ? filas.filter((f) => normalizar(`${f.region} ${f.regionCalculada}`).includes(normalizar(FILTRO_REGION)))
  : filas;

// ── Tabla ────────────────────────────────────────────────────────────────────
console.log(`${visibles.length} reportes${FILTRO_REGION ? ` en «${FILTRO_REGION}»` : ''}\n`);
console.log(`${'reportId'.padEnd(22)} ${'comuna'.padEnd(18)} ${'latitud'.padStart(10)} ${'longitud'.padStart(10)}  observaciones`);
console.log('─'.repeat(100));
for (const f of visibles) {
  const lat = f.coords ? f.coords.lat.toFixed(4) : '—';
  const lng = f.coords ? f.coords.lng.toFixed(4) : '—';
  console.log(`${corto(f.id, 22).padEnd(22)} ${corto(f.comuna ?? 'SIN COMUNA', 18).padEnd(18)} ${lat.padStart(10)} ${lng.padStart(10)}  ${f.obs.join(' · ') || 'OK'}`);
}

// ── Puntos repetidos o muy cercanos (MS9) ───────────────────────────────────
/** Distancia en metros entre dos coordenadas (fórmula del haversine). */
function metros(a, b) {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
}
const CERCA_M = 30;
const conCoords = visibles.filter((x) => x.coords);
const grupoDe = conCoords.map((_, i) => i);
const raiz = (i) => (grupoDe[i] === i ? i : (grupoDe[i] = raiz(grupoDe[i])));
for (let i = 0; i < conCoords.length; i++) {
  for (let j = i + 1; j < conCoords.length; j++) {
    if (metros(conCoords[i].coords, conCoords[j].coords) <= CERCA_M) grupoDe[raiz(i)] = raiz(j);
  }
}
const grupos = new Map();
conCoords.forEach((f, i) => grupos.set(raiz(i), [...(grupos.get(raiz(i)) ?? []), f]));
const repetidos = [...grupos.values()]
  .filter((lista) => lista.length > 1)
  .map((lista) => [`${lista[0].coords.lat.toFixed(4)},${lista[0].coords.lng.toFixed(4)}`, lista])
  .sort((a, b) => b[1].length - a[1].length);

console.log(`\nReportes en el mismo punto o a menos de ${CERCA_M} m`);
if (!repetidos.length) console.log('  ninguno');
for (const [clave, lista] of repetidos) {
  const aproximados = lista.filter((f) => f.coords.precision !== null && f.coords.precision > PRECISION_BAJA_M).length;
  console.log(
    `  ${String(lista.length).padStart(3)} en ${clave} (${lista[0].comuna ?? 'sin comuna'})` +
      (aproximados ? ` · ${aproximados} con precisión baja` : '') +
      `: ${lista.map((f) => f.id).join(', ')}`,
  );
}

// ── Resumen ──────────────────────────────────────────────────────────────────
const porComuna = new Map();
for (const f of visibles) porComuna.set(f.comuna ?? 'SIN COMUNA', (porComuna.get(f.comuna ?? 'SIN COMUNA') ?? 0) + 1);
const conProblema = visibles.filter((f) => f.obs.length);
const sinCoords = visibles.filter((f) => !f.coords).length;
const enRepetidos = repetidos.reduce((n, [, l]) => n + l.length, 0);

const resumen = [
  `${visibles.length} reportes · ${porComuna.size} comunas: ${[...porComuna.entries()].sort((a, b) => b[1] - a[1]).map(([c, n]) => `${c} ${n}`).join(', ')}`,
  sinCoords ? `${sinCoords} sin coordenadas: el mapa no los puede mostrar.` : 'Todos tienen coordenadas propias.',
  enRepetidos
    ? `${enRepetidos} reportes comparten punto con otros (${repetidos.length} puntos): el mapa los agrupa en un círculo con el total y se separan al acercar (MS9). Si son de lugares distintos, el problema está al crearlos (ubicación aproximada o del mismo dispositivo), no en el mapa.`
    : 'Ningún punto repetido.',
  `${conProblema.length} con observaciones; ${visibles.length - conProblema.length} sin observaciones.`,
];
console.log('\nResumen');
for (const linea of resumen) console.log(`  · ${linea}`);

// ── Informes ─────────────────────────────────────────────────────────────────
const carpeta = join(RAIZ, 'diagnostico');
mkdirSync(carpeta, { recursive: true });
const md = [
  '# Ubicaciones de los reportes',
  '',
  `Proyecto ${projectId} · ${new Date().toLocaleString('es-CL', { timeZone: 'America/Santiago' })}${FILTRO_REGION ? ` · región «${FILTRO_REGION}»` : ''}`,
  '',
  ...resumen.map((l) => `- ${l}`),
  '',
  '| reportId | creado | comuna | latitud | longitud | precisión | región | campo | observaciones |',
  '|---|---|---|---|---|---|---|---|---|',
  ...visibles.map(
    (f) =>
      `| ${f.id} | ${f.creado} | ${f.comuna ?? '—'} | ${f.coords?.lat ?? '—'} | ${f.coords?.lng ?? '—'} | ${f.coords?.precision != null ? `${Math.round(f.coords.precision)} m` : '—'} | ${f.region ?? '—'} | ${f.coords?.campo ?? '—'} | ${f.obs.join('; ') || 'OK'} |`,
  ),
  '',
  `## Mismo punto o a menos de ${CERCA_M} m`,
  '',
  ...(repetidos.length ? repetidos.map(([clave, l]) => `- **${l.length}** en \`${clave}\` (${l[0].comuna ?? 'sin comuna'}): ${l.map((f) => f.id).join(', ')}`) : ['Ninguno.']),
  '',
];
writeFileSync(join(carpeta, 'ubicaciones.md'), md.join('\n'));
console.log(`\nInforme: ${join(carpeta, 'ubicaciones.md')}`);

if (CSV) {
  const celda = (v) => `"${String(v ?? '').replaceAll('"', '""')}"`;
  const lineas = [
    ['reportId', 'creado', 'comuna', 'latitud', 'longitud', 'precision_m', 'region', 'campo', 'observaciones'].join(';'),
    ...visibles.map((f) =>
      [f.id, f.creado, f.comuna, f.coords?.lat, f.coords?.lng, f.coords?.precision, f.region, f.coords?.campo, f.obs.join(' | ')].map(celda).join(';'),
    ),
  ];
  // Con BOM y punto y coma, Excel en español lo abre bien con doble clic.
  writeFileSync(join(carpeta, 'ubicaciones.csv'), `\uFEFF${lineas.join('\r\n')}`);
  console.log(`CSV:     ${join(carpeta, 'ubicaciones.csv')}`);
}

// ── Correcciones ─────────────────────────────────────────────────────────────
const porCorregir = visibles.filter((f) => Object.keys(f.cambios).length);
console.log(`\nCorrecciones posibles: ${porCorregir.length} reportes`);
for (const f of porCorregir) {
  console.log(`  · ${f.id}: ${Object.entries(f.cambios).map(([k, v]) => `${k} ${JSON.stringify(f.anterior[k])} → ${JSON.stringify(v)}`).join(', ')}`);
}

if (!porCorregir.length) {
  console.log('');
} else if (!APLICAR) {
  console.log('\nNo se escribió nada. Para aplicarlas: node scripts/ubicaciones-reportes.mjs --aplicar\n');
} else {
  const respaldo = join(carpeta, `respaldo-ubicaciones-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  writeFileSync(respaldo, JSON.stringify(porCorregir.map((f) => ({ id: f.id, antes: f.anterior, despues: f.cambios })), null, 2));
  console.log(`\nRespaldo: ${respaldo}`);

  for (let i = 0; i < porCorregir.length; i += 400) {
    const lote = db.batch();
    for (const f of porCorregir.slice(i, i + 400)) lote.update(f.ref, f.cambios);
    await lote.commit();
  }
  console.log(`✓ ${porCorregir.length} reportes actualizados. Coordenadas, comunas existentes, organismo y operador no se tocaron.\n`);
}
