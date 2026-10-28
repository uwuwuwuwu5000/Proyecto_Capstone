#!/usr/bin/env node
/**
 * Suite de pruebas de seguridad de las reglas de Firestore de Ciudad Alerta.
 *
 * Complementa a reglas.mjs: mientras aquel comprueba los flujos conocidos,
 * este intenta ACTIVAMENTE romper las reglas, documento por documento, para
 * encontrar huecos que se nos hayan pasado. Todo corre sobre un proyecto de
 * prueba; nunca toca el proyecto real.
 *
 * Dos modos de ejecución:
 *
 *   # Por defecto: simulador de reglas (no necesita Java ni Firebase CLI)
 *   npm run diagnostico:ataques
 *   node scripts/diagnostico/reglas-ataques.mjs
 *
 *   # Emulador real de Firestore (Java + firebase-tools), más fiel
 *   node scripts/diagnostico/reglas-ataques.mjs --emulador
 *
 * El simulador es una APROXIMACIÓN de las reglas (ver simulador/interprete.mjs):
 * lo que encuentre conviene confirmarlo en el emulador antes de darlo por cierto.
 * El informe deja claro con qué motor se obtuvo cada resultado.
 *
 * Secciones del informe (diagnostico/reglas-ataques.md):
 *   A · Matriz de acceso        rol × colección × operación contra lo esperado.
 *   B · Ataques dirigidos       intentos concretos de brecha, con impacto y arreglo.
 *   C · Mutaciones generadas    variaciones automáticas de escrituras válidas.
 *   D · Lecturas por operación   cuántos documentos lee cada regla (solo simulador).
 *   E · Revisión estática        funciones sin usar, creaciones sin hasOnly, PII en list.
 *   F · Flujos reales            lo que escriben hoy la app y el portal: debe pasar.
 *   G · Unidad de size()         si las reglas cuentan UTF-16, bytes o puntos de código.
 *
 * Solo una operación que de verdad se hace cuenta como brecha: un rechazo por
 * otro motivo (p. ej. el límite de 1 MiB) no lo es.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { Informe } from './comun.mjs';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = resolve(AQUI, '..', '..');
const PROYECTO = 'demo-ciudad-alerta';
const ES_WINDOWS = process.platform === 'win32';
const USAR_EMULADOR = process.argv.includes('--emulador');

// ── Fuera del motor: lo arranca y se vuelve a ejecutar dentro ────────────────
if (!process.env.FIRESTORE_EMULATOR_HOST) {
  if (USAR_EMULADOR) {
    console.log('\nCiudad Alerta · ataques a las reglas (emulador real)');
    const version = spawnSync('firebase', ['--version'], { encoding: 'utf8', shell: ES_WINDOWS });
    if (version.status !== 0) {
      console.error('\n✖ No se encontró Firebase CLI. Instálalo con:\n  npm install -g firebase-tools\n');
      process.exit(1);
    }
    const java = spawnSync('java', ['-version'], { encoding: 'utf8', shell: ES_WINDOWS });
    const mayor = Number(`${java.stderr}${java.stdout}`.match(/version "(\d+)/)?.[1]);
    if (!mayor) {
      console.error('\n✖ No se encontró Java. El emulador lo necesita: winget install EclipseAdoptium.Temurin.21.JDK\n');
      process.exit(1);
    }
    console.log(`  Firebase CLI ${version.stdout.trim()} · Java ${mayor} · levantando el emulador…\n`);
    const interno = 'node scripts/diagnostico/reglas-ataques.mjs --emulador';
    const r = spawnSync(
      ES_WINDOWS ? `firebase emulators:exec --only firestore --project ${PROYECTO} "${interno}"` : 'firebase',
      ES_WINDOWS ? [] : ['emulators:exec', '--only', 'firestore', '--project', PROYECTO, interno],
      { cwd: RAIZ, stdio: 'inherit', shell: ES_WINDOWS },
    );
    process.exit(r.status ?? 1);
  }

  // Simulador: se recarga con el gancho que resuelve firebase/firestore al simulador.
  console.log('\nCiudad Alerta · ataques a las reglas (simulador, sin Java)');
  console.log('  Para confirmar con el emulador real: node scripts/diagnostico/reglas-ataques.mjs --emulador\n');
  const registrar = pathToFileURL(join(AQUI, 'simulador', 'registrar.mjs')).href;
  const r = spawnSync(process.execPath, ['--import', registrar, fileURLToPath(import.meta.url)], {
    cwd: RAIZ,
    stdio: 'inherit',
    env: { ...process.env, FIRESTORE_EMULATOR_HOST: 'simulador:0', CA_SIMULADOR: '1' },
  });
  process.exit(r.status ?? 1);
}

// ── Dentro del motor (simulador o emulador) ──────────────────────────────────
const requerir = createRequire(join(RAIZ, 'package.json'));
let rut;
try {
  rut = await import('@firebase/rules-unit-testing');
} catch {
  let mayor = '?';
  try {
    mayor = JSON.parse(readFileSync(requerir.resolve('firebase/package.json'), 'utf8')).version.split('.')[0];
  } catch {
    /* firebase no instalado */
  }
  const compatible = { 10: 3, 11: 4, 12: 5, 13: 6 }[mayor];
  console.error(
    `\n✖ Falta @firebase/rules-unit-testing. Con firebase ${mayor}.x instala:\n` +
      `  npm install -D @firebase/rules-unit-testing${compatible ? `@${compatible}` : ''}\n`,
  );
  process.exit(2);
}

const fs = await import('firebase/firestore');
const ES_SIMULADOR = fs.__esSimulador === true;
if (fs.setLogLevel) fs.setLogLevel('silent');

const { initializeTestEnvironment, assertFails, assertSucceeds } = rut;
const { doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, collection, query, where, writeBatch, serverTimestamp, Timestamp } = fs;

const reglasTexto = readFileSync(join(RAIZ, 'firestore.rules'), 'utf8');
const correosAdmin = [
  ...(reglasTexto.match(/request\.auth\.token\.email\s+in\s+\[([\s\S]*?)\]/)?.[1] ?? '').matchAll(/'([^']+)'/g),
].map((m) => m[1]);

const [host, puerto] = process.env.FIRESTORE_EMULATOR_HOST.split(':');
const entorno = await initializeTestEnvironment({
  projectId: PROYECTO,
  firestore: { rules: reglasTexto, host: host === '0.0.0.0' ? '127.0.0.1' : host, port: Number(puerto) },
});

// ── Datos de prueba ──────────────────────────────────────────────────────────
const MAIPU = { id: 'muni_13119', nombre: 'Municipalidad de Maipú', tipo: 'municipio', comuna: 'Maipú' };
const PUDAHUEL = { id: 'muni_13124', nombre: 'Municipalidad de Pudahuel', tipo: 'municipio', comuna: 'Pudahuel' };
const DOS_DIAS = 2 * 86_400_000;
const UNA_HORA = 3_600_000;

const perfil = (uid, nombre, rol = 'ciudadano', extra = {}) => ({
  uid,
  email: `${uid}@correo.cl`,
  displayName: nombre,
  role: rol,
  trustLevel: 0,
  validatedReports: 0,
  emailVerified: true,
  ...extra,
});

const reporte = (uid, nombre, extra = {}) => ({
  uid,
  autorNombre: nombre,
  estado: 'reportado',
  confirmaciones: 0,
  descripcion: 'Hay un bache profundo frente al paradero',
  categoria: 'calle_deteriorada',
  ubicacion: { lat: -33.5108, lng: -70.7573, accuracy: 12 },
  geohash: '66jcfp',
  comuna: 'Maipú',
  region: 'Metropolitana de Santiago',
  comunaFuente: 'limites_oficiales',
  organismo: MAIPU,
  operadorId: 'op_maipu',
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp(),
  ...extra,
});

/** Siembra un escenario rico: usuarios de cada rol, reportes en cada estado, soporte, confianza, catálogos. */
async function sembrar() {
  await entorno.clearFirestore();
  await entorno.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const ahora = Timestamp.now();
    const antigua = { createdAt: Timestamp.fromMillis(Date.now() - DOS_DIAS) };
    const nueva = { createdAt: Timestamp.fromMillis(Date.now() - 2 * UNA_HORA) };

    const docs = {
      // Usuarios
      'users/ana': perfil('ana', 'Ana Pérez', 'ciudadano', antigua),
      'users/luis': perfil('luis', 'Luis Soto', 'ciudadano', antigua),
      'users/nueva': perfil('nueva', 'Cuenta Nueva', 'ciudadano', nueva),
      'users/opmaipu': perfil('opmaipu', 'Operador Maipú', 'operador', { operadorId: 'op_maipu', ...antigua }),
      'users/oppuda': perfil('oppuda', 'Operador Pudahuel', 'operador', { operadorId: 'op_pudahuel', ...antigua }),
      'users/admin': perfil('admin', 'Admin', 'admin', antigua),
      // Cuenta de organismo (1.2): solo ve los reportes validados de Maipú.
      'users/orgmaipu': perfil('orgmaipu', 'Municipalidad de Maipú', 'organismo', { organismoId: 'muni_13119', ...antigua }),
      // Organismos y operadores
      'organismos/muni_13119': { ...MAIPU, comunasAtendidas: ['13119'], codigoRegion: '13', region: 'Metropolitana', activo: true },
      'organismos/muni_13124': { ...PUDAHUEL, comunasAtendidas: ['13124'], codigoRegion: '13', region: 'Metropolitana', activo: true },
      'operadores/op_maipu': { id: 'op_maipu', nombre: 'Operador Maipú', organismoId: 'muni_13119', activo: true },
      'operadores/op_pudahuel': { id: 'op_pudahuel', nombre: 'Operador Pudahuel', organismoId: 'muni_13124', activo: true },
      // Catálogo de categorías: una activa, una inactiva
      'categorias/microbasural': { id: 'microbasural', nombre: 'Microbasural', orden: 1, activa: true, createdAt: ahora, updatedAt: ahora },
      'categorias/retirada': { id: 'retirada', nombre: 'Categoría retirada', orden: 9, activa: false, createdAt: ahora, updatedAt: ahora },
      // Reportes en varios estados
      'reports/r_ana': { ...reporte('ana', 'Ana Pérez'), createdAt: ahora, updatedAt: ahora },
      'reports/r_luis': {
        ...reporte('luis', 'Luis Soto', { comuna: 'Pudahuel', organismo: PUDAHUEL, operadorId: 'op_pudahuel' }),
        createdAt: ahora,
        updatedAt: ahora,
      },
      'reports/r_proceso': { ...reporte('ana', 'Ana Pérez', { estado: 'en_proceso' }), createdAt: ahora, updatedAt: ahora },
      'reports/r_cerrado': { ...reporte('ana', 'Ana Pérez', { estado: 'cerrado' }), createdAt: ahora, updatedAt: ahora },
      'reports/r_juzgado': {
        ...reporte('ana', 'Ana Pérez', { estado: 'resuelto', validacion: { puntos: 120, votos: 4, validado: true, veredicto: 'real', veredictoPor: 'admin' } }),
        createdAt: ahora,
        updatedAt: ahora,
      },
      'reports/r_conFoto': { ...reporte('ana', 'Ana Pérez', { foto: { kind: 'firestore', path: 'reportPhotos/r_conFoto', bytes: 12, privacidad: { aplicada: true, personas: 0, rostros: 0 } } }), createdAt: ahora, updatedAt: ahora },
      'reportPhotos/r_conFoto': { reportId: 'r_conFoto', ownerUid: 'ana', mimeType: 'image/jpeg', dataUrl: 'data:image/jpeg;base64,/9j/AAAA', createdAt: ahora },
      // Un reporte de Maipú validado por la comunidad, con foto (lo ve el organismo).
      'reports/r_validado': { ...reporte('luis', 'Luis Soto', { validacion: { puntos: 120, votos: 4, validado: true } }), createdAt: ahora, updatedAt: ahora },
      'reportPhotos/r_validado': { reportId: 'r_validado', ownerUid: 'luis', mimeType: 'image/jpeg', dataUrl: 'data:image/jpeg;base64,/9j/AAAA', createdAt: ahora },
      // Confirmaciones y contador
      'reports/r_ana/confirmations/luis': { uid: 'luis', reportId: 'r_ana', createdAt: ahora, nivel: 0, peso: 10 },
      // statusHistory
      'reports/r_ana/statusHistory/h0': { reportId: 'r_ana', desde: 'reportado', hacia: 'en_revision', autorUid: 'admin', autorRol: 'admin', autorNombre: 'Administración Ciudad Alerta', comentario: '', createdAt: ahora },
      // Confianza del autor
      'users/ana/confianza/actual': { puntosConfianza: 40, trustLevel: 1, validatedReports: 4, reportesFalsos: 0, confirmacionesSuspendidas: false, ultimoReporteId: 'r_viejo', updatedAt: ahora },
      // Soporte
      'supportTickets/t_luis': {
        uid: 'luis', autorNombre: 'Luis Soto', autorEmail: 'luis@prueba.cl', tipo: 'queja', estado: 'abierto', asignadoA: null,
        asunto: 'La app se cierra', lastMessagePreview: 'Al abrir el mapa', createdAt: ahora, lastMessageAt: ahora,
      },
      'supportTickets/t_luis/messages/m1': {
        ticketId: 't_luis', autorUid: 'luis', autorRol: 'ciudadano', texto: 'Al abrir el mapa se cierra', createdAt: ahora,
      },
    };
    for (const [ruta, datos] of Object.entries(docs)) await setDoc(doc(db, ruta), datos);
  });
}

const token = (uid, extra = {}) => ({ email: `${uid}@correo.cl`, email_verified: true, ...extra });
const como = (uid, extra = {}) => entorno.authenticatedContext(uid, token(uid, extra)).firestore();
const anonimo = () => entorno.unauthenticatedContext().firestore();

// ── Registro de resultados ─────────────────────────────────────────────────────
const informe = new Informe('Ataques a las reglas de seguridad · Ciudad Alerta');
let noEvaluables = 0;

/**
 * Resultado de una operación, sin depender del texto de assertFails:
 *   'permitido'  la escritura o lectura se hizo;
 *   'denegado'   las reglas la rechazaron (permission-denied);
 *   'otro'       la rechazó otra cosa (p. ej. el documento pasa de 1 MiB);
 *   'no_simulado' el simulador no sabe evaluarla.
 * Solo 'permitido' es una brecha en un ataque. En la corrida del emulador, un
 * documento de 2 MB salía como brecha porque assertFails trata cualquier error
 * que no sea permission-denied como un fallo de la prueba.
 */
async function resultadoDe(fn) {
  try {
    await fn();
    return { tipo: 'permitido' };
  } catch (error) {
    const codigo = String(error?.code ?? '').toLowerCase();
    const msg = (error?.message ?? String(error)).split('\n')[0];
    if (error?.name === 'NoSimulado' || /no simulad/i.test(msg)) return { tipo: 'no_simulado', msg };
    if (codigo === 'permission-denied' || /permission[_ ]denied/i.test(msg)) return { tipo: 'denegado', msg };
    return { tipo: 'otro', codigo: codigo || 'error', msg };
  }
}

/**
 * Ejecuta un intento de ataque.
 * @param {string} nombre     Qué intenta el atacante.
 * @param {() => Promise} fn  La operación. DEBE ser rechazada.
 * @param {object} meta       { impacto, solucion, preparar, nivel } — nivel 'advertencia'
 *                            para lo que es calidad de datos y no seguridad.
 */
async function ataque(nombre, fn, meta = {}) {
  await sembrar();
  if (meta.preparar) await entorno.withSecurityRulesDisabled((ctx) => meta.preparar(ctx.firestore()));
  const r = await resultadoDe(fn);
  if (r.tipo === 'denegado') informe.ok(nombre);
  else if (r.tipo === 'otro') informe.ok(`${nombre} (lo rechaza ${r.codigo}, no las reglas)`);
  else if (r.tipo === 'no_simulado') {
    noEvaluables++;
    informe.agregar('info', `${nombre}: no evaluable en el simulador`, { detalle: r.msg });
  } else {
    informe.agregar(meta.nivel ?? 'brecha', `${nombre}: las reglas lo PERMITEN`, {
      detalle: meta.impacto,
      solucion: meta.solucion ?? 'Endurecer la regla de esa colección.',
    });
  }
}

/** Como `ataque`, pero la operación DEBE funcionar: un flujo real de la app o del portal. */
async function permitido(nombre, fn, preparar) {
  await sembrar();
  if (preparar) await entorno.withSecurityRulesDisabled((ctx) => preparar(ctx.firestore()));
  const r = await resultadoDe(fn);
  if (r.tipo === 'permitido') informe.ok(nombre);
  else if (r.tipo === 'no_simulado') {
    noEvaluables++;
    informe.agregar('info', `${nombre}: no evaluable en el simulador`, { detalle: r.msg });
  } else {
    informe.agregar('error', `${nombre}: se rechaza un flujo legítimo`, {
      detalle: r.msg,
      solucion: 'Un usuario de la app o del portal recibiría un error: revisa el último cambio a firestore.rules.',
    });
  }
}

process.stdout.write(`\nMotor: ${ES_SIMULADOR ? 'SIMULADOR (aproximado)' : 'EMULADOR real'}\n`);

// ════════════════════════════════════════════════════════════════════════════
// SECCIÓN A · Matriz de acceso: rol × colección × operación
// ════════════════════════════════════════════════════════════════════════════
informe.seccion('A · Matriz de acceso (rol × colección × operación)');

/**
 * Para cada celda: ¿puede este rol hacer esta operación sobre esta ruta?
 * `esperado` = true si DEBE poder, false si DEBE ser denegado. Una discrepancia
 * se informa (brecha si permite lo que no debía; error si bloquea lo legítimo).
 */
const CELDAS = [
  // users: cada quien solo su propio documento
  ['ana lee su propio perfil', true, () => getDoc(doc(como('ana'), 'users/ana'))],
  ['ana lee el perfil de luis', false, () => getDoc(doc(como('ana'), 'users/luis'))],
  ['ana lista todos los perfiles', false, () => getDocs(collection(como('ana'), 'users'))],
  ['un operador lee el perfil de un ciudadano', false, () => getDoc(doc(como('opmaipu'), 'users/ana'))],
  ['un admin lee el perfil de un ciudadano', false, () => getDoc(doc(como('admin'), 'users/ana'))],
  ['anónimo lee un perfil', false, () => getDoc(doc(anonimo(), 'users/ana'))],
  // reports: lectura para autenticados, nada para anónimos
  ['ana lee un reporte', true, () => getDoc(doc(como('ana'), 'reports/r_luis'))],
  ['ana lista reportes', true, () => getDocs(collection(como('ana'), 'reports'))],
  ['anónimo lista reportes', false, () => getDocs(collection(anonimo(), 'reports'))],
  ['anónimo lee un reporte', false, () => getDoc(doc(anonimo(), 'reports/r_ana'))],
  // confirmations
  ['ana lee las confirmaciones de un reporte', true, () => getDocs(collection(como('ana'), 'reports/r_ana/confirmations'))],
  ['anónimo lee las confirmaciones', false, () => getDocs(collection(anonimo(), 'reports/r_ana/confirmations'))],
  // statusHistory
  ['ana lee el historial de un reporte', true, () => getDocs(collection(como('ana'), 'reports/r_ana/statusHistory'))],
  // confianza
  ['ana lee su propia confianza', true, () => getDoc(doc(como('ana'), 'users/ana/confianza/actual'))],
  ['luis lee la confianza de ana', false, () => getDoc(doc(como('luis'), 'users/ana/confianza/actual'))],
  ['un gestor lee la confianza de un ciudadano', true, () => getDoc(doc(como('opmaipu'), 'users/ana/confianza/actual'))],
  // limites
  ['luis lee el contador de confianza de ana', false, () => getDoc(doc(como('luis'), `users/ana/limites/0`))],
  // supportTickets
  ['luis lee su propio ticket', true, () => getDoc(doc(como('luis'), 'supportTickets/t_luis'))],
  ['ana lee el ticket de luis', false, () => getDoc(doc(como('ana'), 'supportTickets/t_luis'))],
  ['un gestor lee el ticket de un ciudadano', true, () => getDoc(doc(como('opmaipu'), 'supportTickets/t_luis'))],
  ['ana lista todos los tickets', false, () => getDocs(collection(como('ana'), 'supportTickets'))],
  ['luis lista sus tickets (filtro por uid)', true, () => getDocs(query(collection(como('luis'), 'supportTickets'), where('uid', '==', 'luis')))],
  ['ana lee los mensajes del ticket de luis', false, () => getDocs(collection(como('ana'), 'supportTickets/t_luis/messages'))],
  // catálogos
  ['ana lee el catálogo de organismos', true, () => getDocs(collection(como('ana'), 'organismos'))],
  ['ana lee el catálogo de categorías', true, () => getDocs(collection(como('ana'), 'categorias'))],
  ['ana lee el catálogo de operadores', true, () => getDocs(collection(como('ana'), 'operadores'))],
  ['anónimo lee el catálogo de organismos', false, () => getDocs(collection(anonimo(), 'organismos'))],
  // reportPhotos
  ['ana lee una foto de reporte', true, () => getDoc(doc(como('ana'), 'reportPhotos/r_conFoto'))],
  ['anónimo lee una foto de reporte', false, () => getDoc(doc(anonimo(), 'reportPhotos/r_conFoto'))],
  // Cuenta de organismo (1.2): solo lo validado de su municipalidad.
  ['el organismo lista los validados de su municipalidad', true, () =>
    getDocs(query(collection(como('orgmaipu'), 'reports'), where('organismo.id', '==', 'muni_13119'), where('validacion.validado', '==', true)))],
  ['el organismo lee un reporte validado de su municipalidad', true, () => getDoc(doc(como('orgmaipu'), 'reports/r_validado'))],
  ['el organismo lee la foto de un reporte validado', true, () => getDoc(doc(como('orgmaipu'), 'reportPhotos/r_validado'))],
  ['el organismo lista todos los reportes', false, () => getDocs(collection(como('orgmaipu'), 'reports'))],
  ['el organismo lee un reporte sin validar', false, () => getDoc(doc(como('orgmaipu'), 'reports/r_ana'))],
  ['el organismo lee la foto de un reporte sin validar', false, () => getDoc(doc(como('orgmaipu'), 'reportPhotos/r_conFoto'))],
  ['el organismo lee las confirmaciones de un reporte sin validar', false, () => getDocs(collection(como('orgmaipu'), 'reports/r_ana/confirmations'))],
  ['el organismo lee un reporte validado de otra municipalidad', false, () => getDoc(doc(como('orgmaipu'), 'reports/r_luis'))],
  ['el organismo lee la confianza de un vecino', false, () => getDoc(doc(como('orgmaipu'), 'users/ana/confianza/actual'))],
  ['el organismo lee un ticket ajeno', false, () => getDoc(doc(como('orgmaipu'), 'supportTickets/t_luis'))],
];

for (const [nombre, esperado, fn] of CELDAS) {
  await sembrar();
  try {
    await fn();
    if (esperado) informe.ok(`permite · ${nombre}`);
    else informe.agregar('brecha', `permite lo que NO debía · ${nombre}`, { solucion: 'Revisar la regla de lectura de esa colección.' });
  } catch (error) {
    const msg = (error?.message ?? String(error)).split('\n')[0];
    if (/no simulad|NoSimulado/i.test(msg)) {
      noEvaluables++;
      informe.agregar('info', `no evaluable · ${nombre}`, { detalle: msg });
    } else if (esperado) {
      informe.agregar('error', `bloquea lo legítimo · ${nombre}`, { detalle: msg, solucion: 'Un usuario legítimo recibe «permiso denegado».' });
    } else {
      informe.ok(`deniega · ${nombre}`);
    }
  }
}

// ════════════════════════════════════════════════════════════════════════════
// SECCIÓN B · Ataques dirigidos
// ════════════════════════════════════════════════════════════════════════════
informe.seccion('B · Ataques dirigidos a cada colección');

// ── B.1 · Perfil de usuario (users) ──────────────────────────────────────────
await ataque('users: ana se sube el nivel de confianza', () =>
  updateDoc(doc(como('ana'), 'users/ana'), { trustLevel: 9 }),
  { impacto: 'El atacante gana peso de confirmación sin ganárselo.' });
await ataque('users: ana se declara admin', () =>
  updateDoc(doc(como('ana'), 'users/ana'), { role: 'admin' }),
  { impacto: 'Toma de control: gestionar reportes, catálogos y veredictos.' });
await ataque('users: ana se declara operador con un operadorId', () =>
  updateDoc(doc(como('ana'), 'users/ana'), { role: 'operador', operadorId: 'op_maipu' }),
  { impacto: 'Gestiona reportes de una municipalidad que no le corresponde.' });
await ataque('users: ana infla validatedReports', () =>
  updateDoc(doc(como('ana'), 'users/ana'), { validatedReports: 99 }),
  { impacto: 'Falsea su reputación.' });
await ataque('users: ana suplanta el displayName de otra persona', () =>
  updateDoc(doc(como('ana'), 'users/ana'), { displayName: 'Luis Soto' }),
  { impacto: 'Suplantación visible en reportes y soporte. Las reglas no limitan el tamaño ni el contenido del displayName en update.',
    solucion: 'En users update, validar displayName is string y size() <= 60.' });
await ataque('users: ana se pone un displayName enorme (4000 caracteres)', () =>
  updateDoc(doc(como('ana'), 'users/ana'), { displayName: 'A'.repeat(4000) }),
  { impacto: 'Documento inflado / UI rota. users update no acota displayName.',
    solucion: 'Validar size() <= 60 en update, igual que autorNombre en reports.' });
await ataque('users: ana cambia su email a mano', () =>
  updateDoc(doc(como('ana'), 'users/ana'), { email: 'otra@correo.cl' }),
  { impacto: 'El email del perfil deja de coincidir con el de Auth; confunde al soporte.',
    solucion: 'En update, exigir que email no cambie o coincida con request.auth.token.email.' });
// El perfil parte sin verificar: si ya lo estuviera, escribir `true` no cambiaría nada
// (así salió como brecha en el emulador, con un caso mal planteado).
await ataque('users: ana se marca emailVerified sin estarlo', () =>
  updateDoc(doc(entorno.authenticatedContext('ana', token('ana', { email_verified: false })).firestore(), 'users/ana'), { emailVerified: true }),
  {
    impacto: 'Gana peso de confirmación (requiere correo verificado) sin verificar.',
    preparar: (db) => updateDoc(doc(db, 'users/ana'), { emailVerified: false }),
  });
await ataque('users: ana se cambia el operadorId', () =>
  updateDoc(doc(como('opmaipu'), 'users/opmaipu'), { operadorId: 'op_pudahuel' }),
  { impacto: 'Un operador gestionaría reportes de otra comuna.' });
await ataque('users (create): nace con trustLevel alto', () =>
  setDoc(doc(como('nuevo'), 'users/nuevo'), { ...perfil('nuevo', 'Nuevo', 'ciudadano', { trustLevel: 8 }), createdAt: serverTimestamp() }),
  { impacto: 'Reputación regalada al registrarse.' });
await ataque('users (create): nace con createdAt antiguo (cuenta "vieja" falsa)', () =>
  setDoc(doc(como('nuevo'), 'users/nuevo'), { ...perfil('nuevo', 'Nuevo'), createdAt: Timestamp.fromMillis(Date.now() - 30 * 86_400_000) }),
  { impacto: 'Salta el bloqueo antibot de cuentas nuevas (peso de confirmación y ubicación libre).' });
await ataque('users (create): nace con displayName de 10.000 caracteres', () =>
  setDoc(doc(como('nuevo'), 'users/nuevo'), { ...perfil('nuevo', 'A'.repeat(10000)), createdAt: serverTimestamp() }),
  { impacto: 'creacionConValoresIniciales solo exige displayName is string, sin tope de tamaño.',
    solucion: 'Validar displayName.size() <= 60 también al crear.' });
await ataque('users (create): nace con operadorId siendo ciudadano', () =>
  setDoc(doc(como('nuevo'), 'users/nuevo'), { ...perfil('nuevo', 'Nuevo'), operadorId: 'op_maipu', createdAt: serverTimestamp() }),
  { impacto: 'Un ciudadano arrastra un operadorId; si luego una regla asume que solo los operadores lo tienen, se abre un hueco.',
    solucion: 'Al crear un ciudadano, prohibir operadorId (hasOnly sin ese campo salvo rama operador).' });
await ataque('users (create): correo de la lista admin SIN verificar nace admin', () =>
  correosAdmin.length
    ? setDoc(doc(entorno.authenticatedContext('intruso', { email: correosAdmin.at(-1), email_verified: false }).firestore(), 'users/intruso'),
        { ...perfil('intruso', 'Intruso', 'admin'), email: correosAdmin.at(-1), emailVerified: false, createdAt: serverTimestamp() })
    : Promise.reject(new Error('sin lista admin')),
  { impacto: 'Cualquiera que registre primero un correo de la lista nacería admin.' });

// ── B.2 · Reportes (reports create) ──────────────────────────────────────────
await ataque('reports: nace con confirmaciones ya puestas', () =>
  setDoc(doc(como('ana'), 'reports/x'), reporte('ana', 'Ana Pérez', { confirmaciones: 50 })),
  { impacto: 'Reporte inflado de entrada.' });
await ataque('reports: nace ya resuelto', () =>
  setDoc(doc(como('ana'), 'reports/x'), reporte('ana', 'Ana Pérez', { estado: 'resuelto' })),
  { impacto: 'Salta el flujo de gestión.' });
await ataque('reports: a nombre de otro uid', () =>
  setDoc(doc(como('ana'), 'reports/x'), reporte('luis', 'Luis Soto')),
  { impacto: 'Reporte atribuido a otra persona.' });
await ataque('reports: firma con el nombre de otra persona', () =>
  setDoc(doc(como('ana'), 'reports/x'), reporte('ana', 'Luis Soto')),
  { impacto: 'Suplantación del autor.' });
await ataque('reports: campo extra inventado (validadoComunidad)', () =>
  setDoc(doc(como('ana'), 'reports/x'), reporte('ana', 'Ana Pérez', { validadoComunidad: true })),
  { impacto: 'La creación no tiene lista blanca (hasOnly): acepta cualquier campo extra.',
    solucion: 'En reports create: && request.resource.data.keys().hasOnly([...campos de la app...]).' });
await ataque('reports: nace con resueltoAt y tiempoResolucionMs prefijados', () =>
  setDoc(doc(como('ana'), 'reports/x'), reporte('ana', 'Ana Pérez', { resueltoAt: serverTimestamp(), tiempoResolucionMs: 0 })),
  { impacto: 'Falsea las métricas de tiempo de respuesta desde el minuto cero.',
    solucion: 'Lista blanca en create (hasOnly) que excluya los campos de resolución.' });
await ataque('reports: nace con retiradoPorAutor en true', () =>
  setDoc(doc(como('ana'), 'reports/x'), reporte('ana', 'Ana Pérez', { retiradoPorAutor: true })),
  { impacto: 'Marca de retiro falsa.', solucion: 'Lista blanca en create.' });
await ataque('reports: foto apunta a la foto de OTRO reporte', () =>
  setDoc(doc(como('ana'), 'reports/x'), reporte('ana', 'Ana Pérez', { foto: { kind: 'firestore', path: 'reportPhotos/r_conFoto', bytes: 12, privacidad: { aplicada: true } } })),
  { impacto: 'Reutiliza la imagen de otra persona sin subir ninguna propia. foto.path no se ata al reportId.',
    solucion: 'Exigir que foto.path == "reportPhotos/" + reportId cuando kind == firestore.' });
await ataque('reports: organismo con nombre falso (id válido, nombre cambiado)', () =>
  setDoc(doc(como('ana'), 'reports/x'), reporte('ana', 'Ana Pérez', { organismo: { ...MAIPU, nombre: 'Organismo Inventado' } })),
  { impacto: 'El reporte muestra un organismo con nombre arbitrario. Solo se valida organismo.id, no el resto del mapa.',
    solucion: 'Validar que organismo.nombre coincida con el del catálogo, o guardar solo organismo.id.' });
// Calidad de datos, no seguridad: la comuna es un nombre y el catálogo guarda
// códigos CUT, así que exigirlo en las reglas bloquearía reportes legítimos por
// una diferencia de escritura («Maipú» / «Maipu»). Queda como advertencia.
await ataque('reports: comuna que no corresponde al organismo', () =>
  setDoc(doc(como('ana'), 'reports/x'), reporte('ana', 'Ana Pérez', { comuna: 'Pudahuel', organismo: MAIPU })),
  { nivel: 'advertencia',
    impacto: 'Reporte con comuna y organismo incoherentes; ensucia estadísticas por comuna.',
    solucion: 'Revisarlo en los datos (datos.mjs) en vez de en las reglas.' });
await ataque('reports: un ciudadano marca su reporte como creado desde el portal', () =>
  setDoc(doc(como('ana'), 'reports/x'), reporte('ana', 'Ana Pérez', { origen: 'portal_admin' })),
  { impacto: 'El reporte aparecería como hecho por la administración.' });
await ataque('reports: ubicación con campos extra', () =>
  setDoc(doc(como('ana'), 'reports/x'), reporte('ana', 'Ana Pérez', { ubicacion: { lat: -33.5108, lng: -70.7573, accuracy: 12, verificadaPorMunicipio: true } })),
  { impacto: 'Campos inventados dentro de la ubicación.' });
await ataque('reports: foto de Cloud Storage de otra persona', () =>
  setDoc(doc(como('ana'), 'reports/x'), reporte('ana', 'Ana Pérez', { foto: { kind: 'cloud-storage', path: 'reports/luis/r_luis.jpg', url: null, mimeType: 'image/jpeg', sizeBytes: 12, privacidad: { aplicada: true } } })),
  { impacto: 'Reusar la imagen de otro reporte sin subir ninguna.' });
await permitido('reports (control): creación legítima sigue permitida', () =>
  setDoc(doc(como('ana'), 'reports/ok'), reporte('ana', 'Ana Pérez')));

// ── B.3 · Reportes (reports update) ──────────────────────────────────────────
await ataque('reports: el autor cambia el estado de su propio reporte', () =>
  updateDoc(doc(como('ana'), 'reports/r_ana'), { estado: 'resuelto', updatedAt: serverTimestamp() }),
  { impacto: 'Se auto-resuelve sin gestión.' });
await ataque('reports: un vecino edita la descripción ajena', () =>
  updateDoc(doc(como('luis'), 'reports/r_ana'), { descripcion: 'Texto cambiado por otra persona', updatedAt: serverTimestamp(), editadoAt: serverTimestamp() }),
  { impacto: 'Vandalismo del contenido.' });
await ataque('reports: el autor edita la descripción DESPUÉS de que lo confirmaron', () =>
  updateDoc(doc(como('ana'), 'reports/r_ana'), { descripcion: 'Contenido cambiado tras recibir confirmaciones', updatedAt: serverTimestamp(), editadoAt: serverTimestamp() }),
  { impacto: 'El reporte sigue en «reportado» aun con confirmaciones; el autor puede cambiar el texto por el que otros votaron (cambio de carnada).',
    solucion: 'Bloquear la edición del autor si validacion.votos > 0.',
    preparar: (db) => updateDoc(doc(db, 'reports/r_ana'), { validacion: { puntos: 30, votos: 3, validado: false } }) });
await ataque('reports: el autor borra un reporte', () =>
  deleteDoc(doc(como('ana'), 'reports/r_ana')),
  { impacto: 'Se pierde evidencia; solo un admin debe borrar.' });
// Con el formato antiguo (uid, reportId, createdAt), que sigue aceptado porque
// el portal lo escribe: el formato con peso ya fallaba por no llevar el contador.
await ataque('reports: confirmar un reporte ya cerrado', () =>
  setDoc(doc(como('luis'), 'reports/r_cerrado/confirmations/luis'), { uid: 'luis', reportId: 'r_cerrado', createdAt: serverTimestamp() }),
  { impacto: 'Se acumulan confirmaciones sobre casos cerrados; las reglas no miran el estado del reporte al confirmar.',
    solucion: 'En confirmations create, exigir que el reporte no esté resuelto ni cerrado.' });
await ataque('reports: confirmar un reporte ya resuelto con veredicto', () =>
  setDoc(doc(como('luis'), 'reports/r_juzgado/confirmations/luis'), { uid: 'luis', reportId: 'r_juzgado', createdAt: serverTimestamp() }),
  { impacto: 'Confirmaciones sobre un reporte ya resuelto con veredicto.',
    solucion: 'Rechazar confirmaciones si validacion.veredicto != null o estado cerrado/resuelto.' });
await ataque('reports: confirmar un reporte abierto que ya tiene veredicto', () =>
  setDoc(doc(como('luis'), 'reports/r_proceso/confirmations/luis'), { uid: 'luis', reportId: 'r_proceso', createdAt: serverTimestamp() }),
  { impacto: 'La app no lo permite (motivo «revisado»), pero las reglas sí.',
    solucion: 'Rechazar confirmaciones si validacion.veredicto != null.',
    preparar: (db) => updateDoc(doc(db, 'reports/r_proceso'), { validacion: { puntos: 0, votos: 0, validado: false, veredicto: 'falso', veredictoPor: 'admin' } }) });

// ── B.4 · statusHistory (bitácora) ────────────────────────────────────────────
await ataque('statusHistory: un ciudadano escribe una entrada', () =>
  setDoc(doc(como('ana'), 'reports/r_ana/statusHistory/falsa'), { reportId: 'r_ana', desde: 'reportado', hacia: 'resuelto', autorUid: 'ana', autorRol: 'ciudadano', comentario: '', createdAt: serverTimestamp() }),
  { impacto: 'Bitácora falsa.' });
await ataque('statusHistory: el gestor crea historial SIN cambiar el reporte en el lote', () =>
  setDoc(doc(como('opmaipu'), 'reports/r_ana/statusHistory/suelta'), { reportId: 'r_ana', desde: 'reportado', hacia: 'derivado', autorUid: 'opmaipu', autorRol: 'operador', autorNombre: 'Municipalidad de Maipú', comentario: '', createdAt: serverTimestamp() }),
  { impacto: 'La rama de gestor de statusHistory no exige que el reporte cambie de estado en el mismo lote: se puede fabricar una bitácora (y notificaciones asociadas) sin mover el reporte.',
    solucion: 'En la rama de gestor, exigir getAfter(report).estado == hacia, como ya hace la rama del autor.' });
await ataque('statusHistory: firmar un cambio a nombre de otra municipalidad', () =>
  setDoc(doc(como('opmaipu'), 'reports/r_ana/statusHistory/falsa2'), { reportId: 'r_ana', desde: 'reportado', hacia: 'derivado', autorUid: 'opmaipu', autorRol: 'operador', autorNombre: 'Municipalidad de Pudahuel', comentario: '', createdAt: serverTimestamp() }),
  { impacto: 'Firma de otra municipalidad.' });

// ── B.5 · Soporte (supportTickets) ────────────────────────────────────────────
await ataque('soporte: abrir un ticket con autorEmail de otra persona', () =>
  setDoc(doc(como('ana'), 'supportTickets/t_x'), { uid: 'ana', autorNombre: 'Ana', autorEmail: 'victima@correo.cl', tipo: 'queja', estado: 'abierto', asignadoA: null, asunto: 'Asunto de prueba', lastMessagePreview: 'hola', createdAt: serverTimestamp(), lastMessageAt: serverTimestamp() }),
  { impacto: 'autorEmail es libre: el soporte ve un correo que el ciudadano eligió, no el real. ticketValido() no valida autorEmail.',
    solucion: 'Exigir autorEmail == request.auth.token.email (o no guardarlo y leerlo del perfil).' });
await ataque('soporte: ticket con createdAt y lastMessageAt inventados', () =>
  setDoc(doc(como('ana'), 'supportTickets/t_y'), { uid: 'ana', tipo: 'queja', estado: 'abierto', asignadoA: null, asunto: 'Asunto de prueba', lastMessagePreview: 'hola', createdAt: Timestamp.fromMillis(0), lastMessageAt: Timestamp.fromMillis(0) }),
  { impacto: 'Fechas de soporte falseables; rompe el orden por actividad.',
    solucion: 'Exigir createdAt == request.time y lastMessageAt == request.time al crear.' });
await ataque('soporte: ciudadano escribe en el ticket de otro', () =>
  setDoc(doc(como('ana'), 'supportTickets/t_luis/messages/m2'), { ticketId: 't_luis', autorUid: 'ana', autorRol: 'ciudadano', texto: 'Mensaje intruso', createdAt: serverTimestamp() }),
  { impacto: 'Intromisión en la conversación de otra persona.' });
await ataque('soporte: ciudadano firma un mensaje como staff', () =>
  setDoc(doc(como('luis'), 'supportTickets/t_luis/messages/m2'), { ticketId: 't_luis', autorUid: 'luis', autorRol: 'staff', texto: 'Respuesta falsa del soporte', createdAt: serverTimestamp() }),
  { impacto: 'Suplantación del equipo de soporte.' });
await ataque('soporte: el staff firma un mensaje como ciudadano', () =>
  setDoc(doc(como('opmaipu'), 'supportTickets/t_luis/messages/m2'), { ticketId: 't_luis', autorUid: 'opmaipu', autorRol: 'ciudadano', texto: 'Me hago pasar por el ciudadano', createdAt: serverTimestamp() }),
  { impacto: 'El rol del mensaje (autorRol) no se compara con el rol real del gestor: un staff puede firmar como "ciudadano".',
    solucion: 'En messages create, exigir autorRol == rol real del autor (como en firmaHistorialValida).' });
await ataque('soporte: preview gigante al actualizar actividad', () =>
  updateDoc(doc(como('luis'), 'supportTickets/t_luis'), { lastMessagePreview: 'X'.repeat(5000), lastMessageAt: serverTimestamp() }),
  { impacto: 'actualizacionDeActividad no acota lastMessagePreview en update (sí en create). Documento inflado.',
    solucion: 'Validar lastMessagePreview.size() <= 100 también en update.' });
await ataque('soporte: el ciudadano se cierra el ticket solo', () =>
  updateDoc(doc(como('luis'), 'supportTickets/t_luis'), { estado: 'cerrado', updatedAt: serverTimestamp() }),
  { impacto: 'Cierra su propio caso saltándose al soporte.' });

// ── B.6 · reportPhotos ────────────────────────────────────────────────────────
await ataque('fotos: subir una foto sin reporte asociado', () =>
  setDoc(doc(como('ana'), 'reportPhotos/fantasma'), { reportId: 'fantasma', ownerUid: 'ana', mimeType: 'image/jpeg', dataUrl: 'data:image/jpeg;base64,/9j/AAAA' }),
  { impacto: 'Almacenamiento de imágenes sueltas (abuso del plan Spark). No se exige que el reporte exista.',
    solucion: 'Exigir existsAfter(reports/reportId) && getAfter(...).uid == request.auth.uid.' });
await ataque('fotos: el autor borra su foto tras publicar el reporte', () =>
  deleteDoc(doc(como('ana'), 'reportPhotos/r_conFoto')),
  { impacto: 'El reporte queda con foto.path colgando a una imagen borrada. El borrado solo mira ownerUid, no el estado del reporte.',
    solucion: 'Permitir borrar la foto solo si el reporte no existe o está cerrado/retirado.' });
await ataque('fotos: subir la foto de un reporte ajeno', () =>
  setDoc(doc(como('ana'), 'reportPhotos/r_luis'), { reportId: 'r_luis', ownerUid: 'ana', mimeType: 'image/jpeg', dataUrl: 'data:image/jpeg;base64,/9j/AAAA', createdAt: serverTimestamp() }),
  { impacto: 'Colgar una imagen en el reporte de otra persona.' });
// 960 KB: pasa el límite de 1 MiB de Firestore pero no el tope de 950 000 de la
// regla, así que prueba la regla (con 2 MB lo rechazaba Firestore antes).
await ataque('fotos: dataUrl sobre el tope de la regla (960 KB)', () => {
  const db = como('ana');
  const lote = writeBatch(db);
  lote.set(doc(db, 'reportPhotos/grande'), { reportId: 'grande', ownerUid: 'ana', mimeType: 'image/jpeg', dataUrl: 'data:image/jpeg;base64,' + 'A'.repeat(960_000), createdAt: serverTimestamp() });
  lote.set(doc(db, 'reports/grande'), reporte('ana', 'Ana Pérez', { foto: { kind: 'firestore', path: 'reportPhotos/grande', url: null, mimeType: 'image/jpeg', sizeBytes: 960_000, privacidad: { aplicada: true } } }));
  return lote.commit();
}, { impacto: 'Fotos más pesadas que lo que la app permite.' });

// ── B.7 · Catálogos (organismos, categorias, operadores) ──────────────────────
await ataque('catálogo: un ciudadano edita una municipalidad', () =>
  updateDoc(doc(como('ana'), 'organismos/muni_13119'), { nombre: 'Municipalidad Falsa' }),
  { impacto: 'Alteración del catálogo oficial.' });
await ataque('catálogo: un operador crea una categoría', () =>
  setDoc(doc(como('opmaipu'), 'categorias/inventada'), { id: 'inventada', nombre: 'Inventada', orden: 1, activa: true, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }),
  { impacto: 'Solo un admin administra el catálogo.' });
await ataque('catálogo: un ciudadano crea un operador', () =>
  setDoc(doc(como('ana'), 'operadores/op_falso'), { id: 'op_falso', nombre: 'Falso', organismoId: 'muni_13119', activo: true }),
  { impacto: 'Crea cuentas de gestión.' });

// ── B.8 · Denegación por defecto ───────────────────────────────────────────────
await ataque('colección no declarada: escribir en /cualquierCosa', () =>
  setDoc(doc(como('ana'), 'cualquierCosa/x'), { a: 1 }),
  { impacto: 'Uso de la base como almacén libre.' });
await ataque('colección no declarada: leer /secretos', () =>
  getDoc(doc(como('ana'), 'secretos/x')),
  { impacto: 'Lectura de rutas no previstas.' });

// ════════════════════════════════════════════════════════════════════════════
// SECCIÓN C · Mutaciones generadas de escrituras válidas
// ════════════════════════════════════════════════════════════════════════════
informe.seccion('C · Mutaciones automáticas de escrituras válidas');

/**
 * Toma una escritura que SÍ es válida y le aplica mutaciones mecánicas (campo
 * extra, cambio de tipo, texto gigante, fecha falsa, cambio de identidad,
 * quitar un campo). Cada mutación DEBE seguir siendo denegada. Agrupa el
 * resultado por plantilla para no llenar el informe.
 */
/** serverTimestamp() del simulador (Centinela) o del SDK (FieldValue). */
function esMarcaDelServidor(v) {
  if (!v || typeof v !== 'object') return false;
  if (v.tipo === 'serverTimestamp' || v._methodName === 'serverTimestamp') return true;
  try {
    return typeof v.isEqual === 'function' && v.isEqual(serverTimestamp());
  } catch {
    return false;
  }
}

function mutaciones(base) {
  const salida = [];
  // 1) Campo extra
  salida.push(['+ campo extra', { ...base, __inyectado: true }]);
  // 2) Texto gigante en el primer campo de texto
  for (const [k, v] of Object.entries(base)) {
    if (typeof v === 'string') { salida.push([`${k} gigante`, { ...base, [k]: 'Z'.repeat(6000) }]); break; }
  }
  // 3) Cambio de tipo: un número a texto
  for (const [k, v] of Object.entries(base)) {
    if (typeof v === 'number') { salida.push([`${k} como texto`, { ...base, [k]: String(v) }]); break; }
  }
  // 4) Fecha falsa donde haya un serverTimestamp (del simulador o del SDK real:
  // en el emulador esta mutación no se generaba porque el objeto es otro).
  for (const [k, v] of Object.entries(base)) {
    if (esMarcaDelServidor(v)) { salida.push([`${k} con fecha falsa`, { ...base, [k]: Timestamp.fromMillis(0) }]); break; }
  }
  return salida;
}

async function plantillaMutada(nombre, uid, ruta, base, { preparar } = {}) {
  let permitidas = 0;
  const muts = mutaciones(base);
  for (const [etiqueta, datos] of muts) {
    await sembrar();
    if (preparar) await entorno.withSecurityRulesDisabled((ctx) => preparar(ctx.firestore()));
    const r = await resultadoDe(() => setDoc(doc(como(uid), ruta), datos));
    if (r.tipo === 'no_simulado') { noEvaluables++; continue; }
    if (r.tipo !== 'permitido') continue;
    permitidas++;
    informe.agregar('brecha', `${nombre}: la mutación «${etiqueta}» pasa`, {
      solucion: 'Reforzar la validación de esa plantilla (lista blanca de campos y tipos).',
    });
  }
  if (permitidas === 0) informe.ok(`${nombre}: ${muts.length} mutaciones rechazadas`);
}

await plantillaMutada('reporte válido de ana', 'ana', 'reports/mut', reporte('ana', 'Ana Pérez'));
// «nueva» todavía no confirmó r_ana (luis sí, en la semilla): así la base es válida.
await plantillaMutada('confirmación simple de una vecina', 'nueva', 'reports/r_ana/confirmations/nueva',
  { uid: 'nueva', reportId: 'r_ana', createdAt: serverTimestamp() });
await plantillaMutada('ticket nuevo de ana', 'ana', 'supportTickets/t_mut',
  { uid: 'ana', tipo: 'queja', estado: 'abierto', asignadoA: null, asunto: 'Asunto de prueba', lastMessagePreview: 'hola', createdAt: serverTimestamp(), lastMessageAt: serverTimestamp() });

// ════════════════════════════════════════════════════════════════════════════
// SECCIÓN D · Lecturas de documentos por operación (solo simulador)
// ════════════════════════════════════════════════════════════════════════════
informe.seccion('D · Lecturas por operación (presupuesto de get/exists)');
if (!ES_SIMULADOR) {
  informe.agregar('info', 'Esta sección solo se mide en el simulador', {
    detalle: 'El emulador no expone el número de lecturas por regla.',
  });
} else {
  // El simulador registra cada decisión; contamos accesos a documentos por operación.
  // Firestore limita a 10 lecturas por operación y 20 por lote: acercarse es riesgo.
  const sim = entorno.simulador;
  const medir = async (nombre, fn, limite) => {
    await sembrar();
    const desde = sim?.registro?.length ?? 0;
    try { await fn(); } catch { /* da igual si pasa o no: medimos lecturas */ }
    const nuevas = (sim?.registro ?? []).slice(desde);
    if (!nuevas.length) { informe.agregar('info', `${nombre}: no se pudo medir`); return; }
    // La peor escritura de la operación: la de más lecturas de documentos.
    const accesos = Math.max(...nuevas.map((r) => (typeof r.accesos === 'number' ? r.accesos : 0)));
    const nivel = accesos > limite ? 'brecha' : accesos >= limite - 2 ? 'advertencia' : 'info';
    informe.agregar(nivel, `${nombre}: ${accesos} lecturas en la escritura más cara (límite ${limite} por operación, ${nuevas.length} escritura(s) en el lote)`, {
      solucion: accesos >= limite - 2 ? 'Reducir get()/exists() en esa regla; agrupar lecturas en un let.' : undefined,
    });
  };
  await medir('crear un reporte con operador y categoría de catálogo', () =>
    setDoc(doc(como('ana'), 'reports/mcount'), reporte('ana', 'Ana Pérez', { categoria: 'microbasural' })), 10);
  await medir('crear un reporte con foto (lote foto + reporte, la creación más cara)', () => {
    const db = como('ana');
    const lote = writeBatch(db);
    lote.set(doc(db, 'reportPhotos/mfoto'), { reportId: 'mfoto', ownerUid: 'ana', mimeType: 'image/jpeg', dataUrl: 'data:image/jpeg;base64,/9j/AAAA', sizeBytes: 12, createdAt: serverTimestamp() });
    lote.set(doc(db, 'reports/mfoto'), reporte('ana', 'Ana Pérez', { categoria: 'microbasural', foto: { kind: 'firestore', path: 'reportPhotos/mfoto', url: null, mimeType: 'image/jpeg', sizeBytes: 12, privacidad: { aplicada: true } } }));
    return lote.commit();
  }, 10);
  await medir('confirmar con peso (lote: voto + suma + contador)', () => {
    const db = como('ana'); // ana confirma r_luis: confirmación nueva, ejercita los get/exists del peso
    const dia = String(Math.floor((Date.now() - 10_800_000) / 86_400_000));
    const lote = writeBatch(db);
    lote.set(doc(db, 'reports/r_luis/confirmations/ana'), { uid: 'ana', reportId: 'r_luis', createdAt: serverTimestamp(), nivel: 0, peso: 10 });
    lote.update(doc(db, 'reports/r_luis'), { 'validacion.puntos': 10, 'validacion.votos': 1, 'validacion.validado': false });
    lote.set(doc(db, `users/ana/limites/${dia}`), { confirmaciones: 1, ultimaAt: serverTimestamp() });
    return lote.commit();
  }, 10);
}

// ════════════════════════════════════════════════════════════════════════════
// SECCIÓN E · Revisión estática del texto de las reglas
// ════════════════════════════════════════════════════════════════════════════
informe.seccion('E · Revisión estática de firestore.rules');
revisarEstatico(informe, reglasTexto);

function revisarEstatico(inf, texto) {
  const sinComentarios = texto.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  // E.1 · Funciones declaradas y nunca llamadas
  const declaradas = [...sinComentarios.matchAll(/function\s+([A-Za-z_]\w*)\s*\(/g)].map((m) => m[1]);
  for (const nombre of declaradas) {
    const usos = (sinComentarios.match(new RegExp(`\\b${nombre}\\s*\\(`, 'g')) ?? []).length;
    if (usos <= 1) inf.agregar('advertencia', `función sin usar: ${nombre}()`, { solucion: 'Eliminarla o conectarla donde corresponda.' });
  }
  // E.2 · Creaciones sin lista blanca (hasOnly), siguiendo las funciones que llaman.
  const cuerpos = new Map();
  for (const m of sinComentarios.matchAll(/function\s+([A-Za-z_]\w*)\s*\([^)]*\)\s*\{/g)) {
    let prof = 0;
    let i = m.index + m[0].length - 1;
    const inicio = i;
    for (; i < sinComentarios.length; i++) {
      if (sinComentarios[i] === '{') prof++;
      else if (sinComentarios[i] === '}' && --prof === 0) break;
    }
    cuerpos.set(m[1], sinComentarios.slice(inicio, i + 1));
  }
  const usaHasOnly = (texto, vistos = new Set()) => {
    if (/\.hasOnly\(/.test(texto)) return true;
    for (const [, n] of texto.matchAll(/\b([A-Za-z_]\w*)\s*\(/g)) {
      if (cuerpos.has(n) && !vistos.has(n)) {
        vistos.add(n);
        if (usaHasOnly(cuerpos.get(n), vistos)) return true;
      }
    }
    return false;
  };
  const colecciones = ['users/{userId}', 'reports/{reportId}', 'confirmations/{userId}', 'statusHistory/{cambioId}',
    'reportPhotos/{reportId}', 'supportTickets/{ticketId}', 'messages/{messageId}'];
  let sinLista = 0;
  for (const col of colecciones) {
    const esc = col.replace(/[{}/]/g, (c) => `\\${c}`);
    const m = sinComentarios.match(new RegExp(`match\\s+\\/${esc}\\s*\\{[\\s\\S]*?allow\\s+[a-z, ]*\\bcreate\\b[^:]*:\\s*if([\\s\\S]*?);`));
    if (!m) continue;
    if (!usaHasOnly(m[1])) {
      sinLista++;
      inf.agregar('brecha', `${col.split('/')[0]} create no usa hasOnly: acepta campos arbitrarios`, {
        solucion: 'Agregar request.resource.data.keys().hasOnly([...]) con los campos que escriben la app y el portal.',
      });
    }
  }
  if (!sinLista) inf.ok(`las ${colecciones.length} creaciones revisadas tienen lista blanca de campos`);
  // E.3 · Colecciones con list abierto a cualquier autenticado (posible fuga de PII)
  const listas = [...sinComentarios.matchAll(/match\s+(\/[^\s{]+)\s*\{[\s\S]*?allow\s+(?:read|list)[^;]*;/g)];
  // reports expone uid y coordenadas exactas a cualquier autenticado: lo dejamos anotado.
  if (/match\s+\/reports\/\{reportId\}[\s\S]*?allow read: if estaAutenticado\(\)/.test(sinComentarios)) {
    inf.agregar('advertencia', 'reports: lectura abierta a cualquier autenticado expone uid y coordenadas exactas', {
      detalle: 'Cualquier cuenta puede leer el uid del autor y la ubicación precisa de todos los reportes.',
      solucion: 'Si no se necesita el uid/coordenadas exactas en el cliente, moverlos a un documento restringido o redondear la ubicación pública.',
    });
  }
  // E.4 · numeroDeDia con desfase fijo (no cubre el horario de invierno de Chile, UTC-4)
  if (/numeroDeDia\(\)[\s\S]*?10800000/.test(sinComentarios)) {
    inf.agregar('advertencia', 'numeroDeDia() usa un desfase fijo UTC-3', {
      detalle: 'En invierno Chile es UTC-4: el "día" del contador de confirmaciones termina a las 23:00 locales, no a medianoche.',
      solucion: 'Documentarlo como limitación aceptada, o calcular el día con la zona America/Santiago.',
    });
  }
  inf.agregar('info', `revisión estática sobre ${texto.split('\n').length} líneas de firestore.rules`);
}

// ════════════════════════════════════════════════════════════════════════════
// SECCIÓN F · Flujos reales que las reglas no deben romper (app y portal)
// ════════════════════════════════════════════════════════════════════════════
informe.seccion('F · Flujos reales de la app y del portal (deben funcionar)');
// Cada uno copia lo que escribe el código hoy: si una regla nueva lo rechaza, un
// usuario legítimo recibe «permiso denegado». El portal (main-web) no se toca.
const FOTO_OK = { url: null, mimeType: 'image/jpeg', sizeBytes: 12, privacidad: { aplicada: true, rostros: 0, personas: 0 } };
const fotoDoc = (id, uid) => ({ reportId: id, ownerUid: uid, dataUrl: 'data:image/jpeg;base64,/9j/AAAA', mimeType: 'image/jpeg', sizeBytes: 12, createdAt: serverTimestamp() });

await permitido('app: reporte con foto en el mismo lote (createReport + stageInBatch)', () => {
  const db = como('ana');
  const lote = writeBatch(db);
  lote.set(doc(db, 'reportPhotos/r_foto'), fotoDoc('r_foto', 'ana'));
  lote.set(doc(db, 'reports/r_foto'), reporte('ana', 'Ana Pérez', { embedding: null, foto: { kind: 'firestore', path: 'reportPhotos/r_foto', ...FOTO_OK } }));
  return lote.commit();
});
await permitido('app: reporte con el punto elegido en el mapa (fuente «mapa», precisión 0)', () =>
  setDoc(doc(como('ana'), 'reports/r_mapa'), reporte('ana', 'Ana Pérez', { ubicacion: { lat: -33.5108, lng: -70.7573, accuracy: 0, fuente: 'mapa' } })));
await permitido('app: reporte derivado a un organismo genérico (sin comuna detectada)', () =>
  setDoc(doc(como('ana'), 'reports/r_generico'), reporte('ana', 'Ana Pérez', {
    categoria: 'fuga_agua', organismo: { id: 'sanitaria', nombre: 'Empresa sanitaria', tipo: 'empresa_sanitaria' },
    operadorId: null, comuna: null, region: null, comunaFuente: 'no_disponible', embedding: null,
  })));
await permitido('portal: un admin crea un reporte desde el panel (foto, origen y sin precisión)', () => {
  const db = como('admin');
  const lote = writeBatch(db);
  lote.set(doc(db, 'reports/r_portal'), {
    uid: 'admin', descripcion: 'Microbasural en la esquina de la plaza', categoria: 'microbasural',
    ubicacion: { lat: -33.51, lng: -70.75 }, comuna: 'Maipú', region: 'Metropolitana de Santiago', comunaFuente: 'limites_oficiales',
    foto: { kind: 'firestore', path: 'reportPhotos/r_portal', ...FOTO_OK }, estado: 'reportado', confirmaciones: 0,
    organismo: MAIPU, operadorId: 'op_maipu', geohash: '66jcfp', embedding: null, origen: 'portal_admin',
    createdAt: serverTimestamp(), updatedAt: serverTimestamp(), autorNombre: 'Admin',
  });
  lote.set(doc(db, 'reportPhotos/r_portal'), fotoDoc('r_portal', 'admin'));
  return lote.commit();
});
await permitido('portal: confirmación con el formato antiguo en un reporte abierto', () =>
  setDoc(doc(como('nueva'), 'reports/r_ana/confirmations/nueva'), { uid: 'nueva', reportId: 'r_ana', createdAt: serverTimestamp() }));
await permitido('app: registro con términos (createUserDocument, merge)', () =>
  setDoc(doc(como('nuevo'), 'users/nuevo'), {
    uid: 'nuevo', email: 'nuevo@correo.cl', displayName: 'Nueva Persona', role: 'ciudadano', trustLevel: 0, validatedReports: 0,
    emailVerified: false, terminosVersion: '2026-11', terminosAceptadosAt: serverTimestamp(), createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  }, { merge: true }));
await permitido('portal: registro (nombre de usuario de 3 a 20 caracteres)', () =>
  setDoc(doc(como('nuevo2'), 'users/nuevo2'), {
    uid: 'nuevo2', displayName: 'vecina.nueva', email: 'nuevo2@correo.cl', emailVerified: false, role: 'ciudadano',
    trustLevel: 0, validatedReports: 0, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  }));
await permitido('app: sincroniza emailVerified al verificar el correo', () =>
  updateDoc(doc(como('ana'), 'users/ana'), { emailVerified: true, updatedAt: serverTimestamp() }),
(db) => updateDoc(doc(db, 'users/ana'), { emailVerified: false }));
await permitido('app: anota ultimoReporteAt (control de frecuencia)', () =>
  updateDoc(doc(como('ana'), 'users/ana'), { ultimoReporteAt: serverTimestamp(), updatedAt: serverTimestamp() }));
await permitido('app: abre un ticket con su primer mensaje (todos los campos de crearTicket)', () => {
  const db = como('ana');
  const lote = writeBatch(db);
  lote.set(doc(db, 'supportTickets/t_ana'), {
    uid: 'ana', autorNombre: 'Ana Pérez', autorEmail: 'ana@correo.cl', tipo: 'sugerencia', asunto: 'Filtrar por comuna',
    estado: 'abierto', asignadoA: null, lastMessageAt: serverTimestamp(), lastMessagePreview: 'Sería útil', createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  });
  lote.set(doc(db, 'supportTickets/t_ana/messages/m1'), {
    ticketId: 't_ana', autorUid: 'ana', autorNombre: 'Ana Pérez', autorRol: 'ciudadano', texto: 'Sería útil filtrar por comuna', createdAt: serverTimestamp(),
  });
  return lote.commit();
});
await permitido('app: el vecino responde en su ticket', () => {
  const db = como('luis');
  const lote = writeBatch(db);
  lote.set(doc(db, 'supportTickets/t_luis/messages/m2'), { ticketId: 't_luis', autorUid: 'luis', autorNombre: 'Luis Soto', autorRol: 'ciudadano', texto: 'Sigue pasando', createdAt: serverTimestamp() });
  lote.update(doc(db, 'supportTickets/t_luis'), { lastMessageAt: serverTimestamp(), lastMessagePreview: 'Sigue pasando', updatedAt: serverTimestamp() });
  return lote.commit();
});
await permitido('portal: el equipo de soporte responde y toma el ticket', () => {
  const db = como('opmaipu');
  const lote = writeBatch(db);
  lote.set(doc(db, 'supportTickets/t_luis/messages/m3'), { ticketId: 't_luis', autorUid: 'opmaipu', autorNombre: 'Soporte', autorRol: 'staff', texto: 'Lo estamos revisando', createdAt: serverTimestamp() });
  lote.update(doc(db, 'supportTickets/t_luis'), { lastMessageAt: serverTimestamp(), lastMessagePreview: 'Lo estamos revisando', updatedAt: serverTimestamp(), estado: 'en_atencion', asignadoA: 'opmaipu' });
  return lote.commit();
});
await permitido('portal: el equipo cierra un ticket', () =>
  updateDoc(doc(como('admin'), 'supportTickets/t_luis'), { estado: 'cerrado', updatedAt: serverTimestamp() }));
await permitido('gestor: cambia el estado y deja el historial en el mismo lote', () => {
  const db = como('opmaipu');
  const lote = writeBatch(db);
  lote.update(doc(db, 'reports/r_ana'), { estado: 'derivado', updatedAt: serverTimestamp() });
  lote.set(doc(db, 'reports/r_ana/statusHistory/h1'), {
    reportId: 'r_ana', desde: 'reportado', hacia: 'derivado', autorUid: 'opmaipu', autorRol: 'operador', autorNombre: 'Municipalidad de Maipú', comentario: '', createdAt: serverTimestamp(),
  });
  return lote.commit();
});
await permitido('app: el organismo abre su mapa (validados de su municipalidad, del más nuevo al más antiguo)', () =>
  getDocs(query(collection(como('orgmaipu'), 'reports'), where('organismo.id', '==', 'muni_13119'), where('validacion.validado', '==', true))));
await permitido('app: el organismo acepta los términos al entrar', () =>
  updateDoc(doc(como('orgmaipu'), 'users/orgmaipu'), { terminosVersion: '2026-11', terminosAceptadosAt: serverTimestamp(), updatedAt: serverTimestamp() }));
await ataque('organismo: crea un reporte', () =>
  setDoc(doc(como('orgmaipu'), 'reports/x'), reporte('orgmaipu', 'Municipalidad de Maipú')),
  { impacto: 'Una cuenta institucional publicaría reportes como si fuera un vecino.' });
await ataque('organismo: confirma un reporte validado', () =>
  setDoc(doc(como('orgmaipu'), 'reports/r_validado/confirmations/orgmaipu'), { uid: 'orgmaipu', reportId: 'r_validado', createdAt: serverTimestamp() }),
  { impacto: 'El organismo inflaría la validación de los reportes que recibe.' });
await ataque('organismo: se cambia a otra municipalidad', () =>
  updateDoc(doc(como('orgmaipu'), 'users/orgmaipu'), { organismoId: 'muni_13124' }),
  { impacto: 'Vería los reportes validados de otra comuna.' });
await ataque('organismo: se da rol de operador', () =>
  updateDoc(doc(como('orgmaipu'), 'users/orgmaipu'), { role: 'operador', operadorId: 'op_maipu' }),
  { impacto: 'Pasaría a gestionar reportes.' });

await permitido('portal: un admin elimina un reporte junto con su foto', () => {
  const db = como('admin');
  const lote = writeBatch(db);
  lote.delete(doc(db, 'reportPhotos/r_conFoto'));
  lote.delete(doc(db, 'reports/r_conFoto'));
  return lote.commit();
});

// ════════════════════════════════════════════════════════════════════════════
// SECCIÓN G · Qué cuenta size() en un texto (calibración)
// ════════════════════════════════════════════════════════════════════════════
informe.seccion('G · Unidad de size() en los textos');
// La documentación solo dice «número de caracteres». Con el mínimo de 10 de la
// descripción: 5 «á» son 5 unidades UTF-16 pero 10 bytes; 5 «👍» son 10 UTF-16
// pero 5 puntos de código. La app mide con .length (UTF-16).
const pasa = async (descripcion) => {
  await sembrar();
  return (await resultadoDe(() => setDoc(doc(como('ana'), 'reports/unidad'), reporte('ana', 'Ana Pérez', { descripcion })))).tipo;
};
const conAcentos = await pasa('ááááá');
const conEmojis = await pasa('👍👍👍👍👍');
if (conAcentos === 'no_simulado' || conEmojis === 'no_simulado') {
  informe.agregar('info', 'no se pudo medir la unidad de size() en este motor');
} else if (conAcentos === 'permitido') {
  informe.agregar('advertencia', 'size() cuenta BYTES: «á», «ñ» y los emojis valen más de 1', {
    detalle: 'La app mide con .length: un texto en español cerca del tope de 500 (o un nombre cerca de 60) pasaría el formulario y lo rechazarían las reglas.',
    solucion: 'Medir en el formulario con new TextEncoder().encode(texto).length, o dejar margen en los topes.',
  });
} else if (conEmojis === 'permitido') {
  informe.ok(`size() cuenta unidades UTF-16, igual que .length de la app (${ES_SIMULADOR ? 'supuesto del simulador' : 'medido en el emulador'})`);
} else {
  informe.agregar('advertencia', 'size() cuenta puntos de código: un emoji vale 1 y en la app vale 2', {
    detalle: 'Un texto con emojis puede pasar el formulario (.length) y rechazarse en el servidor.',
    solucion: 'Medir en el formulario con [...texto].length.',
  });
}

// ── Cierre ─────────────────────────────────────────────────────────────────────
if (noEvaluables) {
  informe.agregar('info', `${noEvaluables} casos no evaluables en este motor`, {
    detalle: ES_SIMULADOR ? 'Vuelve a correr con --emulador para confirmarlos en el emulador real.' : undefined,
  });
}
informe.agregar('info', `Motor usado: ${ES_SIMULADOR ? 'simulador (aproximado)' : 'emulador real'}`);

await entorno.cleanup();
process.exitCode = informe.cerrar(RAIZ, 'reglas-ataques.md');
