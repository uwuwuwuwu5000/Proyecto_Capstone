#!/usr/bin/env node
/**
 * Pruebas de las reglas de seguridad de Firestore contra el emulador.
 *
 *   node scripts/diagnostico/reglas.mjs
 *
 * Levanta el emulador de Firestore con un proyecto de prueba
 * (demo-ciudad-alerta), carga firestore.rules, ejecuta los casos y lo apaga.
 * Nunca toca el proyecto real.
 *
 * Requisitos (una vez):
 *   npm install -g firebase-tools
 *   npm install -D @firebase/rules-unit-testing@<versión según firebase>
 *   Java 21 o superior (el emulador es un programa Java)
 *
 * Incluye los casos del sistema de confianza (confirmación con peso, contador
 * del día, veredictos): si un control de «Confianza:» falla, la app nueva
 * recibirá «permiso denegado» al confirmar o al dar un veredicto.
 *
 * Tres tipos de prueba:
 *   CONTROL  flujos reales de la app que DEBEN funcionar. Si alguno falla, una
 *            regla está bloqueando a usuarios legítimos.
 *   BLOQUEO  cosas que DEBEN rechazarse. Si alguna pasa, es una brecha.
 *   BRECHA   huecos conocidos de las reglas actuales. Fallan hoy a propósito
 *            y pasan a verde cuando se corrigen.
 *
 * Escribe el informe en diagnostico/reglas.md.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Informe } from './comun.mjs';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PROYECTO = 'demo-ciudad-alerta';
const ES_WINDOWS = process.platform === 'win32';

// ── Fuera del emulador: lo levanta y se vuelve a ejecutar dentro ─────────────
if (!process.env.FIRESTORE_EMULATOR_HOST) {
  console.log('\nCiudad Alerta · pruebas de reglas de seguridad');

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
  if (mayor < 21) console.warn(`  ⚠ Java ${mayor}: las versiones recientes del emulador piden Java 21 o superior.`);

  console.log(`  Firebase CLI ${version.stdout.trim()} · Java ${mayor} · levantando el emulador de Firestore…\n`);
  // Ruta relativa a la raíz: evita problemas con espacios en "Proyecto Ciudad Alerta".
  const interno = 'node scripts/diagnostico/reglas.mjs';
  const r = spawnSync(
    ES_WINDOWS ? `firebase emulators:exec --only firestore --project ${PROYECTO} "${interno}"` : 'firebase',
    ES_WINDOWS ? [] : ['emulators:exec', '--only', 'firestore', '--project', PROYECTO, interno],
    { cwd: RAIZ, stdio: 'inherit', shell: ES_WINDOWS },
  );
  if (![0, 1, 2].includes(r.status)) {
    console.error(
      '\n✖ El emulador no pudo iniciarse. Causas habituales:\n' +
        '  - El puerto 8080 está ocupado (¿el contenedor de Docker de los emuladores está corriendo?).\n' +
        '  - Java no está en el PATH.\n',
    );
  }
  process.exit(r.status ?? 1);
}

// ── Dentro del emulador ──────────────────────────────────────────────────────
// Imports normales (ESM): este archivo vive dentro del proyecto, así que Node
// los resuelve en su node_modules. Usar la misma resolución que la librería de
// pruebas es indispensable: dos copias de firebase/firestore no se reconocen
// entre sí ("Type does not match the expected instance").
const requerir = createRequire(join(RAIZ, 'package.json'));
let rut;
try {
  rut = await import('@firebase/rules-unit-testing');
} catch {
  let mayor = '?';
  try {
    mayor = JSON.parse(readFileSync(requerir.resolve('firebase/package.json'), 'utf8')).version.split('.')[0];
  } catch {
    // firebase no instalado
  }
  const compatible = { 10: 3, 11: 4, 12: 5, 13: 6 }[mayor];
  console.error(
    `\n✖ Falta @firebase/rules-unit-testing. Con firebase ${mayor}.x instala:\n` +
      `  npm install -D @firebase/rules-unit-testing${compatible ? `@${compatible}` : ''}\n`,
  );
  process.exit(2);
}
const fs = await import('firebase/firestore');
const { initializeTestEnvironment, assertFails, assertSucceeds } = rut;
const { doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, collection, query, where, writeBatch, serverTimestamp, Timestamp } = fs;

const reglas = readFileSync(join(RAIZ, 'firestore.rules'), 'utf8');
const correosAdmin = [...(reglas.match(/request\.auth\.token\.email\s+in\s+\[([\s\S]*?)\]/)?.[1] ?? '').matchAll(/'([^']+)'/g)].map((m) => m[1]);

// Windows no puede conectarse a 0.0.0.0, que es el host declarado en firebase.json.
const [host, puerto] = process.env.FIRESTORE_EMULATOR_HOST.split(':');
const entorno = await initializeTestEnvironment({
  projectId: PROYECTO,
  firestore: { rules: reglas, host: host === '0.0.0.0' ? '127.0.0.1' : host, port: Number(puerto) },
});

// ── Datos de prueba ──────────────────────────────────────────────────────────
const MAIPU = { id: 'muni_13119', nombre: 'Municipalidad de Maipú', tipo: 'municipio', comuna: 'Maipú' };
const PUDAHUEL = { id: 'muni_13124', nombre: 'Municipalidad de Pudahuel', tipo: 'municipio', comuna: 'Pudahuel' };

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

/** Un reporte tal como lo escribe la app al crear. */
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

async function sembrar() {
  await entorno.clearFirestore();
  await entorno.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const ahora = Timestamp.now();
    // Cuentas de más de 24 h: el sistema de confianza solo da peso a esas.
    const antigua = { createdAt: Timestamp.fromMillis(Date.now() - 2 * 86_400_000) };
    const escrituras = {
      'users/ana': perfil('ana', 'Ana Pérez', 'ciudadano', antigua),
      'users/luis': perfil('luis', 'Luis Soto', 'ciudadano', antigua),
      'users/nueva': perfil('nueva', 'Cuenta Nueva', 'ciudadano', { createdAt: Timestamp.fromMillis(Date.now() - 3_600_000) }),
      'users/admin': perfil('admin', 'Admin', 'admin', antigua),
      'users/opmaipu': perfil('opmaipu', 'Operador Maipú', 'operador', { operadorId: 'op_maipu', ...antigua }),
      'organismos/muni_13119': { ...MAIPU, comunasAtendidas: ['13119'], codigoRegion: '13', region: 'Metropolitana', activo: true },
      'organismos/muni_13124': { ...PUDAHUEL, comunasAtendidas: ['13124'], codigoRegion: '13', region: 'Metropolitana', activo: true },
      'operadores/op_maipu': { id: 'op_maipu', nombre: 'Operador Maipú', organismoId: 'muni_13119', activo: true },
      'operadores/op_pudahuel': { id: 'op_pudahuel', nombre: 'Operador Pudahuel', organismoId: 'muni_13124', activo: true },
      'reports/r_ana': { ...reporte('ana', 'Ana Pérez'), createdAt: ahora, updatedAt: ahora },
      'reports/r_luis': {
        ...reporte('luis', 'Luis Soto', { comuna: 'Pudahuel', organismo: PUDAHUEL, operadorId: 'op_pudahuel' }),
        createdAt: ahora,
        updatedAt: ahora,
      },
      'supportTickets/t_luis': {
        uid: 'luis', tipo: 'queja', estado: 'abierto', asignadoA: null,
        asunto: 'La app se cierra', lastMessagePreview: 'Al abrir el mapa', createdAt: ahora, lastMessageAt: ahora,
      },
      'supportTickets/t_luis/messages/m1': {
        ticketId: 't_luis', autorUid: 'luis', autorRol: 'ciudadano', texto: 'Al abrir el mapa se cierra', createdAt: ahora,
      },
    };
    for (const [ruta, datos] of Object.entries(escrituras)) await setDoc(doc(db, ruta), datos);
  });
}

const como = (uid, token = {}) =>
  entorno.authenticatedContext(uid, { email: `${uid}@correo.cl`, email_verified: true, ...token }).firestore();
const anonimo = () => entorno.unauthenticatedContext().firestore();

/** `extra`: campos de resolución (F12) que la app y el portal agregan al resolver o cerrar. */
const cambioDeEstado = (db, quien, rol, nombre, reportId, desde, hacia, extra = {}) => {
  const lote = writeBatch(db);
  lote.update(doc(db, 'reports', reportId), { estado: hacia, updatedAt: serverTimestamp(), ...extra });
  lote.set(doc(collection(db, 'reports', reportId, 'statusHistory')), {
    reportId, desde, hacia, autorUid: quien, autorRol: rol, autorNombre: nombre, comentario: '', createdAt: serverTimestamp(),
  });
  return lote.commit();
};

// ── Casos ────────────────────────────────────────────────────────────────────
const casos = [];
// `preparar` (opcional) escribe datos extra sin reglas antes del caso.
const control = (nombre, fn, preparar) => casos.push({ tipo: 'control', nombre, fn, preparar });
const bloqueo = (nombre, fn, preparar) => casos.push({ tipo: 'bloqueo', nombre, fn, preparar });
const brecha = (nombre, fn, solucion) => casos.push({ tipo: 'brecha', nombre, fn, solucion });

// CONTROL: lo que la app hace todos los días
control('Un ciudadano crea su perfil al registrarse', () =>
  setDoc(doc(como('nuevo'), 'users/nuevo'), { ...perfil('nuevo', 'Nueva Persona'), emailVerified: false, createdAt: serverTimestamp() }));
control('Un ciudadano crea un reporte sin foto', () => setDoc(doc(como('ana'), 'reports/nuevo'), reporte('ana', 'Ana Pérez')));
control('Un ciudadano crea un reporte con foto protegida (lote foto + reporte)', () => {
  const db = como('ana');
  const lote = writeBatch(db);
  lote.set(doc(db, 'reportPhotos/conFoto'), {
    reportId: 'conFoto', ownerUid: 'ana', mimeType: 'image/jpeg', dataUrl: 'data:image/jpeg;base64,/9j/AAAA', createdAt: serverTimestamp(),
  });
  lote.set(doc(db, 'reports/conFoto'), reporte('ana', 'Ana Pérez', {
    foto: { kind: 'firestore', path: 'reportPhotos/conFoto', bytes: 12, privacidad: { aplicada: true, personas: 0, rostros: 0 } },
  }));
  return lote.commit();
});
control('Cualquier usuario con sesión ve los reportes', () => getDocs(collection(como('luis'), 'reports')));
control('Un vecino confirma el reporte de otro', () =>
  setDoc(doc(como('luis'), 'reports/r_ana/confirmations/luis'), { uid: 'luis', reportId: 'r_ana', createdAt: serverTimestamp() }));
control('Un admin cambia el estado y deja historial', () =>
  cambioDeEstado(como('admin'), 'admin', 'admin', 'Administración Ciudad Alerta', 'r_ana', 'reportado', 'en_revision'));
control('El operador asignado cambia el estado de su reporte', () =>
  cambioDeEstado(como('opmaipu'), 'opmaipu', 'operador', 'Municipalidad de Maipú', 'r_ana', 'reportado', 'derivado'));

// F12 · Datos de resolución (etapa blanda de cambioDeEstadoValido): los escribe
// CambioEstadoService (módulo gestion-reportes) y también el portal.
const DOS_HORAS = 2 * 3_600_000;
const enProcesoHaceDosHoras = (db) =>
  updateDoc(doc(db, 'reports/r_ana'), { estado: 'en_proceso', createdAt: Timestamp.fromMillis(Date.now() - DOS_HORAS) });
const resolverRAna = (extra) =>
  cambioDeEstado(como('opmaipu'), 'opmaipu', 'operador', 'Municipalidad de Maipú', 'r_ana', 'en_proceso', 'resuelto', extra);
control('F12: al resolver se guardan resueltoAt y tiempoResolucionMs', () =>
  resolverRAna({ resueltoAt: serverTimestamp(), tiempoResolucionMs: DOS_HORAS }), enProcesoHaceDosHoras);
control('F12: resolver sin datos de resolución sigue permitido (etapa blanda)', () => resolverRAna({}), enProcesoHaceDosHoras);
control('F12: al cerrar sin resolver se guarda cerradoSinResolverAt', () =>
  cambioDeEstado(como('admin'), 'admin', 'admin', 'Administración Ciudad Alerta', 'r_ana', 'reportado', 'cerrado', {
    cerradoSinResolverAt: serverTimestamp(),
  }));

control('Un ciudadano abre un ticket con su primer mensaje', () => {
  const db = como('ana');
  const lote = writeBatch(db);
  lote.set(doc(db, 'supportTickets/t_nuevo'), {
    uid: 'ana', tipo: 'sugerencia', estado: 'abierto', asignadoA: null, asunto: 'Filtrar por comuna',
    lastMessagePreview: 'Sería útil', createdAt: serverTimestamp(), lastMessageAt: serverTimestamp(),
  });
  lote.set(doc(db, 'supportTickets/t_nuevo/messages/m1'), {
    ticketId: 't_nuevo', autorUid: 'ana', autorRol: 'ciudadano', texto: 'Sería útil filtrar por comuna', createdAt: serverTimestamp(),
  });
  return lote.commit();
});
control('Un ciudadano lista solo sus tickets', () =>
  getDocs(query(collection(como('luis'), 'supportTickets'), where('uid', '==', 'luis'))));

// BLOQUEO: lo que debe rechazarse
bloqueo('F12: un tiempo de resolución que no calza con la hora del servidor (más de 15 min) se rechaza', () =>
  resolverRAna({ resueltoAt: serverTimestamp(), tiempoResolucionMs: 60_000 }), enProcesoHaceDosHoras);
bloqueo('F12: resueltoAt debe ser la hora del servidor', () =>
  resolverRAna({ resueltoAt: Timestamp.fromMillis(Date.now() - 86_400_000), tiempoResolucionMs: DOS_HORAS }), enProcesoHaceDosHoras);
bloqueo('F12: no se guardan datos de resolución en un cambio que no resuelve', () =>
  cambioDeEstado(como('admin'), 'admin', 'admin', 'Administración Ciudad Alerta', 'r_ana', 'reportado', 'en_revision', {
    resueltoAt: serverTimestamp(),
    tiempoResolucionMs: 0,
  }));
bloqueo('Sin sesión no se leen reportes', () => getDocs(collection(anonimo(), 'reports')));
bloqueo('Un ciudadano no lee el perfil de otro', () => getDoc(doc(como('ana'), 'users/luis')));
bloqueo('Un ciudadano no lista todos los perfiles', () => getDocs(collection(como('ana'), 'users')));
bloqueo('Un ciudadano no se sube el nivel de confianza', () => updateDoc(doc(como('ana'), 'users/ana'), { trustLevel: 5 }));
bloqueo('Un ciudadano no se hace admin', () => updateDoc(doc(como('ana'), 'users/ana'), { role: 'admin' }));
bloqueo('Un ciudadano no se hace operador', () => updateDoc(doc(como('ana'), 'users/ana'), { role: 'operador', operadorId: 'op_maipu' }));
bloqueo('Un ciudadano no cambia el estado de su propio reporte', () =>
  updateDoc(doc(como('ana'), 'reports/r_ana'), { estado: 'resuelto', updatedAt: serverTimestamp() }));
bloqueo('Un ciudadano no edita la descripción de un reporte ajeno', () =>
  updateDoc(doc(como('ana'), 'reports/r_luis'), { descripcion: 'Texto cambiado por otra persona' }));
bloqueo('Un ciudadano no crea reportes a nombre de otro uid', () => setDoc(doc(como('ana'), 'reports/x'), reporte('luis', 'Luis Soto')));
bloqueo('Un ciudadano no firma con el nombre de otra persona', () => setDoc(doc(como('ana'), 'reports/x'), reporte('ana', 'Luis Soto')));
bloqueo('Un reporte no nace con confirmaciones', () => setDoc(doc(como('ana'), 'reports/x'), reporte('ana', 'Ana Pérez', { confirmaciones: 50 })));
bloqueo('Un reporte no nace resuelto', () => setDoc(doc(como('ana'), 'reports/x'), reporte('ana', 'Ana Pérez', { estado: 'resuelto' })));
bloqueo('Una foto sin desenfoque no se publica', () =>
  setDoc(doc(como('ana'), 'reports/x'), reporte('ana', 'Ana Pérez', { foto: { kind: 'firestore', path: 'reportPhotos/x', privacidad: { aplicada: false } } })));
bloqueo('Una descripción de menos de 10 caracteres se rechaza', () => setDoc(doc(como('ana'), 'reports/x'), reporte('ana', 'Ana Pérez', { descripcion: 'bache' })));
bloqueo('Una categoría inventada se rechaza', () => setDoc(doc(como('ana'), 'reports/x'), reporte('ana', 'Ana Pérez', { categoria: 'spam' })));
bloqueo('Un organismo inventado se rechaza', () =>
  setDoc(doc(como('ana'), 'reports/x'), reporte('ana', 'Ana Pérez', { organismo: { ...MAIPU, id: 'muni_99999' } })));
bloqueo('No se asigna el reporte al operador de otra municipalidad', () =>
  setDoc(doc(como('ana'), 'reports/x'), reporte('ana', 'Ana Pérez', { operadorId: 'op_pudahuel' })));
bloqueo('No se envían dos reportes en menos de 30 segundos', async () => {
  await entorno.withSecurityRulesDisabled((ctx) => updateDoc(doc(ctx.firestore(), 'users/ana'), { ultimoReporteAt: Timestamp.now() }));
  return setDoc(doc(como('ana'), 'reports/x'), reporte('ana', 'Ana Pérez'));
});
bloqueo('Un ciudadano no borra reportes', () => deleteDoc(doc(como('ana'), 'reports/r_ana')));
bloqueo('Un ciudadano no confirma su propio reporte', () =>
  setDoc(doc(como('ana'), 'reports/r_ana/confirmations/ana'), { uid: 'ana', reportId: 'r_ana', createdAt: serverTimestamp() }));
bloqueo('Un operador no confirma reportes', () =>
  setDoc(doc(como('opmaipu'), 'reports/r_luis/confirmations/opmaipu'), { uid: 'opmaipu', reportId: 'r_luis', createdAt: serverTimestamp() }));
bloqueo('Un ciudadano no escribe historial de estados', () =>
  setDoc(doc(como('ana'), 'reports/r_ana/statusHistory/h1'), {
    reportId: 'r_ana', desde: 'reportado', hacia: 'resuelto', autorUid: 'ana', comentario: '', createdAt: serverTimestamp(),
  }));
bloqueo('El operador de Maipú no gestiona reportes de Pudahuel', () =>
  cambioDeEstado(como('opmaipu'), 'opmaipu', 'operador', 'Municipalidad de Maipú', 'r_luis', 'reportado', 'derivado'));
bloqueo('Un operador no firma a nombre de otra municipalidad', () =>
  cambioDeEstado(como('opmaipu'), 'opmaipu', 'operador', 'Municipalidad de Pudahuel', 'r_ana', 'reportado', 'derivado'));
bloqueo('Ni un admin salta de "reportado" a "resuelto"', () =>
  cambioDeEstado(como('admin'), 'admin', 'admin', 'Administración Ciudad Alerta', 'r_ana', 'reportado', 'resuelto'));
bloqueo('Un ciudadano no lee el ticket de otro', () => getDoc(doc(como('ana'), 'supportTickets/t_luis')));
bloqueo('Un ciudadano no lista todos los tickets', () => getDocs(collection(como('ana'), 'supportTickets')));
bloqueo('Un ciudadano no lee los mensajes de otro ticket', () => getDocs(collection(como('ana'), 'supportTickets/t_luis/messages')));
bloqueo('Un ciudadano no escribe en el ticket de otro', () =>
  setDoc(doc(como('ana'), 'supportTickets/t_luis/messages/m2'), {
    ticketId: 't_luis', autorUid: 'ana', autorRol: 'ciudadano', texto: 'Mensaje intruso', createdAt: serverTimestamp(),
  }));
bloqueo('Un ciudadano no firma como equipo de soporte', () =>
  setDoc(doc(como('luis'), 'supportTickets/t_luis/messages/m2'), {
    ticketId: 't_luis', autorUid: 'luis', autorRol: 'staff', texto: 'Respuesta falsa del soporte', createdAt: serverTimestamp(),
  }));
bloqueo('Un ciudadano no cierra su ticket por su cuenta', () =>
  updateDoc(doc(como('luis'), 'supportTickets/t_luis'), { estado: 'cerrado', updatedAt: serverTimestamp() }));
bloqueo('Un ciudadano no edita el catálogo de municipalidades', () =>
  updateDoc(doc(como('ana'), 'organismos/muni_13119'), { nombre: 'Municipalidad Falsa' }));
bloqueo('Un ciudadano no crea operadores', () =>
  setDoc(doc(como('ana'), 'operadores/op_falso'), { id: 'op_falso', nombre: 'Falso', organismoId: 'muni_13119', activo: true }));
bloqueo('Nadie escribe en colecciones no declaradas', () => setDoc(doc(como('ana'), 'cualquierCosa/x'), { a: 1 }));

// ── Sistema de confianza (sistema_confianza.md, 5.3 a 5.6) ──────────────────
/** Id del contador del día, igual que numeroDeDia() de las reglas. */
const diaDeHoy = () => String(Math.floor((Date.now() - 10_800_000) / 86_400_000));

/**
 * Confirmación con peso tal como la escribe la app: voto + suma en el reporte
 * + contador del día, en un lote. Cada opción permite romper una pieza.
 */
function confirmarConPeso(db, uid, reportId, o = {}) {
  const { nivel = 0, peso = 10, antes = { puntos: 0, votos: 0 }, contadorPrevio = null, conContador = true, conSuma = true, dia = diaDeHoy(), extraReporte = {} } = o;
  const puntos = o.puntos ?? antes.puntos + peso;
  const votos = o.votos ?? antes.votos + (peso > 0 ? 1 : 0);
  const validado = puntos >= 100 && votos >= 3;
  const lote = writeBatch(db);
  lote.set(doc(db, `reports/${reportId}/confirmations/${uid}`), { uid, reportId, createdAt: serverTimestamp(), nivel, peso });
  if (conSuma) {
    lote.update(doc(db, `reports/${reportId}`), {
      'validacion.puntos': puntos,
      'validacion.votos': votos,
      'validacion.validado': validado,
      ...(validado ? { 'validacion.validadoAt': serverTimestamp() } : {}),
      ...extraReporte,
    });
  }
  if (conContador) {
    const ref = doc(db, `users/${uid}/limites/${dia}`);
    if (contadorPrevio === null) lote.set(ref, { confirmaciones: 1, ultimaAt: serverTimestamp() });
    else lote.update(ref, { confirmaciones: contadorPrevio + 1, ultimaAt: serverTimestamp() });
  }
  return lote.commit();
}

/** Veredicto de un gestor: reporte + confianza del autor + espejo, en un lote. */
function darVeredicto(
  db,
  gestorUid,
  reportId,
  autorUid,
  { veredicto = 'real', puntosAntes = 0, puntosDespues = 10, comentario = null, validadosAntes = 0, falsosAntes = 0 } = {},
) {
  const nivel = (pc) => [760, 640, 530, 430, 340, 260, 190, 130, 80, 40].findIndex((u) => pc >= u);
  const nivelDe = (pc) => (nivel(pc) < 0 ? 0 : 10 - nivel(pc));
  const real = veredicto === 'real';
  const lote = writeBatch(db);
  lote.update(doc(db, `reports/${reportId}`), {
    'validacion.veredicto': veredicto,
    'validacion.veredictoPor': gestorUid,
    'validacion.veredictoAt': serverTimestamp(),
    'validacion.veredictoPuntos': puntosDespues - puntosAntes,
    ...(comentario ? { 'validacion.veredictoComentario': comentario } : {}),
    updatedAt: serverTimestamp(),
  });
  lote.set(doc(db, `users/${autorUid}/confianza/actual`), {
    puntosConfianza: puntosDespues,
    trustLevel: nivelDe(puntosDespues),
    validatedReports: validadosAntes + (real ? 1 : 0),
    reportesFalsos: falsosAntes + (real ? 0 : 1),
    confirmacionesSuspendidas: false,
    ultimoReporteId: reportId,
    updatedAt: serverTimestamp(),
  });
  // Espejo en el perfil, que es lo que leen las pantallas antiguas.
  lote.update(doc(db, `users/${autorUid}`), {
    trustLevel: nivelDe(puntosDespues),
    validatedReports: validadosAntes + (real ? 1 : 0),
    updatedAt: serverTimestamp(),
  });
  return lote.commit();
}

const contadorDeHoy = (uid, confirmaciones, haceMs) => (db) =>
  setDoc(doc(db, `users/${uid}/limites/${diaDeHoy()}`), { confirmaciones, ultimaAt: Timestamp.fromMillis(Date.now() - haceMs) });

control('Confianza: un vecino de nivel 0 confirma con peso 10 (voto + suma + contador)', () =>
  confirmarConPeso(como('luis'), 'luis', 'r_ana'));
control('Confianza: con el correo sin verificar el voto pesa 0 y no toca el reporte', () =>
  confirmarConPeso(entorno.authenticatedContext('luis', { email: 'luis@correo.cl', email_verified: false }).firestore(), 'luis', 'r_ana', { peso: 0, conSuma: false }));
control('Confianza: una cuenta de menos de 24 h confirma con peso 0', () =>
  confirmarConPeso(como('nueva'), 'nueva', 'r_ana', { peso: 0, conSuma: false }));
control(
  'Confianza: la confirmación que llega a 100 puntos y 3 votos valida el reporte',
  () => confirmarConPeso(como('luis'), 'luis', 'r_ana', { antes: { puntos: 90, votos: 2 } }),
  (db) => updateDoc(doc(db, 'reports/r_ana'), { validacion: { puntos: 90, votos: 2, validado: false } }),
);
control(
  'Confianza: la segunda confirmación del día sube el contador en 1',
  () => confirmarConPeso(como('luis'), 'luis', 'r_ana', { contadorPrevio: 1 }),
  contadorDeHoy('luis', 1, 60_000),
);
control('Confianza: el vecino lee su nivel y su contador de hoy', async () => {
  const db = como('luis');
  await getDoc(doc(db, 'users/luis/confianza/actual'));
  return getDoc(doc(db, `users/luis/limites/${diaDeHoy()}`));
});
control('Confianza: un admin da veredicto real y suma 10 PC al autor en el mismo lote', () =>
  darVeredicto(como('admin'), 'admin', 'r_ana', 'ana'));
control('Confianza: el operador asignado da veredicto falso con comentario (−15 desde 40)', () =>
  darVeredicto(como('opmaipu'), 'opmaipu', 'r_ana', 'ana', {
    veredicto: 'falso', puntosAntes: 40, puntosDespues: 25, validadosAntes: 4, comentario: 'No había ningún bache',
  }),
  (db) => setDoc(doc(db, 'users/ana/confianza/actual'), {
    puntosConfianza: 40, trustLevel: 1, validatedReports: 4, reportesFalsos: 0, confirmacionesSuspendidas: false, ultimoReporteId: 'r_viejo', updatedAt: Timestamp.now(),
  }),
);

bloqueo('Confianza: no se inventa el peso (34 con nivel 0)', () => confirmarConPeso(como('luis'), 'luis', 'r_ana', { peso: 34 }));
bloqueo('Confianza: no se falsea el nivel (nivel 5 sin puntos)', () => confirmarConPeso(como('luis'), 'luis', 'r_ana', { nivel: 5, peso: 22.5 }));
bloqueo('Confianza: no se confirma sin escribir el contador del día', () => confirmarConPeso(como('luis'), 'luis', 'r_ana', { conContador: false }));
bloqueo('Confianza: no se confirma con peso sin sumar en el reporte', () => confirmarConPeso(como('luis'), 'luis', 'r_ana', { conSuma: false }));
bloqueo('Confianza: no se infla la suma del reporte', () => confirmarConPeso(como('luis'), 'luis', 'r_ana', { puntos: 60 }));
bloqueo('Confianza: no se marca validado antes de tiempo', () => confirmarConPeso(como('luis'), 'luis', 'r_ana', { puntos: 100, votos: 3 }));
bloqueo('Confianza: el contador no usa otro día', () => confirmarConPeso(como('luis'), 'luis', 'r_ana', { dia: String(Number(diaDeHoy()) - 1) }));
bloqueo('Confianza: se respeta la pausa de 20 s', () => confirmarConPeso(como('luis'), 'luis', 'r_ana', { contadorPrevio: 1 }), contadorDeHoy('luis', 1, 5_000));
bloqueo('Confianza: se respeta el límite diario del nivel 0 (5)', () => confirmarConPeso(como('luis'), 'luis', 'r_ana', { contadorPrevio: 5 }), contadorDeHoy('luis', 5, 60_000));
bloqueo('Confianza: una cuenta de menos de 24 h no vota con peso', () => confirmarConPeso(como('nueva'), 'nueva', 'r_ana'));
bloqueo(
  'Confianza: un usuario suspendido no confirma',
  () => confirmarConPeso(como('luis'), 'luis', 'r_ana'),
  (db) => setDoc(doc(db, 'users/luis/confianza/actual'), {
    puntosConfianza: 0, trustLevel: 0, validatedReports: 0, reportesFalsos: 0, confirmacionesSuspendidas: true, updatedAt: Timestamp.now(),
  }),
);
bloqueo('Confianza: un vecino no cambia el estado junto con la suma', () =>
  confirmarConPeso(como('luis'), 'luis', 'r_ana', { extraReporte: { estado: 'resuelto' } }));
bloqueo('Confianza: un ciudadano no se escribe sus propios puntos', () =>
  setDoc(doc(como('luis'), 'users/luis/confianza/actual'), {
    puntosConfianza: 760, trustLevel: 10, validatedReports: 76, reportesFalsos: 0, confirmacionesSuspendidas: false, ultimoReporteId: 'r_luis', updatedAt: serverTimestamp(),
  }));
bloqueo('Confianza: un ciudadano no da veredictos', () => darVeredicto(como('luis'), 'luis', 'r_ana', 'ana'));
bloqueo('Confianza: un veredicto no regala más puntos (+50)', () => darVeredicto(como('admin'), 'admin', 'r_ana', 'ana', { puntosDespues: 50 }));
bloqueo('Confianza: un veredicto falso exige comentario', () =>
  darVeredicto(como('admin'), 'admin', 'r_ana', 'ana', { veredicto: 'falso', puntosAntes: 0, puntosDespues: 0 }));
bloqueo('Confianza: el operador de Maipú no da veredicto a un reporte de Pudahuel', () =>
  darVeredicto(como('opmaipu'), 'opmaipu', 'r_luis', 'luis'));

// 1.0 · Aceptación de los términos y la privacidad.
control('Un vecino acepta los términos (versión y hora del servidor)', () =>
  updateDoc(doc(como('ana'), 'users/ana'), { terminosVersion: '2026-11', terminosAceptadosAt: serverTimestamp(), updatedAt: serverTimestamp() }));
bloqueo('La aceptación de los términos no lleva una fecha inventada', () =>
  updateDoc(doc(como('ana'), 'users/ana'), { terminosVersion: '2026-11', terminosAceptadosAt: Timestamp.fromDate(new Date('2020-01-01')) }));

// Brechas cerradas para la 1.0 (antes figuraban como BRECHA).
bloqueo('Un operador no cambia su propio operadorId', () =>
  updateDoc(doc(como('opmaipu'), 'users/opmaipu'), { operadorId: 'op_pudahuel' }));
if (correosAdmin.length) {
  const correo = correosAdmin.at(-1);
  bloqueo(`Un correo de la lista sin verificar (${correo}) no nace admin`, () =>
    setDoc(doc(entorno.authenticatedContext('intruso', { email: correo, email_verified: false }).firestore(), 'users/intruso'), {
      ...perfil('intruso', 'Intruso', 'admin'), email: correo, emailVerified: false, createdAt: serverTimestamp(),
    }));
  control(`Un correo de la lista ya verificado (${correo}) sí nace admin`, () =>
    setDoc(doc(entorno.authenticatedContext('jefa', { email: correo, email_verified: true }).firestore(), 'users/jefa'), {
      ...perfil('jefa', 'Jefa', 'admin'), email: correo, emailVerified: true, createdAt: serverTimestamp(),
    }));
}
bloqueo('Un reporte no se crea con fecha falsa', () =>
  setDoc(doc(como('ana'), 'reports/x'), reporte('ana', 'Ana Pérez', { createdAt: Timestamp.fromDate(new Date('2020-01-01')) })));

// BRECHA: huecos conocidos de las reglas actuales
brecha(
  'Un reporte no acepta campos extra (validadoComunidad: true)',
  () => setDoc(doc(como('ana'), 'reports/x'), reporte('ana', 'Ana Pérez', { validadoComunidad: true })),
  'En la creación de reports: && request.resource.data.keys().hasOnly([...campos que escribe la app...])',
);
brecha(
  'No se suben fotos sin reporte',
  () => setDoc(doc(como('ana'), 'reportPhotos/fantasma'), {
    reportId: 'fantasma', ownerUid: 'ana', mimeType: 'image/jpeg', dataUrl: 'data:image/jpeg;base64,/9j/AAAA',
  }),
  'En reportPhotos create: && existsAfter(/databases/$(database)/documents/reports/$(reportId)) && getAfter(...).data.uid == request.auth.uid',
);
brecha(
  'No se escriben mensajes en tickets inexistentes',
  () => setDoc(doc(como('ana'), 'supportTickets/no_existe/messages/m1'), {
    ticketId: 'no_existe', autorUid: 'ana', autorRol: 'ciudadano', texto: 'Mensaje huérfano', createdAt: serverTimestamp(),
  }),
  'En messages create: reemplaza !exists(ticket) por existsAfter(ticket) && getAfter(ticket).data.uid == request.auth.uid',
);

// ── Ejecución ────────────────────────────────────────────────────────────────
const informe = new Informe('Pruebas de reglas de seguridad · Ciudad Alerta');
const titulos = {
  control: 'CONTROL · flujos de la app que deben funcionar',
  bloqueo: 'BLOQUEO · accesos que deben rechazarse',
  brecha: 'BRECHA · huecos conocidos (fallan hasta corregirlos)',
};
let controlesFallidos = 0;

for (const tipo of ['control', 'bloqueo', 'brecha']) {
  informe.seccion(titulos[tipo]);
  for (const caso of casos.filter((c) => c.tipo === tipo)) {
    await sembrar();
    if (caso.preparar) await entorno.withSecurityRulesDisabled((ctx) => caso.preparar(ctx.firestore()));
    try {
      if (tipo === 'control') await assertSucceeds(caso.fn());
      else await assertFails(caso.fn());
      informe.ok(caso.nombre);
    } catch (error) {
      if (tipo === 'control') {
        controlesFallidos++;
        informe.agregar('error', `${caso.nombre}: las reglas lo rechazan`, {
          detalle: (error?.message ?? String(error)).split('\n')[0],
          solucion: 'Un usuario legítimo recibe "permiso denegado". Revisa el último cambio a firestore.rules.',
        });
      } else if (tipo === 'bloqueo') {
        informe.agregar('brecha', `${caso.nombre}: las reglas lo PERMITEN`, { solucion: 'Corrige la regla de esa colección.' });
      } else {
        informe.agregar('brecha', `${caso.nombre}: hoy se permite`, { solucion: caso.solucion });
      }
    }
  }
}

if (controlesFallidos) {
  informe.agregar('advertencia', `${controlesFallidos} pruebas de control fallaron: las de bloqueo pueden estar pasando por el motivo equivocado`, {
    detalle: 'Si cambió el formato de los documentos, actualiza las funciones perfil() y reporte() de este script.',
  });
}

await entorno.cleanup();
process.exitCode = informe.cerrar(RAIZ, 'reglas.md');
