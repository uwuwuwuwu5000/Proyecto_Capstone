#!/usr/bin/env node
/**
 * Higiene del cliente: secretos, configuración de Android/Capacitor, build y
 * dependencias. Busca lo que se filtra o se endurece fuera de las reglas de
 * Firestore.
 *
 *   npm run diagnostico:cliente
 *   node scripts/diagnostico/cliente.mjs            # sin red
 *   node scripts/diagnostico/cliente.mjs --audit    # además corre npm audit
 *
 * Secciones (diagnostico/cliente.md):
 *   A · Secretos en el árbol        claves privadas, service accounts, .env con valores.
 *   B · Secretos en el historial    lo mismo, en cualquier commit pasado.
 *   C · Cobertura de .gitignore      que claves y keystores no puedan subirse por error.
 *   D · Artefactos de build          dist/www/*.map/node_modules rastreados por git.
 *   E · Sinks de XSS                 innerHTML, bypassSecurityTrust, eval, document.write.
 *   F · Android / Capacitor          cleartext, debuggable, allowBackup, exported.
 *   G · Cabeceras de seguridad       Content-Security-Policy, X-Content-Type-Options.
 *   H · Dependencias (npm audit)     solo con --audit.
 *   I · Almacenamiento y logs        localStorage de datos y PII en console.*
 *
 * La API key web de Firebase NO es un secreto (viaja en el bundle; lo dicen
 * environment.ts y la doc de Firebase); este script no la marca.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Informe } from './comun.mjs';

const APP = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ES_WINDOWS = process.platform === 'win32';
const CON_AUDIT = process.argv.includes('--audit');
const informe = new Informe('Higiene del cliente · Ciudad Alerta');

// Raíz del repositorio (monorepo). Si no hay git, se trabaja sobre la app.
const gitRoot = (() => {
  const r = spawnSync('git', ['rev-parse', '--show-toplevel'], { cwd: APP, encoding: 'utf8', shell: ES_WINDOWS });
  return r.status === 0 ? r.stdout.trim() : null;
})();
const RAIZ = gitRoot ?? APP;
const rel = (ruta) => relative(RAIZ, ruta).split('\\').join('/');

const git = (...args) => spawnSync('git', args, { cwd: RAIZ, encoding: 'utf8', shell: ES_WINDOWS, maxBuffer: 64 * 1024 * 1024 });

/** Archivos rastreados por git; si no hay git, recorre la app a mano. */
function archivosRastreados() {
  if (gitRoot) {
    const r = git('ls-files');
    if (r.status === 0) return r.stdout.split('\n').filter(Boolean);
  }
  const salida = [];
  const pila = [APP];
  while (pila.length) {
    const dir = pila.pop();
    for (const nombre of readdirSync(dir)) {
      if (['node_modules', 'dist', 'www', '.git', 'android', 'coverage'].includes(nombre)) continue;
      const ruta = join(dir, nombre);
      const st = statSync(ruta);
      if (st.isDirectory()) pila.push(ruta);
      else salida.push(rel(ruta));
    }
  }
  return salida;
}

const leerSeguro = (ruta) => {
  try {
    return readFileSync(join(RAIZ, ruta), 'utf8');
  } catch {
    return null;
  }
};
const esBinario = (nombre) => /\.(png|jpg|jpeg|webp|gif|ico|pdf|zip|rar|jar|keystore|jks|p12|woff2?|ttf|eot|mp4|bin)$/i.test(nombre);

// Patrones de secreto REAL (no la API key web de Firebase, que es pública).
const PATRONES_SECRETO = [
  { nombre: 'clave privada PEM', re: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/ },
  { nombre: 'service account de Google', re: /"type"\s*:\s*"service_account"/ },
  { nombre: 'campo private_key', re: /"private_key"\s*:\s*"-----BEGIN/ },
  { nombre: 'clave de acceso AWS', re: /\bAKIA[0-9A-Z]{16}\b/ },
  { nombre: 'token de Slack', re: /\bxox[baprs]-[0-9A-Za-z-]{10,}\b/ },
  { nombre: 'token de GitHub', re: /\bgh[pousr]_[0-9A-Za-z]{30,}\b/ },
  { nombre: 'contraseña embebida', re: /(?:password|contrase[nñ]a|passwd|pwd)\s*[:=]\s*['"][^'"\s]{6,}['"]/i },
  { nombre: 'secreto/API genérico', re: /(?:secret|api[_-]?key|token|private[_-]?key)\s*[:=]\s*['"][A-Za-z0-9_\-]{24,}['"]/i },
];
// Rutas donde la API key web de Firebase es esperable y NO es secreto.
const esEntornoFirebase = (ruta) => /environments?\/environment.*\.ts$/.test(ruta);
// Las propias herramientas de diagnóstico CONTIENEN los patrones que buscan
// (ej. "private_key", "-----BEGIN") como texto; no son secretos.
const esHerramienta = (ruta) => /(?:^|\/)scripts\/(?:diagnostico\/|codigo\.mjs$|datos\.mjs$|cliente\.mjs$|contrato\.mjs$|logica\.mjs$)/.test(ruta);

// ════════════════════════════════════════════════════════════════════════════
// A · Secretos en el árbol de trabajo
// ════════════════════════════════════════════════════════════════════════════
informe.seccion('A · Secretos en los archivos rastreados');
const rastreados = archivosRastreados();
let secretosArbol = 0;
for (const ruta of rastreados) {
  if (esBinario(ruta) || esHerramienta(ruta)) continue;
  const texto = leerSeguro(ruta);
  if (texto == null || texto.length > 2_000_000) continue;
  const esTest = /\.spec\.|\.test\.|(?:^|\/)e2e\/|(?:^|\/)maqueta\//.test(ruta);
  const PATRONES_BLANDOS = new Set(['contraseña embebida', 'secreto/API genérico']);
  for (const p of PATRONES_SECRETO) {
    // La API key web (AIza…) solo se tolera en environment*.ts.
    const m = texto.match(p.re);
    if (!m) continue;
    if (p.nombre === 'secreto/API genérico' && /AIza[0-9A-Za-z_\-]{30,}/.test(m[0]) && esEntornoFirebase(ruta)) continue;
    // En archivos de prueba, una contraseña fija es dato de test, no secreto.
    if (esTest && PATRONES_BLANDOS.has(p.nombre)) continue;
    secretosArbol++;
    const linea = texto.slice(0, texto.indexOf(m[0])).split('\n').length;
    informe.agregar('brecha', `posible ${p.nombre} en el código`, {
      archivo: ruta, linea,
      solucion: 'Sacarlo del repositorio, rotar la credencial y leerla de una variable de entorno o un secreto del proveedor.',
    });
  }
}
if (!secretosArbol) informe.ok('ningún secreto evidente en los archivos rastreados');

// ════════════════════════════════════════════════════════════════════════════
// B · Secretos en el historial de git
// ════════════════════════════════════════════════════════════════════════════
informe.seccion('B · Secretos en el historial de git');
if (!gitRoot) {
  informe.agregar('info', 'no es un repositorio git: no se puede revisar el historial');
} else {
  // B.1 · Nombres de archivo sensibles que existieron en algún commit.
  const nombres = git('log', '--all', '--pretty=format:', '--name-only', '--diff-filter=A');
  const sensibles = new Set();
  for (const l of (nombres.stdout ?? '').split('\n')) {
    if (/(?:adminsdk|service[_-]?account|serviceAccount).*\.json$|\.(?:jks|keystore|p12|pem|key)$|(?:^|\/)\.env(?:\.|$)|(?:^|\/)claves?\//i.test(l)) sensibles.add(l);
  }
  for (const l of sensibles) {
    informe.agregar('brecha', `archivo sensible presente en el historial: ${l}`, {
      solucion: 'Aunque ya no esté, sigue en los commits antiguos: rotar la credencial y, si procede, reescribir el historial (git filter-repo).',
    });
  }
  // B.2 · Contenido de secreto en cualquier commit. Patrones de alta señal (la
  // forma real del secreto, no la palabra suelta) y se colapsa por ARCHIVO, no
  // por commit, saltando las propias herramientas de diagnóstico.
  const commits = (git('rev-list', '--all').stdout ?? '').split('\n').filter(Boolean);
  const patronesHist = ['-----BEGIN RSA PRIVATE KEY-----', '-----BEGIN PRIVATE KEY-----', '-----BEGIN OPENSSH PRIVATE KEY-----', '"type": "service_account"'];
  const golpes = new Map(); // archivo → patrón
  if (commits.length) {
    for (const needle of patronesHist) {
      const r = git('grep', '-I', '-l', '-F', needle, ...commits.slice(0, 400));
      for (const linea of (r.stdout ?? '').split('\n').filter(Boolean)) {
        const ruta = linea.split(':').slice(1).join(':'); // <commit>:<ruta>
        if (esEntornoFirebase(ruta) || esHerramienta(ruta)) continue;
        if (!golpes.has(ruta)) golpes.set(ruta, needle);
      }
    }
  }
  for (const [ruta, needle] of golpes) {
    informe.agregar('brecha', `patrón de secreto «${needle}» en el historial`, {
      archivo: ruta, solucion: 'Rotar la credencial; el valor quedó en un commit antiguo (git filter-repo para borrarlo).',
    });
  }
  if (!sensibles.size && !golpes.size) informe.ok(`historial limpio (${commits.length} commits revisados)`);
}

// ════════════════════════════════════════════════════════════════════════════
// C · Cobertura de .gitignore
// ════════════════════════════════════════════════════════════════════════════
informe.seccion('C · .gitignore protege claves y keystores');
const gitignore = [leerSeguro('.gitignore'), leerSeguro('ciudad-alerta-app/.gitignore')].filter(Boolean).join('\n');
const debeIgnorar = [
  { que: 'keystores de Android', re: /\*\.(?:jks|keystore)\b/ },
  { que: 'service accounts (*-adminsdk-*.json)', re: /adminsdk|serviceAccount|service[_-]account/i },
  { que: 'archivos .env', re: /(?:^|\n)\s*\*?\.env/ },
  { que: 'carpeta de claves', re: /claves?\//i },
];
for (const d of debeIgnorar) {
  if (d.re.test(gitignore)) informe.ok(`.gitignore cubre ${d.que}`);
  else informe.agregar('advertencia', `.gitignore no cubre ${d.que}`, {
    solucion: `Agregar un patrón para ${d.que} para que no se suban por error.`,
  });
}

// ════════════════════════════════════════════════════════════════════════════
// D · Artefactos de build rastreados
// ════════════════════════════════════════════════════════════════════════════
informe.seccion('D · Artefactos de build que no deberían estar en git');
const artefactos = rastreados.filter((r) =>
  /(?:^|\/)(?:dist|www|out-tsc|coverage)\//.test(r) || /\.map$/.test(r) || /(?:^|\/)node_modules\//.test(r));
if (!artefactos.length) informe.ok('no hay dist/www/*.map/node_modules rastreados');
else {
  const porTipo = {};
  for (const r of artefactos) {
    const tipo = /\.map$/.test(r) ? 'source maps (*.map)' : r.match(/(?:^|\/)(dist|www|out-tsc|coverage|node_modules)\//)?.[1] ?? 'otros';
    (porTipo[tipo] ??= []).push(r);
  }
  for (const [tipo, lista] of Object.entries(porTipo)) {
    informe.agregar('advertencia', `${lista.length} archivo(s) de ${tipo} rastreados por git`, {
      archivo: lista[0], detalle: lista.length > 1 ? `y ${lista.length - 1} más` : undefined,
      solucion: 'Quitarlos del índice (git rm --cached) y agregarlos a .gitignore.',
    });
  }
}

// ════════════════════════════════════════════════════════════════════════════
// E · Sinks de XSS en la app y el servicio
// ════════════════════════════════════════════════════════════════════════════
informe.seccion('E · Sinks de inyección (XSS / eval)');
const SINKS = [
  { nombre: 'innerHTML', re: /\binnerHTML\s*=|\[innerHTML\]/ },
  { nombre: 'bypassSecurityTrust', re: /bypassSecurityTrust\w*/ },
  { nombre: 'document.write', re: /document\.write\s*\(/ },
  { nombre: 'eval', re: /\beval\s*\(/ },
  { nombre: 'Function(...) dinámico', re: /\bnew Function\s*\(/ },
  { nombre: 'outerHTML', re: /\bouterHTML\s*=/ },
];
let sinks = 0;
for (const ruta of rastreados) {
  if (!/\.(ts|html|js|mjs)$/.test(ruta)) continue;
  if (/\.spec\.|node_modules|\/dist\/|\/www\//.test(ruta)) continue;
  if (!/^(?:ciudad-alerta-app\/src|servicio-privacidad\/src|comun\/src)\//.test(ruta) && gitRoot) continue;
  const texto = leerSeguro(ruta);
  if (texto == null) continue;
  for (const s of SINKS) {
    const m = texto.match(s.re);
    if (!m) continue;
    sinks++;
    const linea = texto.slice(0, texto.indexOf(m[0])).split('\n').length;
    informe.agregar('advertencia', `uso de ${s.nombre}`, {
      archivo: ruta, linea,
      solucion: 'Revisar que el contenido no provenga del usuario sin sanear. Preferir binding de texto o DomSanitizer con cuidado.',
    });
  }
}
if (!sinks) informe.ok('ningún sink de XSS/eval evidente en el código propio');

// ════════════════════════════════════════════════════════════════════════════
// F · Android / Capacitor
// ════════════════════════════════════════════════════════════════════════════
informe.seccion('F · Configuración de Android y Capacitor');
const manifest = leerSeguro('ciudad-alerta-app/android/app/src/main/AndroidManifest.xml');
if (!manifest) informe.agregar('info', 'no se encontró AndroidManifest.xml (¿proyecto sin plataforma Android?)');
else {
  const comprobaciones = [
    { mal: /android:debuggable="true"/, msg: 'la app Android está marcada como debuggable', nivel: 'brecha' },
    { mal: /android:usesCleartextTraffic="true"/, msg: 'permite tráfico HTTP sin cifrar (usesCleartextTraffic)', nivel: 'brecha' },
    { mal: /android:allowBackup="true"/, msg: 'allowBackup=true: los datos de la app entran en copias de seguridad', nivel: 'advertencia' },
  ];
  for (const c of comprobaciones) {
    if (c.mal.test(manifest)) informe.agregar(c.nivel, c.msg, { archivo: 'android/app/src/main/AndroidManifest.xml', solucion: 'Desactivar esa opción para la build de producción.' });
  }
  if (!/android:allowBackup/.test(manifest)) informe.agregar('advertencia', 'no se declara android:allowBackup (por defecto true)', { archivo: 'AndroidManifest.xml', solucion: 'Declararlo en false salvo que se use respaldo cifrado.' });
  else if (/android:allowBackup="false"/.test(manifest)) informe.ok('allowBackup=false');
  if (!/usesCleartextTraffic="true"/.test(manifest) && !comprobaciones[0].mal.test(manifest)) informe.ok('sin cleartext ni debuggable en el manifest');
}
const capacitor = leerSeguro('ciudad-alerta-app/capacitor.config.ts');
if (capacitor) {
  if (/allowMixedContent:\s*true/.test(capacitor)) informe.agregar('brecha', 'capacitor: allowMixedContent=true (contenido mixto HTTP/HTTPS)', { archivo: 'capacitor.config.ts', solucion: 'Mantenerlo en false.' });
  else informe.ok('capacitor: allowMixedContent en false');
  if (/cleartext:\s*true/.test(capacitor)) informe.agregar('brecha', 'capacitor server.cleartext=true', { archivo: 'capacitor.config.ts' });
  if (/url:\s*['"]http:\/\//.test(capacitor) || /allowNavigation/.test(capacitor)) informe.agregar('advertencia', 'capacitor: server.url/allowNavigation configurado (¿quedó un live-reload?)', { archivo: 'capacitor.config.ts' });
  if (/androidScheme:\s*['"]https['"]/.test(capacitor)) informe.ok('capacitor: androidScheme=https');
}

// ════════════════════════════════════════════════════════════════════════════
// G · Cabeceras de seguridad (CSP)
// ════════════════════════════════════════════════════════════════════════════
informe.seccion('G · Cabeceras de seguridad');
const indexHtml = leerSeguro('ciudad-alerta-app/src/index.html') ?? '';
if (/content-security-policy/i.test(indexHtml)) informe.ok('index.html declara una Content-Security-Policy');
else informe.agregar('advertencia', 'no hay Content-Security-Policy en index.html', {
  archivo: 'src/index.html',
  detalle: 'Hay un <script> en línea (tema) que una CSP estricta exigiría cubrir con hash o nonce.',
  solucion: 'Agregar una CSP (meta http-equiv o cabecera del hosting) acorde a los orígenes de Firebase/OSM.',
});

// ════════════════════════════════════════════════════════════════════════════
// H · npm audit (opcional)
// ════════════════════════════════════════════════════════════════════════════
informe.seccion('H · Dependencias vulnerables (npm audit)');
if (!CON_AUDIT) {
  informe.agregar('info', 'omitido: usa --audit para correr npm audit (necesita red)');
} else {
  for (const paquete of ['ciudad-alerta-app', 'comun', 'servicio-privacidad']) {
    const dir = join(RAIZ, paquete);
    if (!existsSync(join(dir, 'package.json'))) continue;
    const r = spawnSync('npm', ['audit', '--json', '--omit=dev'], { cwd: dir, encoding: 'utf8', shell: ES_WINDOWS, maxBuffer: 64 * 1024 * 1024 });
    try {
      const j = JSON.parse(r.stdout || '{}');
      const v = j.metadata?.vulnerabilities ?? {};
      const total = (v.critical ?? 0) + (v.high ?? 0) + (v.moderate ?? 0) + (v.low ?? 0);
      if (!total) { informe.ok(`${paquete}: sin vulnerabilidades reportadas`); continue; }
      const nivel = (v.critical || v.high) ? 'brecha' : 'advertencia';
      informe.agregar(nivel, `${paquete}: ${v.critical ?? 0} críticas, ${v.high ?? 0} altas, ${v.moderate ?? 0} moderadas, ${v.low ?? 0} bajas`, {
        solucion: 'Revisar con npm audit y actualizar o fijar las dependencias afectadas.',
      });
    } catch {
      informe.agregar('info', `${paquete}: no se pudo leer la salida de npm audit (¿sin red o sin lockfile?)`);
    }
  }
}

// ════════════════════════════════════════════════════════════════════════════
// I · Almacenamiento local y PII en logs
// ════════════════════════════════════════════════════════════════════════════
informe.seccion('I · localStorage y PII en logs');
let logsPII = 0;
for (const ruta of rastreados) {
  if (!/\.(ts|js|mjs)$/.test(ruta) || /\.spec\.|node_modules|\/dist\/|\/www\//.test(ruta)) continue;
  if (gitRoot && !/^(?:ciudad-alerta-app\/src|servicio-privacidad\/src|comun\/src)\//.test(ruta)) continue;
  const texto = leerSeguro(ruta);
  if (texto == null) continue;
  for (const m of texto.matchAll(/console\.(?:log|info|debug|warn|error)\s*\([^)]*?\b(token|password|contrase[nñ]a|email|correo|uid|idToken|accessToken)\b/gi)) {
    logsPII++;
    const linea = texto.slice(0, m.index).split('\n').length;
    informe.agregar('advertencia', `console.* con posible dato sensible («${m[1]}»)`, {
      archivo: ruta, linea,
      solucion: 'No registrar tokens ni datos personales; dejar solo identificadores no sensibles.',
    });
    break; // uno por archivo basta para avisar
  }
}
if (!logsPII) informe.ok('no se detectaron logs con tokens ni datos personales');

process.exitCode = informe.cerrar(APP, 'cliente.md');
