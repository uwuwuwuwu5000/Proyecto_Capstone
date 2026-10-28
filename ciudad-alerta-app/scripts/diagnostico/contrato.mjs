#!/usr/bin/env node
/**
 * Contrato entre la app, las reglas de seguridad y los índices de Firestore.
 *
 *   npm run diagnostico:contrato
 *   node scripts/diagnostico/contrato.mjs
 *
 * No levanta nada ni toca la red: lee el código fuente y lo compara. Busca
 * desajustes que no rompen el build pero sí explotan en producción como
 * «permiso denegado» o «se necesita un índice», y bugs de validación que el
 * usuario sufre sin que nada avise.
 *
 * Secciones (diagnostico/contrato.md):
 *   A · Acoplamientos declarados   constantes que las reglas dicen mantener en sincronía.
 *   B · Consultas vs índices        cada query compuesta necesita su índice en firestore.indexes.json.
 *   C · Límites de formulario        validadores del formulario vs límites de las reglas.
 *   D · Rutas protegidas             páginas de admin/gestión con su guard.
 *   E · Suscripciones                onSnapshot sin cancelar (fugas de memoria / lecturas).
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Informe, bloqueBalanceado, sinComentarios } from './comun.mjs';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const COMUN = resolve(RAIZ, '..', 'comun');
const informe = new Informe('Contrato app ↔ reglas ↔ índices · Ciudad Alerta');

const leer = (...p) => {
  const ruta = join(...p);
  return existsSync(ruta) ? readFileSync(ruta, 'utf8') : null;
};
const leerLimpio = (...p) => {
  const t = leer(...p);
  return t == null ? null : sinComentarios(t);
};
/** Todos los .ts de src (sin specs ni .d.ts), ya sin comentarios. */
function fuentesApp() {
  const salida = [];
  const pila = [join(RAIZ, 'src')];
  while (pila.length) {
    const dir = pila.pop();
    for (const nombre of readdirSync(dir)) {
      const ruta = join(dir, nombre);
      const st = statSync(ruta);
      if (st.isDirectory()) pila.push(ruta);
      else if (nombre.endsWith('.ts') && !nombre.endsWith('.spec.ts') && !nombre.endsWith('.d.ts')) {
        salida.push({ ruta: ruta.replace(RAIZ + '/', '').replace(RAIZ + '\\', ''), texto: sinComentarios(readFileSync(ruta, 'utf8')) });
      }
    }
  }
  return salida;
}

const reglas = sinComentarios(readFileSync(join(RAIZ, 'firestore.rules'), 'utf8'));

const listaDe = (texto, patron) => [...(texto?.match(patron)?.[1] ?? '').matchAll(/'([^']+)'/g)].map((m) => m[1]);
const iguales = (a, b) => a.length === b.length && [...a].sort().join('|') === [...b].sort().join('|');

/** Cuerpo { … } de una función de las reglas, por nombre. */
function cuerpoFuncion(texto, nombre) {
  const idx = texto.indexOf(`function ${nombre}`);
  if (idx < 0) return '';
  const llave = texto.indexOf('{', idx);
  return llave < 0 ? '' : bloqueBalanceado(texto, llave, '{', '}');
}

/**
 * Mapa de constantes numéricas exportadas en los modelos/comun, para resolver
 * usos como `asuntoMax = ASUNTO_MAX`.
 */
const CONSTANTES = {};
for (const archivo of [
  join(COMUN, 'src', 'reportes', 'descripcion.ts'),
  join(RAIZ, 'src', 'app', 'models', 'user-profile.model.ts'),
  join(RAIZ, 'src', 'app', 'modulos', 'soporte', 'modelo', 'support.model.ts'),
]) {
  const t = leer(archivo);
  if (!t) continue;
  for (const m of sinComentarios(t).matchAll(/export const ([A-Z][A-Z0-9_]*)\s*=\s*([0-9_]+)\b/g)) {
    CONSTANTES[m[1]] = Number(m[2].replace(/_/g, ''));
  }
}
/** Resuelve un literal numérico o el nombre de una constante conocida. */
function valorNumerico(expr) {
  if (expr == null) return NaN;
  const txt = String(expr).trim();
  if (/^[0-9_]+$/.test(txt)) return Number(txt.replace(/_/g, ''));
  return CONSTANTES[txt] ?? NaN;
}

// ════════════════════════════════════════════════════════════════════════════
// A · Acoplamientos declarados (las reglas dicen «debe coincidir con…»)
// ════════════════════════════════════════════════════════════════════════════
informe.seccion('A · Acoplamientos declarados entre la app y las reglas');

// A.1 · Correos de administrador (admin-emails.ts ↔ esCorreoAdministrador)
const adminApp = listaDe(leerLimpio(RAIZ, 'src', 'app', 'core', 'admin-emails.ts'), /CORREOS_ADMINISTRADORES[^=]*=\s*\[([\s\S]*?)\]/);
const adminReglas = listaDe(reglas, /request\.auth\.token\.email\s+in\s+\[([\s\S]*?)\]/);
if (!adminApp.length) informe.agregar('advertencia', 'no se encontró CORREOS_ADMINISTRADORES en admin-emails.ts');
else if (iguales(adminApp, adminReglas)) informe.ok(`correos admin sincronizados (${adminApp.length})`);
else informe.agregar('error', 'la lista de correos admin NO coincide entre la app y las reglas', {
  archivo: 'src/app/core/admin-emails.ts',
  detalle: `app: [${adminApp.join(', ')}]  ·  reglas: [${adminReglas.join(', ')}]`,
  solucion: 'Actualizar ambos lugares y volver a desplegar las reglas (lo dice el comentario de ambos archivos).',
});

// A.2 · Transiciones de estado (estados.ts TRANSICIONES ↔ transicionValida)
const estadosTxt = leerLimpio(COMUN, 'src', 'reportes', 'estados.ts');
const transApp = {};
for (const m of (estadosTxt?.match(/TRANSICIONES[^=]*=\s*\{([\s\S]*?)\};/)?.[1] ?? '').matchAll(/(\w+):\s*\[([^\]]*)\]/g)) {
  transApp[m[1]] = [...m[2].matchAll(/'([^']+)'/g)].map((x) => x[1]);
}
// De las reglas, SOLO de transicionValida (no de transicionTicketValida):
// desde == 'X' && hacia in ['A','B']  o  hacia == 'A'
const transReglas = {};
const cuerpoTransicion = cuerpoFuncion(reglas, 'transicionValida');
for (const m of cuerpoTransicion.matchAll(/desde == '(\w+)' && hacia (?:in \[([^\]]*)\]|== '(\w+)')/g)) {
  transReglas[m[1]] = m[3] ? [m[3]] : [...m[2].matchAll(/'([^']+)'/g)].map((x) => x[1]);
}
const estadosOrigen = new Set([...Object.keys(transApp), ...Object.keys(transReglas)]);
let transOk = true;
for (const e of estadosOrigen) {
  const a = (transApp[e] ?? []).slice().sort();
  const r = (transReglas[e] ?? []).slice().sort();
  if (a.join('|') !== r.join('|')) {
    transOk = false;
    informe.agregar('error', `transiciones de «${e}» no coinciden`, {
      archivo: 'comun/src/reportes/estados.ts',
      detalle: `app: [${a.join(', ')}]  ·  reglas: [${r.join(', ')}]`,
      solucion: 'Las reglas mandan: alinear TRANSICIONES con transicionValida().',
    });
  }
}
if (transOk) informe.ok(`transiciones de estado sincronizadas (${estadosOrigen.size} orígenes)`);

// A.3 · Categorías de respaldo (categorias.ts ↔ lista fija de categoriaValida)
const catApp = listaDe(leerLimpio(COMUN, 'src', 'reportes', 'categorias.ts'), /CATEGORIAS[^=]*=\s*\[([\s\S]*?)\];/).length
  ? [...(leerLimpio(COMUN, 'src', 'reportes', 'categorias.ts').match(/CATEGORIAS[^=]*=\s*\[([\s\S]*?)\];/)?.[1] ?? '').matchAll(/id:\s*'([^']+)'/g)].map((m) => m[1])
  : [];
const catReglas = listaDe(reglas, /categoria in \[([\s\S]*?)\]/);
if (!catApp.length) informe.agregar('advertencia', 'no se encontraron las categorías en comun/categorias.ts');
else if (iguales(catApp, catReglas)) informe.ok(`categorías de respaldo sincronizadas (${catApp.length})`);
else informe.agregar('advertencia', 'las categorías de la app y la lista de respaldo de las reglas difieren', {
  detalle: `app: [${catApp.join(', ')}]  ·  reglas: [${catReglas.join(', ')}]`,
  solucion: 'Mientras el catálogo /categorias no esté cargado, la lista fija de las reglas debe incluir las categorías activas de la app.',
});

// A.4 · Intervalo mínimo entre reportes (modelo ↔ intervaloMinimoMs)
const intvApp = Number((leerLimpio(RAIZ, 'src', 'app', 'models', 'user-profile.model.ts')?.match(/INTERVALO_MINIMO_REPORTE_MS\s*=\s*([0-9_]+)/)?.[1] ?? '').replace(/_/g, ''));
const intvReglas = Number(reglas.match(/function intervaloMinimoMs\(\)\s*\{\s*return\s*([0-9]+)/)?.[1]);
if (!intvApp || !intvReglas) informe.agregar('advertencia', 'no se pudo leer el intervalo mínimo en app o reglas');
else if (intvApp === intvReglas) informe.ok(`intervalo mínimo entre reportes sincronizado (${intvApp} ms)`);
else informe.agregar('error', `el intervalo mínimo difiere: app ${intvApp} ms vs reglas ${intvReglas} ms`, {
  archivo: 'src/app/models/user-profile.model.ts',
  solucion: 'Igualar INTERVALO_MINIMO_REPORTE_MS a intervaloMinimoMs().',
});

// A.5 · Largo de la descripción (descripcion.ts ↔ descripcionValida)
const descTxt = leerLimpio(COMUN, 'src', 'reportes', 'descripcion.ts');
const descMin = Number(descTxt?.match(/DESCRIPCION_MIN\s*=\s*(\d+)/)?.[1]);
const descMax = Number(descTxt?.match(/DESCRIPCION_MAX\s*=\s*(\d+)/)?.[1]);
const reglasDescMin = Number(reglas.match(/descripcion\.size\(\)\s*>=\s*(\d+)/)?.[1]);
const reglasDescMax = Number(reglas.match(/descripcion\.size\(\)\s*<=\s*(\d+)/)?.[1]);
if (descMin === reglasDescMin && descMax === reglasDescMax) informe.ok(`largo de descripción sincronizado (${descMin}–${descMax})`);
else informe.agregar('error', `el largo de la descripción difiere: app ${descMin}–${descMax} vs reglas ${reglasDescMin}–${reglasDescMax}`, {
  archivo: 'comun/src/reportes/descripcion.ts',
  solucion: 'Igualar DESCRIPCION_MIN/MAX a los límites de descripcionValida().',
});

// A.6 · Unidad de medida del texto: la app usa .length (UTF-16); las reglas, size() (puntos de código)
if (/\.length/.test(descTxt ?? '') && /size\(\)/.test(reglas)) {
  informe.agregar('advertencia', 'la app mide el texto con .length (UTF-16) y las reglas con size() (puntos de código)', {
    archivo: 'comun/src/reportes/descripcion.ts',
    detalle: 'Un texto con emojis o pares subrogados cuenta distinto: puede pasar el formulario y rechazarse en el servidor, o al revés.',
    solucion: 'Medir en puntos de código en el cliente: [...texto].length en vez de texto.length.',
  });
}

// ════════════════════════════════════════════════════════════════════════════
// B · Consultas compuestas vs índices
// ════════════════════════════════════════════════════════════════════════════
informe.seccion('B · Consultas compuestas vs firestore.indexes.json');

const indices = JSON.parse(readFileSync(join(RAIZ, 'firestore.indexes.json'), 'utf8')).indexes ?? [];
const indicePorColeccion = {};
for (const idx of indices) {
  (indicePorColeccion[idx.collectionGroup] ??= []).push(idx.fields.map((f) => f.fieldPath));
}
const indiceCubre = (coleccion, campos) =>
  (indicePorColeccion[coleccion] ?? []).some((f) => campos.every((c) => f.includes(c)) && f.length >= campos.length);

/** Extrae query(collection(db, 'coll'...), where(...)..., orderBy(...)...) de cada fuente. */
const consultas = [];
for (const { ruta, texto } of fuentesApp()) {
  for (const m of texto.matchAll(/query\s*\(([\s\S]*?)\)\s*;/g)) {
    const cuerpo = m[1];
    const coleccion = cuerpo.match(/collection\s*\([^,]+,\s*'([^']+)'/)?.[1]
      ?? cuerpo.match(/collection\s*\([^,]+,\s*`([^`]+)`/)?.[1];
    if (!coleccion) continue;
    const wheres = [...cuerpo.matchAll(/where\s*\(\s*'([^']+)'\s*,\s*'([^']+)'/g)].map((w) => ({ campo: w[1], op: w[2] }));
    const orders = [...cuerpo.matchAll(/orderBy\s*\(\s*'([^']+)'/g)].map((o) => o[1]);
    consultas.push({ ruta, coleccion, wheres, orders });
  }
}

const OPS_RANGO = new Set(['<', '<=', '>', '>=', '!=', 'not-in', 'array-contains', 'array-contains-any']);
let consultasRevisadas = 0;
for (const c of consultas) {
  const campos = [...new Set([...c.wheres.map((w) => w.campo), ...c.orders])];
  if (campos.length < 2) continue;
  // Firestore NO exige índice compuesto para varias igualdades sin orderBy: las
  // resuelve con los índices de un solo campo. Lo exige cuando hay un orderBy
  // sobre un campo distinto, o un operador de rango combinado con otro campo.
  const hayRango = c.wheres.some((w) => OPS_RANGO.has(w.op));
  const hayOrdenAjeno = c.orders.some((campo) => !c.wheres.some((w) => w.op === '==' && w.campo === campo));
  if (!hayRango && !hayOrdenAjeno) continue;
  consultasRevisadas++;
  if (indiceCubre(c.coleccion, campos)) {
    informe.ok(`${c.coleccion}: consulta sobre [${campos.join(', ')}] tiene índice`);
  } else {
    informe.agregar('error', `${c.coleccion}: consulta sin índice compuesto para [${campos.join(', ')}]`, {
      archivo: c.ruta,
      detalle: 'En producción esta consulta falla con «The query requires an index».',
      solucion: `Agregar un índice de ${c.coleccion} sobre [${campos.join(', ')}] en firestore.indexes.json y desplegarlo.`,
    });
  }
}
if (!consultasRevisadas) informe.agregar('info', 'no se detectaron consultas compuestas en el código (o usan composición dinámica)');

// Índices declarados que ninguna consulta detectada usa (solo aviso: puede ser del portal)
for (const [coleccion, listas] of Object.entries(indicePorColeccion)) {
  for (const campos of listas) {
    const usado = consultas.some((c) => c.coleccion === coleccion && campos.every((cp) => [...c.wheres.map((w) => w.campo), ...c.orders].includes(cp)));
    if (!usado) informe.agregar('info', `índice de ${coleccion} [${campos.join(', ')}] no lo usa ninguna consulta de la app (¿del portal web?)`);
  }
}

// ════════════════════════════════════════════════════════════════════════════
// C · Límites de formulario vs reglas
// ════════════════════════════════════════════════════════════════════════════
informe.seccion('C · Límites de formulario vs límites de las reglas');

// C.1 · BUG · displayName del registro sin tope de largo, pero el reporte lo recorta a 60
const login = leerLimpio(RAIZ, 'src', 'app', 'pages', 'login', 'login.page.ts') ?? '';
const reportService = leerLimpio(RAIZ, 'src', 'app', 'modulos', 'reportes', 'datos', 'report.service.ts') ?? '';
const nombreMin = Number(login.match(/displayName:\s*\[''\s*,\s*\[[^\]]*minLength\((\d+)\)/)?.[1]);
const tieneMaxLenNombre = /displayName:\s*\[''\s*,\s*\[[^\]]*maxLength\((\d+)\)/.test(login);
const recorte = Number(reportService.match(/\.slice\(0,\s*(\d+)\)/)?.[1]);
const reglaExigeIgual = /get\(perfil\)\.data\.displayName == datos\.autorNombre/.test(reglas);
if (!tieneMaxLenNombre && recorte && reglaExigeIgual) {
  informe.agregar('error', `BUG · un nombre de más de ${recorte} caracteres impide crear reportes`, {
    archivo: 'src/app/pages/login/login.page.ts',
    detalle: `El registro admite displayName de cualquier largo (solo minLength(${nombreMin || '?'}), sin maxLength). ` +
      `El perfil guarda el nombre completo, pero report.service.ts lo recorta a ${recorte} (slice(0,${recorte})). ` +
      `La regla exige displayName == autorNombre, así que si el nombre supera ${recorte}, la creación del reporte queda denegada para siempre.`,
    solucion: `Poner Validators.maxLength(${recorte}) en el displayName del registro (y maxlength en el input), o no recortar y validar el largo antes de guardar el perfil.`,
  });
} else {
  informe.ok('displayName del registro acotado o sin recorte en el reporte');
}

// C.2 · Largos de soporte: asunto, preview, mensaje
const comprobarLimite = (etiqueta, valorApp, valorRegla, archivo) => {
  if (Number.isNaN(valorApp) || Number.isNaN(valorRegla)) { informe.agregar('info', `${etiqueta}: no se pudo comparar (app ${valorApp}, regla ${valorRegla})`); return; }
  if (valorApp <= valorRegla) informe.ok(`${etiqueta}: formulario ${valorApp} ≤ regla ${valorRegla}`);
  else informe.agregar('error', `${etiqueta}: el formulario permite ${valorApp} pero la regla corta en ${valorRegla}`, {
    archivo, solucion: 'Bajar el límite del formulario para que nunca supere el de la regla.',
  });
};
const supportNew = leerLimpio(RAIZ, 'src', 'app', 'modulos', 'soporte', 'paginas', 'support-new', 'support-new.page.ts') ?? '';
const asuntoMax = valorNumerico(supportNew.match(/asuntoMax\s*=\s*([A-Za-z0-9_]+)/)?.[1]);
const reglaAsuntoMax = Number(reglas.match(/asunto\.size\(\)\s*<=\s*(\d+)/)?.[1]);
comprobarLimite('asunto del ticket', asuntoMax, reglaAsuntoMax, 'modulos/soporte/.../support-new.page.ts');
const mensajeMax = valorNumerico(supportNew.match(/mensajeMax\s*=\s*([A-Za-z0-9_]+)/)?.[1]);
const reglaTextoMax = Number(reglas.match(/texto\.size\(\)\s*<=\s*(\d+)/)?.[1]);
comprobarLimite('mensaje de soporte', mensajeMax, reglaTextoMax, 'modulos/soporte/.../support-new.page.ts');

// C.3 · Descripción del reporte: maxlength del template vs regla
const reportTs = leerLimpio(RAIZ, 'src', 'app', 'modulos', 'reportes', 'paginas', 'report', 'report.page.ts') ?? '';
const descMaxApp = valorNumerico(reportTs.match(/descripcionMax\s*=\s*([A-Za-z0-9_]+)/)?.[1]) || descMax;
comprobarLimite('descripción del reporte', descMaxApp, reglasDescMax, 'modulos/reportes/.../report.page.ts');

// ════════════════════════════════════════════════════════════════════════════
// D · Rutas de admin/gestión con su guard
// ════════════════════════════════════════════════════════════════════════════
informe.seccion('D · Rutas sensibles protegidas por un guard');
let rutasSensibles = 0;
for (const { ruta, texto } of fuentesApp()) {
  if (!/routes\s*:|Routes\b|loadComponent|loadChildren/.test(texto)) continue;
  for (const m of texto.matchAll(/path:\s*'([^']*(?:admin|gestion|gestión|operador|panel)[^']*)'([\s\S]{0,400}?)(?:\},|\n\s*\{)/g)) {
    rutasSensibles++;
    const bloque = m[2];
    if (!/canActivate|canMatch/.test(bloque)) {
      informe.agregar('advertencia', `ruta sensible «${m[1]}» sin canActivate/canMatch visible`, {
        archivo: ruta,
        detalle: 'La seguridad real la dan las reglas de Firestore, pero una ruta de gestión sin guard muestra UI que no debería.',
        solucion: 'Agregar un guard de rol a la ruta, además de las reglas.',
      });
    }
  }
}
if (rutasSensibles) informe.ok(`${rutasSensibles} ruta(s) sensible(s) revisada(s)`);
else informe.agregar('info', 'no se detectaron rutas de admin/gestión por nombre (pueden estar en el portal web)');

// ════════════════════════════════════════════════════════════════════════════
// E · Suscripciones onSnapshot sin cancelar
// ════════════════════════════════════════════════════════════════════════════
informe.seccion('E · onSnapshot sin cancelar (fugas de lecturas)');
let snaps = 0;
let sueltos = 0;
for (const { ruta, texto } of fuentesApp()) {
  const n = (texto.match(/onSnapshot\s*\(/g) ?? []).length;
  if (!n) continue;
  snaps += n;
  // Heurística: si en el archivo no se guarda el retorno de onSnapshot ni se ve unsubscribe/takeUntil/Destroy.
  // `return onSnapshot(...)` dentro de un Observable entrega la cancelación al
  // suscriptor: cuenta como gestionada.
  const guarda = /=\s*onSnapshot|return\s+onSnapshot|new Observable|unsubscribe|takeUntil|ngOnDestroy|DestroyRef|destroyRef/.test(texto);
  if (!guarda) {
    sueltos++;
    informe.agregar('advertencia', `${ruta}: usa onSnapshot sin guardar la cancelación`, {
      detalle: 'Un listener que no se cancela sigue leyendo (y cobrando) tras salir de la pantalla.',
      solucion: 'Guardar la función que devuelve onSnapshot y llamarla en ngOnDestroy (o usar takeUntilDestroyed).',
    });
  }
}
if (snaps && !sueltos) informe.ok(`${snaps} onSnapshot, todos con cancelación aparente`);
else if (!snaps) informe.agregar('info', 'no se detectó onSnapshot en la app (puede usar observables de AngularFire)');

process.exitCode = informe.cerrar(RAIZ, 'contrato.md');
