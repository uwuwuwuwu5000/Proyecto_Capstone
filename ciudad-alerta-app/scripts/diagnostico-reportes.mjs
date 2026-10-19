#!/usr/bin/env node
/**
 * Diagnóstico de reportes: muestra qué llegó realmente a Firestore.
 * Solo lee; nunca escribe.
 *
 *   node scripts/diagnostico-reportes.mjs --correo=amigo@gmail.com
 *   node scripts/diagnostico-reportes.mjs --comuna="San Bernardo"
 *   node scripts/diagnostico-reportes.mjs --dias=7          (resumen por comuna)
 *
 * Combinables. --dias limita el período (por defecto 14).
 *
 * Usa la misma clave de cuenta de servicio que corregir-maipu.mjs:
 *   set GOOGLE_APPLICATION_CREDENTIALS=C:\claves\ciudad-alerta-admin.json
 *
 * Para cada reporte indica comuna y cómo se detectó, estado, organismo,
 * operador y si la foto existe de verdad en `reportPhotos`, con su tamaño.
 */
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { readFileSync } from 'node:fs';

const argumento = (nombre) =>
  process.argv.find((a) => a.startsWith(`--${nombre}=`))?.slice(nombre.length + 3).trim().replace(/^"(.*)"$/, '$1') || null;

const CORREO = argumento('correo');
const UID = argumento('uid');
const COMUNA = argumento('comuna');
const DIAS = Number(argumento('dias') ?? 14);

function terminar(mensaje) {
  console.error(`\n✖ ${mensaje}\n`);
  process.exit(1);
}

// ── Credenciales ─────────────────────────────────────────────────────────────
const rutaClave = process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim().replace(/^"(.*)"$/, '$1');
if (!rutaClave) terminar('Falta GOOGLE_APPLICATION_CREDENTIALS (ver corregir-maipu.mjs).');
process.env.GOOGLE_APPLICATION_CREDENTIALS = rutaClave;
let projectId;
try {
  projectId = JSON.parse(readFileSync(rutaClave, 'utf8')).project_id;
} catch (error) {
  terminar(error.code === 'ENOENT' ? `No existe ${rutaClave}.` : `${rutaClave} no es una clave válida.`);
}

initializeApp({ credential: applicationDefault(), projectId });
const db = getFirestore();
const auth = getAuth();

const desde = Timestamp.fromMillis(Date.now() - DIAS * 24 * 60 * 60 * 1000);
const fecha = (t) =>
  t?.toDate?.().toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Santiago' }) ?? '—';
const normalizar = (t) => (t ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();

console.log(`\nProyecto: ${projectId} · últimos ${DIAS} días · solo lectura\n`);

/** Una línea por reporte, con el estado real de su foto. */
async function describir(reportes) {
  for (const d of reportes) {
    const r = d.data();
    let foto = 'sin foto';
    if (r.foto) {
      const aplicada = r.foto.privacidad?.aplicada === true ? 'protegida' : 'SIN protección registrada';
      if (r.foto.kind === 'firestore' && r.foto.path) {
        const f = await db.doc(r.foto.path).get();
        foto = f.exists
          ? `foto OK (${Math.round((f.get('dataUrl')?.length ?? 0) / 1024)} KB, ${aplicada})`
          : `FOTO FALTANTE: el reporte apunta a ${r.foto.path} pero no existe`;
      } else {
        foto = `foto en ${r.foto.kind ?? '?'}:${r.foto.path ?? '?'} (${aplicada})`;
      }
    }
    console.log(
      `  · ${d.id}  ${fecha(r.createdAt)}  ${r.estado}\n` +
        `      comuna: ${r.comuna ?? 'NO DETECTADA'} (${r.comunaFuente ?? 'sin fuente'})` +
        `  organismo: ${r.organismo?.id ?? '—'}  operador: ${r.operadorId ?? '—'}\n` +
        `      ${foto}\n` +
        `      "${(r.descripcion ?? '').slice(0, 70)}"`,
    );
  }
}

// ── Por usuario ──────────────────────────────────────────────────────────────
if (CORREO || UID) {
  let usuario;
  try {
    usuario = CORREO ? await auth.getUserByEmail(CORREO) : await auth.getUser(UID);
  } catch {
    terminar(`No existe una cuenta con ${CORREO ?? UID} en Authentication. ¿Se registró con otro correo?`);
  }

  const perfil = await db.doc(`users/${usuario.uid}`).get();
  console.log(`Usuario ${usuario.email} (uid ${usuario.uid})`);
  console.log(`  cuenta creada: ${usuario.metadata.creationTime}`);
  console.log(`  último ingreso: ${usuario.metadata.lastSignInTime}`);
  console.log(`  correo verificado: ${usuario.emailVerified ? 'sí' : 'no'}`);
  console.log(
    perfil.exists
      ? `  perfil: rol ${perfil.get('role')} · nombre "${perfil.get('displayName') ?? '—'}" · último reporte ${fecha(perfil.get('ultimoReporteAt'))}`
      : '  ✖ NO tiene documento en users/: la app no puede crear reportes para esta cuenta.',
  );

  const reportes = (await db.collection('reports').where('uid', '==', usuario.uid).get()).docs.sort(
    (a, b) => (b.get('createdAt')?.toMillis?.() ?? 0) - (a.get('createdAt')?.toMillis?.() ?? 0),
  );
  console.log(`\n  Reportes de este usuario: ${reportes.length}`);
  await describir(reportes);

  const tickets = await db.collection('supportTickets').where('uid', '==', usuario.uid).get();
  if (!tickets.empty) {
    console.log(`\n  Mensajes de soporte: ${tickets.size}`);
    tickets.docs.forEach((t) => console.log(`  · ${t.get('tipo')}: ${t.get('asunto')} — "${t.get('lastMessagePreview') ?? ''}"`));
  }

  if (reportes.length === 0) {
    console.log(
      '\n  → Ningún reporte llegó a Firestore. El envío falló en el teléfono antes de guardarse:' +
        '\n    revisa qué mensaje vio al pulsar "Enviar" (protección de la foto, ubicación, conexión' +
        '\n    o "espera unos segundos antes de otro reporte").',
    );
  }
  console.log('');
}

// ── Por comuna ───────────────────────────────────────────────────────────────
if (COMUNA) {
  const todos = (await db.collection('reports').where('createdAt', '>=', desde).get()).docs;
  const buscada = normalizar(COMUNA);
  const deLaComuna = todos
    .filter((d) => normalizar(d.get('comuna')) === buscada)
    .sort((a, b) => (b.get('createdAt')?.toMillis?.() ?? 0) - (a.get('createdAt')?.toMillis?.() ?? 0));
  console.log(`Reportes en ${COMUNA}: ${deLaComuna.length}`);
  await describir(deLaComuna);
  console.log('');
}

// ── Resumen por comuna ───────────────────────────────────────────────────────
if (!CORREO && !UID && !COMUNA) {
  const todos = (await db.collection('reports').where('createdAt', '>=', desde).get()).docs;
  const porComuna = new Map();
  for (const d of todos) {
    const clave = d.get('comuna') ?? '(comuna no detectada)';
    const fila = porComuna.get(clave) ?? { total: 0, conFoto: 0 };
    fila.total += 1;
    if (d.get('foto')) fila.conFoto += 1;
    porComuna.set(clave, fila);
  }
  console.log(`Reportes de los últimos ${DIAS} días: ${todos.length}`);
  [...porComuna.entries()]
    .sort((a, b) => b[1].total - a[1].total)
    .forEach(([comuna, f]) => console.log(`  ${String(f.total).padStart(4)}  ${comuna}  (${f.conFoto} con foto)`));
  console.log('\nPara ver el detalle: --comuna="Nombre" o --correo=persona@correo.cl\n');
}
