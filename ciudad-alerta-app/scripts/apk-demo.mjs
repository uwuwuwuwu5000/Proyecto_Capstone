#!/usr/bin/env node
/**
 * Genera el APK de demostración de Ciudad Alerta, firmado con la clave del
 * equipo, en un solo comando:
 *
 *   node scripts/apk-demo.mjs                  # verifica, sube la versión y compila
 *   node scripts/apk-demo.mjs --solo-verificar # solo revisa que todo esté listo
 *   node scripts/apk-demo.mjs --sin-subir      # recompila sin cambiar versionCode
 *
 * Pasos:
 *   1. Verifica configuración de producción, modelos de privacidad, límites
 *      comunales, clave de firma y Java.
 *   2. Sube versionCode en android/app/build.gradle y escribe
 *      src/environments/version.ts (lo muestra la app).
 *   3. ng build (producción) → npx cap sync android → gradlew assembleRelease.
 *   4. Copia el APK a apk-demo/ con la versión en el nombre e imprime su SHA-256.
 *
 * Si algo falla después del paso 2, deja build.gradle y version.ts como estaban.
 *
 * Por qué firmar con una clave del equipo y no usar el APK de depuración: cada
 * computador tiene su propia clave de depuración. Si Rodrigo compila la v1 y
 * Claudio la v2, el teléfono rechaza la actualización ("La app no se instaló")
 * y el tester tiene que desinstalar y perder su sesión. Con una sola clave
 * compartida, cualquier integrante puede publicar una versión nueva encima.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const ES_WINDOWS = process.platform === 'win32';
const SOLO_VERIFICAR = process.argv.includes('--solo-verificar');
const SIN_SUBIR = process.argv.includes('--sin-subir');

const ruta = (...partes) => join(RAIZ, ...partes);
const leer = (p) => readFileSync(p, 'utf8');

const problemas = [];
const avisos = [];
const ok = (texto) => console.log(`  ✓ ${texto}`);
const mal = (texto) => { problemas.push(texto); console.log(`  ✖ ${texto}`); };
const ojo = (texto) => { avisos.push(texto); console.log(`  ⚠ ${texto}`); };

console.log('\nCiudad Alerta · APK de demostración\n');

// ── 1. Configuración de producción ──────────────────────────────────────────
console.log('Configuración de Firebase (environment.prod.ts)');
const envProd = ruta('src', 'environments', 'environment.prod.ts');
const envDev = ruta('src', 'environments', 'environment.ts');
let projectId = null;
if (!existsSync(envProd)) {
  mal('No existe src/environments/environment.prod.ts.');
} else {
  const texto = leer(envProd);
  projectId = texto.match(/projectId:\s*['"]([^'"]+)['"]/)?.[1] ?? null;
  if (/REEMPLAZA|000000000000/.test(texto)) {
    mal('environment.prod.ts todavía tiene valores de ejemplo. Copia el bloque firebase de environment.ts.');
  } else {
    ok(`Proyecto de Firebase: ${projectId}`);
  }
  if (/useEmulators:\s*true/.test(texto)) {
    mal('useEmulators está en true en producción: el APK intentaría conectarse a tu computador.');
  } else {
    ok('Emuladores desactivados');
  }
  if (existsSync(envDev)) {
    const projectDev = leer(envDev).match(/projectId:\s*['"]([^'"]+)['"]/)?.[1];
    if (projectDev && projectId && projectDev !== projectId) {
      ojo(`environment.ts usa "${projectDev}" y producción "${projectId}". El APK usará "${projectId}".`);
    }
  }
}

// ── Modelos de privacidad ───────────────────────────────────────────────────
console.log('\nModelos de privacidad (src/assets/models)');
const BYTES_POR_TIPO = { float32: 4, int32: 4, bool: 1, uint8: 1, uint16: 2, float16: 2 };
for (const [nombre, carpeta] of [
  ['Detector de personas', 'coco-ssd'],
  ['Detector de rostros', 'face-detection'],
]) {
  const dir = ruta('src', 'assets', 'models', carpeta);
  const manifiesto = join(dir, 'model.json');
  if (!existsSync(manifiesto)) {
    mal(`${nombre}: falta ${carpeta}/model.json. Ejecuta: node scripts/descargar-modelos-privacidad.mjs`);
    continue;
  }
  try {
    const modelo = JSON.parse(leer(manifiesto));
    let completo = true;
    for (const grupo of modelo.weightsManifest ?? []) {
      const esperado = grupo.weights.reduce((t, p) => {
        const n = p.shape.reduce((a, b) => a * b, 1);
        return t + n * (BYTES_POR_TIPO[p.quantization?.dtype ?? p.dtype] ?? 4);
      }, 0);
      const real = grupo.paths.reduce((t, archivo) => {
        const p = join(dir, archivo);
        return t + (existsSync(p) ? statSync(p).size : 0);
      }, 0);
      if (real !== esperado) completo = false;
    }
    completo
      ? ok(`${nombre} completo`)
      : mal(`${nombre}: pesos incompletos o corruptos. Borra la carpeta ${carpeta} y vuelve a descargar.`);
  } catch {
    mal(`${nombre}: model.json no es válido. Borra la carpeta ${carpeta} y vuelve a descargar.`);
  }
}

// ── Límites comunales ───────────────────────────────────────────────────────
console.log('\nLímites comunales (src/assets/geo)');
const faltanRegiones = [];
for (let r = 1; r <= 16; r++) {
  const archivo = `region-${String(r).padStart(2, '0')}.geojson`;
  if (!existsSync(ruta('src', 'assets', 'geo', archivo))) faltanRegiones.push(archivo);
}
if (!existsSync(ruta('src', 'assets', 'geo', 'indice.json'))) faltanRegiones.unshift('indice.json');
faltanRegiones.length
  ? mal(`Faltan archivos de límites: ${faltanRegiones.join(', ')}. Sin ellos los reportes caen en el organismo genérico.`)
  : ok('indice.json y las 16 regiones presentes');

// ── Proyecto Android ────────────────────────────────────────────────────────
console.log('\nProyecto Android');
const gradleApp = ['build.gradle', 'build.gradle.kts']
  .map((f) => ruta('android', 'app', f))
  .find(existsSync);
let versionCodeActual = null;
let versionNameActual = null;
if (!gradleApp) {
  mal('No existe android/app/build.gradle. Ejecuta: npx cap add android');
} else {
  const texto = leer(gradleApp);
  versionCodeActual = Number(texto.match(/versionCode\s*=?\s*(\d+)/)?.[1] ?? NaN);
  versionNameActual = texto.match(/versionName\s*=?\s*["']([^"']*)["']/)?.[1] ?? null;
  const appId = texto.match(/applicationId\s*=?\s*["']([^"']+)["']/)?.[1];
  Number.isFinite(versionCodeActual)
    ? ok(`applicationId ${appId ?? '—'} · versionCode ${versionCodeActual} · versionName ${versionNameActual}`)
    : mal('No se encontró versionCode en build.gradle.');
}

// ── Clave de firma ──────────────────────────────────────────────────────────
console.log('\nClave de firma (keystore.properties)');
const propsArchivo = ruta('keystore.properties');
const firma = {};
if (!existsSync(propsArchivo)) {
  mal('Falta keystore.properties en la raíz del proyecto. Revisa GUIA_APK_DEMO.md, paso 1.');
} else {
  for (const linea of leer(propsArchivo).split(/\r?\n/)) {
    const i = linea.indexOf('=');
    if (i > 0 && !linea.trimStart().startsWith('#')) firma[linea.slice(0, i).trim()] = linea.slice(i + 1).trim();
  }
  const faltan = ['storeFile', 'storePassword', 'keyAlias', 'keyPassword'].filter((k) => !firma[k]);
  if (faltan.length) {
    mal(`keystore.properties no tiene: ${faltan.join(', ')}`);
  } else if (!existsSync(firma.storeFile)) {
    mal(`No existe la clave ${firma.storeFile}. Pídela al equipo o créala (GUIA_APK_DEMO.md, paso 1).`);
  } else if (![firma.storePassword, firma.keyPassword].every((c) => /^[A-Za-z0-9._@+-]+$/.test(c))) {
    mal('Las contraseñas de la clave solo pueden tener letras, números y . _ @ + - (cmd rompe los demás símbolos).');
  } else {
    ok(`Clave ${firma.storeFile} · alias ${firma.keyAlias}`);
  }
}

// ── Java ────────────────────────────────────────────────────────────────────
console.log('\nJava para Gradle');
// Gradle 8 (el de Capacitor 8) corre con Java 17 a 21. Con un JDK más nuevo
// falla con "Unsupported class file major version 69" (69 = Java 25). Por eso
// se prefiere el Java que trae Android Studio, que siempre es compatible.
const entorno = { ...process.env };
const JAVA_MIN = 17;
const JAVA_MAX = 21;

function versionJava(home) {
  const java = join(home, 'bin', ES_WINDOWS ? 'java.exe' : 'java');
  if (!existsSync(java)) return null;
  const r = spawnSync(java, ['-version'], { encoding: 'utf8' });
  const texto = `${r.stderr ?? ''}${r.stdout ?? ''}`;
  const v = texto.match(/version "(\d+)(?:\.(\d+))?/);
  if (!v) return null;
  return v[1] === '1' ? Number(v[2]) : Number(v[1]); // "1.8" → 8
}

const candidatosJava = [
  ['Android Studio', 'C:\\Program Files\\Android\\Android Studio\\jbr'],
  ['Android Studio (Toolbox)', join(process.env.LOCALAPPDATA ?? '', 'Programs', 'Android Studio', 'jbr')],
  ['Android Studio (macOS)', '/Applications/Android Studio.app/Contents/jbr/Contents/Home'],
  ['Android Studio (Linux)', '/opt/android-studio/jbr'],
  ['JAVA_HOME', process.env.JAVA_HOME ?? ''],
].filter(([, home]) => home && existsSync(home));

const descartados = [];
const elegido = candidatosJava.find(([origen, home]) => {
  const v = versionJava(home);
  if (v !== null && v >= JAVA_MIN && v <= JAVA_MAX) return true;
  descartados.push(`${origen} (${home}) = Java ${v ?? '?'}`);
  return false;
});

if (elegido) {
  entorno.JAVA_HOME = elegido[1];
  ok(`Java ${versionJava(elegido[1])} de ${elegido[0]} (${elegido[1]})`);
  if (process.env.JAVA_HOME && process.env.JAVA_HOME !== elegido[1]) {
    ojo(`Tu JAVA_HOME (${process.env.JAVA_HOME}) no se usa para este build: Gradle necesita Java ${JAVA_MIN}–${JAVA_MAX}.`);
  }
} else {
  mal(
    `No se encontró Java ${JAVA_MIN}–${JAVA_MAX} para Gradle.` +
      (descartados.length ? ` Revisados: ${descartados.join('; ')}.` : '') +
      ' Instala Android Studio o define JAVA_HOME con un JDK 21.',
  );
}

// ── Resultado de la verificación ────────────────────────────────────────────
console.log('');
if (problemas.length) {
  console.log(`✖ ${problemas.length} problema(s) impiden generar el APK. Corrígelos y vuelve a ejecutar.\n`);
  process.exit(1);
}
if (SOLO_VERIFICAR) {
  console.log('✓ Todo listo para generar el APK.\n');
  process.exit(0);
}

// ── 2. Versión ──────────────────────────────────────────────────────────────
const paquete = JSON.parse(leer(ruta('package.json')));
const versionName = paquete.version && paquete.version !== '0.0.1' ? paquete.version : versionNameActual ?? '0.1.0';
const versionCode = SIN_SUBIR ? versionCodeActual : versionCodeActual + 1;
const fecha = new Date().toISOString();

const versionTs = ruta('src', 'environments', 'version.ts');
const respaldo = {
  [gradleApp]: leer(gradleApp),
  [versionTs]: existsSync(versionTs) ? leer(versionTs) : null,
};
function restaurar() {
  for (const [archivo, contenido] of Object.entries(respaldo)) {
    if (contenido !== null) writeFileSync(archivo, contenido);
  }
  console.log('  (build.gradle y version.ts quedaron como estaban)');
}

writeFileSync(
  gradleApp,
  respaldo[gradleApp]
    .replace(/(versionCode\s*=?\s*)\d+/, `$1${versionCode}`)
    .replace(/(versionName\s*=?\s*)["'][^"']*["']/, `$1"${versionName}"`),
);
writeFileSync(
  versionTs,
  `// Generado por scripts/apk-demo.mjs. No editar a mano.\n` +
    `export const VERSION_APP = {\n` +
    `  nombre: '${versionName}',\n` +
    `  codigo: ${versionCode},\n` +
    `  fecha: '${fecha}' as string | null,\n` +
    `  demo: true,\n` +
    `};\n`,
);
console.log(`Versión ${versionName} (${versionCode})\n`);

// ── 3. Compilación ──────────────────────────────────────────────────────────
function ejecutar(titulo, comando, args, cwd = RAIZ) {
  console.log(`▶ ${titulo}`);
  const r = ES_WINDOWS
    ? spawnSync([comando, ...args.map((a) => (/[\s=:\\]/.test(a) ? `"${a}"` : a))].join(' '), {
        cwd, env: entorno, stdio: 'inherit', shell: true,
      })
    : spawnSync(comando, args, { cwd, env: entorno, stdio: 'inherit' });
  if (r.status !== 0) {
    console.error(`\n✖ Falló: ${titulo}`);
    restaurar();
    process.exit(1);
  }
}

ejecutar('Compilando la app web (producción)', 'npx', ['ng', 'build', '--configuration', 'production']);
ejecutar('Copiando a Android', 'npx', ['cap', 'sync', 'android']);
ejecutar(
  'Compilando y firmando el APK',
  ES_WINDOWS ? 'gradlew.bat' : './gradlew',
  [
    'assembleRelease',
    '--console=plain',
    `-Pandroid.injected.signing.store.file=${firma.storeFile}`,
    `-Pandroid.injected.signing.store.password=${firma.storePassword}`,
    `-Pandroid.injected.signing.key.alias=${firma.keyAlias}`,
    `-Pandroid.injected.signing.key.password=${firma.keyPassword}`,
  ],
  ruta('android'),
);

// ── 4. Entrega ──────────────────────────────────────────────────────────────
const apk = ruta('android', 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk');
if (!existsSync(apk)) {
  console.error('\n✖ Gradle terminó, pero no apareció app-release.apk (¿quedó sin firmar?).');
  restaurar();
  process.exit(1);
}
mkdirSync(ruta('apk-demo'), { recursive: true });
const destino = ruta('apk-demo', `CiudadAlerta-${versionName}-${versionCode}.apk`);
copyFileSync(apk, destino);
const bytes = readFileSync(destino);
const sha = createHash('sha256').update(bytes).digest('hex');

console.log(`\n✓ APK listo: ${destino}`);
console.log(`  Tamaño: ${(bytes.length / 1024 / 1024).toFixed(1)} MB`);
console.log(`  SHA-256: ${sha}`);
if (avisos.length) console.log(`  Avisos: ${avisos.length} (revisa arriba)`);
console.log('\nRecuerda hacer commit de android/app/build.gradle para que el siguiente build parta de esta versión.\n');
