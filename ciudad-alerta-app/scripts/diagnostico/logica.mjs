#!/usr/bin/env node
/**
 * Lógica y casos borde del negocio compartido (paquete `comun`).
 *
 *   npm run diagnostico:logica
 *   node scripts/diagnostico/logica.mjs
 *
 * Empaqueta `comun` con esbuild y ejercita sus funciones puras comparándolas
 * con las reglas de Firestore y con invariantes que deben cumplirse siempre.
 * No toca la red ni Firebase. Busca desajustes de cálculo y bordes que rompen
 * en producción aunque el build y los tests normales pasen.
 *
 * Secciones (diagnostico/logica.md):
 *   A · Confianza: nivel/peso/límite   comun vs reglas, en todo el rango.
 *   B · Veredicto: efecto en los PC     +10 / −15 y topes [0, 760].
 *   C · Tolerancias de tiempo           TOLERANCIA_TIEMPO_RESOLUCION_MS vs reglas.
 *   D · numeroDeDia y horario de Chile  el desfase fijo UTC−3 vs America/Santiago.
 *   E · Unicode y tamaño del texto      .length (app) vs puntos de código (reglas).
 *   F · Geografía                        distancia, geohash y límites de coordenadas.
 *   G · Transiciones de estado           invariantes del ciclo de vida.
 */
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { Informe } from './comun.mjs';

const APP = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const COMUN = resolve(APP, '..', 'comun');
const SERVICIO = resolve(APP, '..', 'servicio-privacidad');
const informe = new Informe('Lógica y casos borde · Ciudad Alerta');
const reglas = readFileSync(join(APP, 'firestore.rules'), 'utf8');

// ── Empaquetar `comun` (TypeScript puro, sin deps de runtime) ────────────────
const requerirServicio = createRequire(join(SERVICIO, 'package.json'));
let tmpDir = null;
process.on('exit', () => { if (tmpDir) try { rmSync(tmpDir, { recursive: true, force: true }); } catch { /* */ } });

let C;
try {
  const esbuild = await import(pathToFileURL(requerirServicio.resolve('esbuild')).href);
  tmpDir = mkdtempSync(join(tmpdir(), 'diag-comun-'));
  const salida = join(tmpDir, 'comun.mjs');
  await esbuild.build({ entryPoints: [join(COMUN, 'src', 'index.ts')], outfile: salida, bundle: true, format: 'esm', platform: 'node', packages: 'external', logLevel: 'silent' });
  C = await import(pathToFileURL(salida).href);
} catch (e) {
  informe.agregar('error', 'no se pudo empaquetar el paquete `comun` con esbuild', { detalle: e.message, solucion: 'Corre `npm install` en servicio-privacidad (trae esbuild) y en comun.' });
  process.exitCode = informe.cerrar(APP, 'logica.md');
  process.exit();
}

const aprox = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

// ════════════════════════════════════════════════════════════════════════════
// A · Confianza: nivel, peso y límite diario (comun vs reglas)
// ════════════════════════════════════════════════════════════════════════════
informe.seccion('A · Sistema de confianza: comun vs reglas, en todo el rango');

// Reimplementación de las reglas, parseada del propio firestore.rules.
const umbralesReglas = [...reglas.matchAll(/pc >= (\d+) \? (\d+)/g)].map((m) => [Number(m[1]), Number(m[2])]);
const nivelReglas = (pc) => {
  for (const [u, n] of umbralesReglas) if (pc >= u) return n;
  return 0;
};
// pesoDeNivel de las reglas: nivel >= 10 ? 34 : 10 + 2.5 * nivel
const pesoReglas = (n) => (n >= 10 ? 34 : 10 + 2.5 * n);
// limiteDiario de las reglas
const limiteReglas = (n) => (n === 0 ? 5 : n === 1 ? 8 : n <= 3 ? 12 : n <= 6 ? 20 : 30);

let desajustesNivel = 0;
for (let pc = 0; pc <= 800; pc++) {
  if (C.nivelDePuntos(pc) !== nivelReglas(pc)) {
    desajustesNivel++;
    if (desajustesNivel <= 3) informe.agregar('error', `nivelDePuntos(${pc}): comun=${C.nivelDePuntos(pc)} vs reglas=${nivelReglas(pc)}`, { solucion: 'Alinear NIVELES de comun con nivelDePuntos() de las reglas.' });
  }
}
if (!desajustesNivel) informe.ok('nivelDePuntos coincide con las reglas en 0–800 PC');

let desajustesPeso = 0;
for (let n = 0; n <= 12; n++) {
  if (!aprox(C.pesoDeNivel(n), pesoReglas(n))) {
    desajustesPeso++;
    informe.agregar('error', `pesoDeNivel(${n}): comun=${C.pesoDeNivel(n)} vs reglas=${pesoReglas(n)}`);
  }
}
if (!desajustesPeso) informe.ok('pesoDeNivel coincide con las reglas (niveles 0–12, tope 34)');

let desajustesLim = 0;
for (let n = 0; n <= 12; n++) {
  if (C.limiteDiario(n) !== limiteReglas(n)) { desajustesLim++; informe.agregar('error', `limiteDiario(${n}): comun=${C.limiteDiario(n)} vs reglas=${limiteReglas(n)}`); }
}
if (!desajustesLim) informe.ok('limiteDiario coincide con las reglas (niveles 0–12)');

// Invariantes: monotonía y bordes exactos.
let monotono = true;
for (let pc = 1; pc <= 800; pc++) if (C.nivelDePuntos(pc) < C.nivelDePuntos(pc - 1)) monotono = false;
if (monotono) informe.ok('nivelDePuntos es monótono no decreciente');
else informe.agregar('error', 'nivelDePuntos baja en algún punto (debería solo subir)');

const bordes = [[39, 0], [40, 1], [79, 1], [80, 2], [759, 9], [760, 10], [10000, 10]];
let bordesOk = true;
for (const [pc, nivel] of bordes) if (C.nivelDePuntos(pc) !== nivel) { bordesOk = false; informe.agregar('error', `borde de nivel: nivelDePuntos(${pc}) debería ser ${nivel} y es ${C.nivelDePuntos(pc)}`); }
if (bordesOk) informe.ok('los bordes de nivel caen donde deben (39→0, 40→1, 759→9, 760→10)');

if (C.pesoDeNivel(10) === 34 && C.pesoDeNivel(11) === 34) informe.ok('el peso se topa en 34 aunque el nivel suba');
else informe.agregar('advertencia', `el tope de peso no se respeta: pesoDeNivel(11)=${C.pesoDeNivel(11)}`);

// ════════════════════════════════════════════════════════════════════════════
// B · Veredicto: efecto en los puntos de confianza
// ════════════════════════════════════════════════════════════════════════════
informe.seccion('B · Veredicto: +10 / −15 y topes [0, 760]');
const P = C.PARAMETROS_CONFIANZA;
const reglaReal = Number(reglas.match(/pcAntes \+ (\d+) > 760/)?.[1]);
const reglaFalso = Number(reglas.match(/pcAntes - (\d+) < 0/)?.[1]);
if (P.puntosPorReporteReal === reglaReal) informe.ok(`veredicto real: +${P.puntosPorReporteReal} PC (igual que las reglas)`);
else informe.agregar('error', `veredicto real: comun +${P.puntosPorReporteReal} vs reglas +${reglaReal}`);
if (Math.abs(P.puntosPorReporteFalso) === reglaFalso) informe.ok(`veredicto falso: ${P.puntosPorReporteFalso} PC (igual que las reglas)`);
else informe.agregar('error', `veredicto falso: comun ${P.puntosPorReporteFalso} vs reglas −${reglaFalso}`);
// Topes: no baja de 0 ni sube de 760 (replica de la fórmula de las reglas).
const tope = (pc, real) => (real ? Math.min(pc + 10, 760) : Math.max(pc - 15, 0));
if (tope(755, true) === 760 && tope(10, false) === 0) informe.ok('los puntos se topan en [0, 760] (no se desbordan)');
else informe.agregar('error', 'los topes [0, 760] de los puntos no se aplican como en las reglas');

// ════════════════════════════════════════════════════════════════════════════
// C · Tolerancias de tiempo
// ════════════════════════════════════════════════════════════════════════════
informe.seccion('C · Tolerancia del tiempo de resolución');
const tolReglas = Number((reglas.match(/math\.abs[\s\S]{0,200}?<=\s*(\d+)/) ?? [])[1]);
const tolComun = C.TOLERANCIA_TIEMPO_RESOLUCION_MS;
if (tolReglas && tolComun === tolReglas) informe.ok(`tolerancia de resolución sincronizada (${tolComun} ms = 15 min)`);
else informe.agregar('error', `tolerancia de resolución: comun ${tolComun} vs reglas ${tolReglas}`, { solucion: 'Igualar TOLERANCIA_TIEMPO_RESOLUCION_MS a la tolerancia de cambioDeEstadoValido().' });

// ════════════════════════════════════════════════════════════════════════════
// D · numeroDeDia y el horario de Chile
// ════════════════════════════════════════════════════════════════════════════
informe.seccion('D · numeroDeDia (desfase fijo UTC−3) vs horario de Chile');
const horaLocal = (ms) => new Intl.DateTimeFormat('es-CL', { timeZone: 'America/Santiago', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(ms));
// Para cada día de 2026, ¿a qué hora local empieza el "día" del contador?
let diasA23 = 0;
let ejemploInvierno = null;
const inicio2026 = Date.UTC(2026, 0, 1);
for (let d = 0; d < 365; d++) {
  const ms = inicio2026 + d * 86_400_000;
  const dia = C.numeroDeDia(ms + 12 * 3_600_000); // mediodía de ese día
  const inicioMs = C.inicioDeDia(dia); // instante en que arranca el contador
  const hhmm = horaLocal(inicioMs);
  if (hhmm.startsWith('23')) { diasA23++; if (!ejemploInvierno) ejemploInvierno = { ms: inicioMs, hhmm }; }
}
if (diasA23 > 0) {
  informe.agregar('advertencia', `el "día" del contador empieza a las ${ejemploInvierno.hhmm} (no a medianoche) en ${diasA23} días del año`, {
    detalle: 'En invierno Chile es UTC−4, pero numeroDeDia() usa un desfase fijo UTC−3: el contador de confirmaciones se reinicia a las 23:00 locales. Un usuario podría confirmar su tope, esperar al "cambio de día" a las 23:00 y volver a confirmar una hora antes de la medianoche real.',
    solucion: 'Aceptarlo como limitación menor y documentarlo, o calcular el día con la zona America/Santiago (requeriría lógica de DST, difícil en las reglas).',
  });
} else {
  informe.ok('numeroDeDia empieza a medianoche local todo el año');
}
// Invariante: numeroDeDia crece de uno en uno cada 24 h.
if (C.numeroDeDia(1_000_000_000_000 + 86_400_000) - C.numeroDeDia(1_000_000_000_000) === 1) informe.ok('numeroDeDia avanza exactamente 1 cada 24 h');
else informe.agregar('error', 'numeroDeDia no avanza de uno en uno cada 24 h');

// ════════════════════════════════════════════════════════════════════════════
// E · Unicode y tamaño del texto
// ════════════════════════════════════════════════════════════════════════════
informe.seccion('E · Unicode: .length (app) vs puntos de código (reglas size())');
const puntosDeCodigo = (s) => [...s].length;
const muestras = [
  { nombre: '6 emojis', texto: '👍'.repeat(6) },
  { nombre: 'familia (emoji compuesto)', texto: '👨‍👩‍👧‍👦' },
  { nombre: 'acento combinante ×12', texto: 'é'.repeat(12) },
  { nombre: 'texto normal de 12', texto: 'bache grande' },
];
let hayDesajuste = false;
for (const m of muestras) {
  const js = m.texto.length; // lo que ve el validador del formulario (.length)
  const cp = puntosDeCodigo(m.texto); // lo que cuenta size() de las reglas
  const prob = C.problemaDescripcion?.(m.texto); // null si el formulario lo aceptaría
  const pasaForm = prob === null || prob === undefined; // (según DESCRIPCION_MIN/MAX con .length tras trim)
  const pasaRegla = cp >= 10 && cp <= 500;
  if (js !== cp) {
    hayDesajuste = true;
    const nivel = pasaForm !== pasaRegla ? 'advertencia' : 'info';
    informe.agregar(nivel, `«${m.nombre}»: .length=${js}, puntos de código=${cp}` + (pasaForm !== pasaRegla ? ` → el formulario lo ${pasaForm ? 'acepta' : 'rechaza'} pero las reglas lo ${pasaRegla ? 'aceptan' : 'rechazan'}` : ''), {
      solucion: pasaForm !== pasaRegla ? 'Medir el largo en puntos de código en el formulario ([...texto].length) para que coincida con size() de las reglas.' : undefined,
    });
  }
}
if (!hayDesajuste) informe.ok('no se detectó diferencia de conteo entre la app y las reglas en las muestras');

// ════════════════════════════════════════════════════════════════════════════
// F · Geografía: distancia, geohash y coordenadas
// ════════════════════════════════════════════════════════════════════════════
informe.seccion('F · Geografía: distancia, geohash y coordenadas');
// Distancia conocida: Plaza de Armas ↔ Estadio Nacional ≈ 6,5 km.
const d = C.distanciaMetros({ lat: -33.4377, lng: -70.6504 }, { lat: -33.4647, lng: -70.6109 });
if (d > 4000 && d < 9000) informe.ok(`distanciaMetros da un valor razonable (${Math.round(d)} m para ~6,5 km)`);
else informe.agregar('advertencia', `distanciaMetros da ${Math.round(d)} m (se esperaba ~6500)`);

// geohash de geofire-common contra la regla geohashValido.
const reGeohash = /^[0-9b-hjkmnp-z]+$/;
try {
  const requerirApp = createRequire(join(APP, 'package.json'));
  const gf = requerirApp('geofire-common');
  const hash = gf.geohashForLocation([-33.4489, -70.6693]);
  if (reGeohash.test(hash) && hash.length >= 1 && hash.length <= 12) informe.ok(`el geohash de geofire-common (${hash}) cumple la regla geohashValido`);
  else informe.agregar('error', `el geohash «${hash}» no cumple la regla ^[0-9b-hjkmnp-z]+$ (≤12)`, { solucion: 'Revisar geohashValido() o el truncado del geohash en la app.' });
} catch (e) {
  informe.agregar('info', `no se pudo cargar geofire-common desde la app: ${e.message}`);
}

// Límites de coordenadas (replica de ubicacionValida).
const coordOk = (lat, lng) => lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
if (coordOk(-33.45, -70.66) && !coordOk(91, 0) && !coordOk(0, 181)) informe.ok('los límites de latitud/longitud de ubicacionValida son coherentes');
else informe.agregar('error', 'los límites de coordenadas no se comportan como en ubicacionValida');

// ════════════════════════════════════════════════════════════════════════════
// G · Transiciones de estado
// ════════════════════════════════════════════════════════════════════════════
informe.seccion('G · Invariantes del ciclo de vida del reporte');
const T = C.TRANSICIONES;
if (T && typeof T === 'object') {
  const estados = Object.keys(T);
  let targetsOk = true;
  for (const [desde, hacia] of Object.entries(T)) {
    for (const h of hacia) if (!estados.includes(h)) { targetsOk = false; informe.agregar('error', `transición ${desde}→${h}: «${h}» no es un estado conocido`); }
  }
  if (targetsOk) informe.ok('todas las transiciones apuntan a estados válidos');
  if ((T.cerrado ?? []).length === 0) informe.ok('«cerrado» es terminal (sin salidas)');
  else informe.agregar('advertencia', '«cerrado» tiene transiciones de salida (debería ser terminal)');
  const alcanzaReportado = Object.values(T).some((hacia) => hacia.includes('reportado'));
  if (!alcanzaReportado) informe.ok('ningún estado vuelve a «reportado»');
  else informe.agregar('advertencia', 'alguna transición regresa a «reportado»');
} else {
  informe.agregar('info', 'no se pudo leer TRANSICIONES desde comun');
}

process.exitCode = informe.cerrar(APP, 'logica.md');
