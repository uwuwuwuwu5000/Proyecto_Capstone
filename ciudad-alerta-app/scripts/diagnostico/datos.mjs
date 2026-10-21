#!/usr/bin/env node
/**
 * Diagnóstico de integridad de los datos en Firestore y Authentication.
 * Solo lee: no modifica ni borra nada.
 *
 *   set GOOGLE_APPLICATION_CREDENTIALS=C:\claves\ciudad-alerta-admin.json
 *   node scripts/diagnostico/datos.mjs
 *
 * Escribe el informe en diagnostico/datos.md y termina con código 1 si hay
 * errores o brechas.
 *
 * Qué revisa:
 *   - Administradores: correos de la lista sin cuenta (cualquiera podría
 *     registrarlos y ser admin), sin verificar o sin rol.
 *   - Perfiles: cuentas sin perfil, operadores mal vinculados, roles inválidos.
 *   - Catálogo: organismos duplicados o con id irregular, operadores huérfanos.
 *   - Reportes: estados y categorías inválidos, organismo u operador que no
 *     existen o no coinciden, fotos faltantes o sin protección, fechas raras.
 *   - Fotos, confirmaciones, historial y soporte: documentos huérfanos,
 *     autoconfirmaciones, cambios de estado sin firma.
 *
 * Costo: lee cada colección una vez. Con datos de un piloto son pocos miles
 * de lecturas, lejos de las 50.000 diarias del plan Spark.
 */
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Informe, catalogosDeLaApp } from './comun.mjs';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

// ── Credenciales ─────────────────────────────────────────────────────────────
const rutaClave = process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim().replace(/^"(.*)"$/, '$1');
if (!rutaClave) {
  console.error('\n✖ Falta GOOGLE_APPLICATION_CREDENTIALS. Ejemplo (cmd):\n  set GOOGLE_APPLICATION_CREDENTIALS=C:\\claves\\ciudad-alerta-admin.json\n');
  process.exit(1);
}
process.env.GOOGLE_APPLICATION_CREDENTIALS = rutaClave;
let projectId;
try {
  projectId = JSON.parse(readFileSync(rutaClave, 'utf8')).project_id;
} catch (error) {
  console.error(`\n✖ ${error.code === 'ENOENT' ? `No existe ${rutaClave}` : `${rutaClave} no es una clave válida`}.\n`);
  process.exit(1);
}

initializeApp({ credential: applicationDefault(), projectId });
const db = getFirestore();
const auth = getAuth();

const informe = new Informe(`Diagnóstico de datos · ${projectId}`);
console.log(`\nCiudad Alerta · diagnóstico de datos (solo lectura)\nProyecto: ${projectId}`);

// ── Valores esperados, leídos del propio proyecto ────────────────────────────
const reglas = existsSync(join(RAIZ, 'firestore.rules')) ? readFileSync(join(RAIZ, 'firestore.rules'), 'utf8') : '';
// Categorías y transiciones: las mismas de la app (comun/src/reportes).
const catalogos = catalogosDeLaApp(RAIZ);

const CORREOS_ADMIN = [...(reglas.match(/request\.auth\.token\.email\s+in\s+\[([\s\S]*?)\]/)?.[1] ?? '').matchAll(/'([^']+)'/g)].map((m) => m[1].toLowerCase());
const CATEGORIAS = catalogos.categorias;
// Organismos genéricos, los mismos de la app (models/organismo.model.ts).
const modeloOrganismos = existsSync(join(RAIZ, 'src', 'app', 'models', 'organismo.model.ts'))
  ? readFileSync(join(RAIZ, 'src', 'app', 'models', 'organismo.model.ts'), 'utf8')
  : '';
const genericosApp = [...(modeloOrganismos.match(/IDS_ORGANISMOS[^=]*=\s*\[([\s\S]*?)\]/)?.[1] ?? '').matchAll(/'([^']+)'/g)].map((m) => m[1]);
const GENERICOS = genericosApp.length ? genericosApp : ['muni_aseo', 'muni_obras', 'muni_oirs', 'elec_dist', 'sanitaria'];
const TRANSICIONES = Object.keys(catalogos.transiciones).length
  ? catalogos.transiciones
  : {
      reportado: ['en_revision', 'derivado', 'cerrado'],
      en_revision: ['derivado', 'cerrado'],
      derivado: ['en_proceso', 'cerrado'],
      en_proceso: ['resuelto', 'cerrado'],
      resuelto: ['cerrado'],
      cerrado: [],
    };
const ESTADOS = Object.keys(TRANSICIONES);

const muestra = (lista, n = 8) => (lista.length > n ? `${lista.slice(0, n).join(', ')} … (+${lista.length - n})` : lista.join(', '));
const ms = (t) => (typeof t?.toMillis === 'function' ? t.toMillis() : null);
const normalizar = (t) => (t ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();

// ── Lectura ──────────────────────────────────────────────────────────────────
informe.seccion('Lectura de datos');
let lecturas = 0;
const leerColeccion = async (consulta) => {
  const snap = await consulta.get();
  lecturas += Math.max(snap.size, 1);
  return snap.docs;
};

const usuariosAuth = new Map();
let pagina;
do {
  const r = await auth.listUsers(1000, pagina);
  r.users.forEach((u) => usuariosAuth.set(u.uid, u));
  pagina = r.pageToken;
} while (pagina);

const [perfiles, organismos, operadores, reportes, fotos, historial, confirmaciones, tickets, mensajes, categorias] =
  await Promise.all([
    leerColeccion(db.collection('users')),
    leerColeccion(db.collection('organismos')),
    leerColeccion(db.collection('operadores')),
    leerColeccion(db.collection('reports')),
    leerColeccion(db.collection('reportPhotos').select('ownerUid', 'reportId')),
    leerColeccion(db.collectionGroup('statusHistory')),
    leerColeccion(db.collectionGroup('confirmations').select('uid', 'reportId')),
    leerColeccion(db.collection('supportTickets')),
    leerColeccion(db.collectionGroup('messages').select('ticketId', 'autorRol')),
    leerColeccion(db.collection('categorias')),
  ]);

informe.ok(
  `${usuariosAuth.size} cuentas, ${perfiles.length} perfiles, ${reportes.length} reportes, ${fotos.length} fotos, ` +
    `${organismos.length} organismos, ${operadores.length} operadores, ${historial.length} cambios de estado, ` +
    `${confirmaciones.length} confirmaciones, ${tickets.length} tickets (≈${lecturas} lecturas)`,
);

const perfilPorUid = new Map(perfiles.map((d) => [d.id, d.data()]));
const organismoPorId = new Map(organismos.map((d) => [d.id, d.data()]));
const operadorPorId = new Map(operadores.map((d) => [d.id, d.data()]));
const reportePorId = new Map(reportes.map((d) => [d.id, d.data()]));
const fotoPorId = new Map(fotos.map((d) => [d.id, d.data()]));
const ticketPorId = new Map(tickets.map((d) => [d.id, d.data()]));
const categoriaCatalogo = new Map(categorias.map((d) => [d.id, d.data()]));

// ── Administradores ──────────────────────────────────────────────────────────
informe.seccion('Administradores');
if (!CORREOS_ADMIN.length) informe.agregar('info', 'No se pudo leer la lista de administradores de firestore.rules.');
const porCorreo = new Map([...usuariosAuth.values()].filter((u) => u.email).map((u) => [u.email.toLowerCase(), u]));
for (const correo of CORREOS_ADMIN) {
  const cuenta = porCorreo.get(correo);
  if (!cuenta) {
    informe.agregar('brecha', `${correo} está en la lista de administradores pero no tiene cuenta`, {
      detalle: 'Las reglas no exigen correo verificado: quien registre ese correo primero obtiene rol admin.',
      solucion: 'Crea la cuenta ahora con ese correo, o quítalo de la lista en firestore.rules y admin-emails.ts.',
    });
    continue;
  }
  if (!cuenta.emailVerified) informe.agregar('advertencia', `${correo}: cuenta de administrador con el correo sin verificar`);
  const rol = perfilPorUid.get(cuenta.uid)?.role;
  if (rol !== 'admin') informe.agregar('info', `${correo}: está en la lista pero su perfil tiene rol '${rol ?? 'sin perfil'}'`, {
    detalle: 'Las reglas de gestión leen el rol del perfil; la lista solo permite crear organismos y autopromoverse.',
  });
}
for (const [uid, p] of perfilPorUid) {
  if (p.role === 'admin' && !CORREOS_ADMIN.includes((p.email ?? usuariosAuth.get(uid)?.email ?? '').toLowerCase())) {
    informe.agregar('info', `Perfil admin fuera de la lista de correos: ${p.email ?? uid}`, { detalle: 'Asignado a mano en la consola.' });
  }
}

// ── Perfiles ─────────────────────────────────────────────────────────────────
informe.seccion('Cuentas y perfiles');
const sinPerfil = [...usuariosAuth.values()].filter((u) => !perfilPorUid.has(u.uid));
if (sinPerfil.length) {
  informe.agregar('advertencia', `${sinPerfil.length} cuentas sin documento en users/: ${muestra(sinPerfil.map((u) => u.email ?? u.uid))}`, {
    detalle: 'La app crea el perfil al iniciar sesión (asegurarPerfil); si persiste, esas personas no pueden aparecer como autoras.',
  });
}
const perfilesHuerfanos = perfiles.filter((d) => !usuariosAuth.has(d.id));
if (perfilesHuerfanos.length) {
  informe.agregar('info', `${perfilesHuerfanos.length} perfiles de cuentas ya eliminadas en Authentication`);
}

for (const [uid, p] of perfilPorUid) {
  const quien = p.email ?? uid;
  if (!['ciudadano', 'operador', 'admin'].includes(p.role)) {
    informe.agregar('error', `Perfil ${quien} con rol inválido '${p.role}'`);
  }
  if (p.uid && p.uid !== uid) informe.agregar('error', `Perfil ${quien}: el campo uid (${p.uid}) no coincide con el id del documento`);
  if ((p.trustLevel ?? 0) !== 0 || (p.validatedReports ?? 0) !== 0) {
    informe.agregar('info', `Perfil ${quien} con trustLevel/validatedReports distintos de 0 (asignados a mano)`);
  }
  if (p.role === 'operador') {
    if (!p.operadorId) {
      informe.agregar('error', `Cuenta operador ${quien} sin operadorId: no ve ni gestiona ningún reporte`);
      continue;
    }
    const op = operadorPorId.get(p.operadorId);
    if (!op) informe.agregar('error', `Cuenta operador ${quien} apunta a operadores/${p.operadorId}, que no existe`);
    else if (op.activo !== true) informe.agregar('advertencia', `Cuenta operador ${quien}: su operador ${p.operadorId} está inactivo`);
  } else if (p.operadorId) {
    informe.agregar('info', `Perfil ${quien} (rol ${p.role}) conserva un operadorId (${p.operadorId})`);
  }
}

// ── Catálogo de organismos y operadores ──────────────────────────────────────
informe.seccion('Organismos y operadores');
const porComuna = new Map();
for (const [id, o] of organismoPorId) {
  if (o.id && o.id !== id) informe.agregar('error', `organismos/${id}: el campo id dice '${o.id}'`);
  if (!/^muni_\d{5}$/.test(id) && !GENERICOS.includes(id)) {
    informe.agregar('advertencia', `organismos/${id}: id que no sigue el formato muni_<código CUT>`, {
      detalle: 'La app nunca asigna reportes a ese documento, así que lo que caiga ahí queda sin responsable.',
    });
  }
  for (const cut of o.comunasAtendidas ?? []) {
    if (!porComuna.has(cut)) porComuna.set(cut, []);
    porComuna.get(cut).push(id);
  }
  const clave = `nombre:${normalizar(o.comuna)}`;
  if (o.comuna) {
    if (!porComuna.has(clave)) porComuna.set(clave, []);
    porComuna.get(clave).push(id);
  }
}
const duplicadosVistos = new Set();
for (const [clave, ids] of porComuna) {
  const firma = [...new Set(ids)].sort().join(',');
  if (ids.length > 1 && !duplicadosVistos.has(firma)) {
    duplicadosVistos.add(firma);
    informe.agregar('advertencia', `Varios organismos atienden la misma comuna (${clave.replace('nombre:', '')}): ${ids.join(', ')}`, {
      detalle: 'La app usa muni_<código CUT>; el otro documento es un duplicado que conviene eliminar tras reasignar sus reportes.',
    });
  }
}
const inactivos = [...organismoPorId.values()].filter((o) => o.activo === false).length;
informe.agregar('info', `${organismoPorId.size} organismos (${inactivos} inactivos). Chile tiene 345 municipalidades.`);

const activosPorOrganismo = new Map();
const cuentasPorOperador = new Map();
for (const p of perfilPorUid.values()) if (p.role === 'operador' && p.operadorId) cuentasPorOperador.set(p.operadorId, (cuentasPorOperador.get(p.operadorId) ?? 0) + 1);
for (const [id, op] of operadorPorId) {
  if (op.id && op.id !== id) informe.agregar('advertencia', `operadores/${id}: el campo id dice '${op.id}'`);
  if (!organismoPorId.has(op.organismoId)) {
    informe.agregar('error', `operadores/${id} apunta a organismos/${op.organismoId}, que no existe`);
  }
  if (organismoPorId.has(id)) {
    informe.agregar('info', `operadores/${id} tiene el mismo id que un organismo; es fácil confundirlos al editar`);
  }
  if (op.activo === true) {
    if (!activosPorOrganismo.has(op.organismoId)) activosPorOrganismo.set(op.organismoId, []);
    activosPorOrganismo.get(op.organismoId).push(id);
    if (!cuentasPorOperador.has(id)) {
      informe.agregar('advertencia', `operadores/${id} está activo pero ninguna cuenta lo usa: sus reportes no los gestiona nadie`, {
        solucion: 'Crea una cuenta con rol operador y operadorId = ' + id + ', o desactívalo.',
      });
    }
  }
}
for (const [org, ids] of activosPorOrganismo) {
  if (ids.length > 1) {
    informe.agregar('info', `${org} tiene ${ids.length} operadores activos (${ids.join(', ')}); la app asigna siempre el primero en orden alfabético: ${[...ids].sort()[0]}`);
  }
}

// ── Reportes ─────────────────────────────────────────────────────────────────
informe.seccion('Reportes');
const confirmacionesPorReporte = new Map();
for (const c of confirmaciones) {
  const rid = c.ref.parent.parent.id;
  confirmacionesPorReporte.set(rid, (confirmacionesPorReporte.get(rid) ?? 0) + 1);
}

const contar = {};
const anotar = (clave, id) => (contar[clave] ??= []).push(id);
const ahora = Date.now();

for (const [id, r] of reportePorId) {
  if (!ESTADOS.includes(r.estado)) anotar('estado', id);
  if (CATEGORIAS.length && !CATEGORIAS.includes(r.categoria) && !categoriaCatalogo.has(r.categoria)) anotar('categoria', id);
  if (!r.uid) anotar('sinAutor', id);
  else if (!usuariosAuth.has(r.uid)) anotar('autorEliminado', id);

  const creado = ms(r.createdAt);
  if (creado === null) anotar('sinFecha', id);
  else if (creado > ahora + 5 * 60 * 1000) anotar('fechaFutura', id);

  const u = r.ubicacion;
  if (!u || typeof u.lat !== 'number' || typeof u.lng !== 'number' || Math.abs(u.lat) > 90 || Math.abs(u.lng) > 180) anotar('ubicacion', id);
  else if (u.lat > -17 || u.lat < -56.5 || u.lng > -66 || u.lng < -110) anotar('fueraDeChile', id);

  if (!r.comuna) anotar('sinComuna', id);

  const orgId = r.organismo?.id;
  if (!orgId) anotar('sinOrganismo', id);
  else if (!GENERICOS.includes(orgId) && !organismoPorId.has(orgId)) anotar('organismoInexistente', id);
  else if (orgId === 'muni_oirs' && r.comuna) anotar('genericoConComuna', id);

  if (r.operadorId) {
    const op = operadorPorId.get(r.operadorId);
    if (!op) anotar('operadorInexistente', id);
    else if (op.organismoId !== orgId) anotar('operadorIncoherente', id);
  } else if (orgId && activosPorOrganismo.has(orgId) && !['resuelto', 'cerrado'].includes(r.estado)) {
    anotar('sinOperador', id);
  }

  if (r.foto) {
    if (r.foto.privacidad?.aplicada !== true) anotar('fotoSinProteccion', id);
    if (r.foto.kind === 'firestore') {
      const f = fotoPorId.get(id) ?? (r.foto.path ? fotoPorId.get(r.foto.path.split('/').pop()) : null);
      if (!f) anotar('fotoFaltante', id);
      else if (f.ownerUid && f.ownerUid !== r.uid) anotar('fotoAjena', id);
    }
  }

  const desc = r.descripcion ?? '';
  if (desc.length < 10 || desc.length > 500) anotar('descripcion', id);

  const reales = confirmacionesPorReporte.get(id) ?? 0;
  if ((r.confirmaciones ?? 0) !== reales) anotar('contador', id);
}

const reglasReportes = [
  ['estado', 'error', 'reportes con un estado que la app no conoce'],
  ['categoria', 'advertencia', 'reportes con una categoría fuera del catálogo'],
  ['sinAutor', 'error', 'reportes sin uid de autor'],
  ['autorEliminado', 'info', 'reportes de cuentas ya eliminadas'],
  ['sinFecha', 'error', 'reportes sin createdAt: no aparecen en listados ordenados por fecha'],
  ['fechaFutura', 'advertencia', 'reportes con fecha en el futuro (createdAt manipulado o reloj del teléfono)'],
  ['ubicacion', 'error', 'reportes con ubicación inválida: no se pueden dibujar en el mapa'],
  ['fueraDeChile', 'info', 'reportes con coordenadas fuera de Chile continental'],
  ['sinComuna', 'info', 'reportes sin comuna detectada'],
  ['sinOrganismo', 'advertencia', 'reportes sin organismo asignado'],
  ['organismoInexistente', 'error', 'reportes asignados a un organismo que no existe'],
  ['genericoConComuna', 'advertencia', 'reportes con comuna detectada pero derivados al genérico muni_oirs (falta esa municipalidad en el catálogo)'],
  ['operadorInexistente', 'error', 'reportes con un operadorId que no existe'],
  ['operadorIncoherente', 'advertencia', 'reportes cuyo operador pertenece a otro organismo'],
  ['sinOperador', 'advertencia', 'reportes abiertos sin operador aunque su organismo ya tiene uno activo'],
  ['fotoSinProteccion', 'brecha', 'reportes con foto sin desenfoque registrado (privacidad.aplicada ≠ true)'],
  ['fotoFaltante', 'error', 'reportes cuya foto no existe en reportPhotos'],
  ['fotoAjena', 'brecha', 'reportes cuya foto subió otra persona'],
  ['descripcion', 'advertencia', 'reportes con descripción fuera de 10–500 caracteres'],
  ['contador', 'info', 'reportes con el campo confirmaciones distinto al número real (esperable sin Cloud Functions)'],
];
for (const [clave, nivel, texto] of reglasReportes) {
  if (contar[clave]?.length) informe.agregar(nivel, `${contar[clave].length} ${texto}`, { detalle: `Ids: ${muestra(contar[clave])}` });
}
if (!Object.keys(contar).some((k) => !['sinComuna', 'contador', 'autorEliminado', 'fueraDeChile'].includes(k))) {
  informe.ok(`${reportePorId.size} reportes sin inconsistencias graves`);
}

// ── Fotos, confirmaciones, historial y soporte ───────────────────────────────
informe.seccion('Fotos, confirmaciones, historial y soporte');
const fotosHuerfanas = fotos.filter((d) => !reportePorId.has(d.id));
if (fotosHuerfanas.length) {
  informe.agregar('advertencia', `${fotosHuerfanas.length} fotos en reportPhotos sin reporte`, {
    detalle: `Ocupan almacenamiento y contienen imágenes de personas sin finalidad. Ids: ${muestra(fotosHuerfanas.map((d) => d.id))}`,
  });
}

const autoconfirmadas = [];
const porOperadores = [];
const confirmacionesHuerfanas = [];
for (const c of confirmaciones) {
  const rid = c.ref.parent.parent.id;
  const r = reportePorId.get(rid);
  if (!r) confirmacionesHuerfanas.push(rid);
  else if (c.id === r.uid) autoconfirmadas.push(rid);
  if (perfilPorUid.get(c.id)?.role === 'operador') porOperadores.push(rid);
}
if (autoconfirmadas.length) informe.agregar('brecha', `${autoconfirmadas.length} reportes confirmados por su propio autor`, { detalle: `Ids: ${muestra(autoconfirmadas)}` });
if (porOperadores.length) informe.agregar('advertencia', `${porOperadores.length} confirmaciones hechas por cuentas operador`, { detalle: `Reportes: ${muestra(porOperadores)}` });
if (confirmacionesHuerfanas.length) informe.agregar('info', `${confirmacionesHuerfanas.length} confirmaciones de reportes eliminados`);

const historialPorReporte = new Map();
let sinRol = 0;
let sinNombre = 0;
const saltos = [];
for (const h of historial) {
  const rid = h.ref.parent.parent.id;
  const d = h.data();
  if (!d.autorRol) sinRol++;
  if (!d.autorNombre) sinNombre++;
  if (d.desde && d.hacia && !(TRANSICIONES[d.desde] ?? []).includes(d.hacia)) saltos.push(`${rid} (${d.desde}→${d.hacia})`);
  const lista = historialPorReporte.get(rid) ?? [];
  lista.push(d);
  historialPorReporte.set(rid, lista);
}
if (sinRol || sinNombre) {
  informe.agregar('advertencia', `${Math.max(sinRol, sinNombre)} cambios de estado sin firma (autorRol: ${sinRol}, autorNombre: ${sinNombre})`, {
    detalle: 'El historial público los muestra como "Autor no registrado". Suelen venir del portal web o de la consola.',
  });
}
if (saltos.length) informe.agregar('advertencia', `${saltos.length} cambios de estado con transición no permitida: ${muestra(saltos)}`);

const desincronizados = [];
for (const [rid, r] of reportePorId) {
  const lista = historialPorReporte.get(rid);
  if (!lista?.length) {
    if (r.estado && r.estado !== 'reportado') desincronizados.push(`${rid} (${r.estado}, sin historial)`);
    continue;
  }
  const ultimo = lista.sort((a, b) => (ms(a.createdAt) ?? 0) - (ms(b.createdAt) ?? 0)).at(-1);
  if (ultimo.hacia && ultimo.hacia !== r.estado) desincronizados.push(`${rid} (${r.estado} ≠ ${ultimo.hacia})`);
}
if (desincronizados.length) {
  informe.agregar('advertencia', `${desincronizados.length} reportes cuyo estado no coincide con su último cambio registrado`, {
    detalle: `El estado se cambió sin dejar historial (consola o portal) y el ciudadano no recibió aviso. ${muestra(desincronizados)}`,
  });
}

const mensajesHuerfanos = mensajes.filter((m) => !ticketPorId.has(m.ref.parent.parent.id));
if (mensajesHuerfanos.length) {
  informe.agregar('advertencia', `${mensajesHuerfanos.length} mensajes de soporte en tickets que no existen`, {
    detalle: 'Las reglas permiten escribir mensajes cuando el ticket aún no existe; esto muestra que se usó fuera del flujo normal.',
  });
}
const conMensajes = new Set(mensajes.map((m) => m.ref.parent.parent.id));
const ticketsVacios = tickets.filter((t) => !conMensajes.has(t.id));
if (ticketsVacios.length) informe.agregar('info', `${ticketsVacios.length} tickets de soporte sin mensajes`);
const ticketsAbiertos = tickets.filter((t) => t.get('estado') === 'abierto');
if (ticketsAbiertos.length) informe.agregar('info', `${ticketsAbiertos.length} tickets de soporte abiertos sin atender`);

process.exitCode = informe.cerrar(RAIZ, 'datos.md');
