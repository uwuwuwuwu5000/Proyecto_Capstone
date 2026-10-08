#!/usr/bin/env node
/**
 * Corrige el catálogo de Maipú en Firestore.
 *
 *   1. operadores/op_maipu      → organismoId 'muni_13119' y activo true.
 *   2. Reportes con organismo 'muni_maipu' cuya comuna es Maipú
 *                               → organismo 'muni_13119' y operador 'op_maipu'.
 *   3. Reportes abiertos de 'muni_13119' sin operador
 *                               → operador 'op_maipu'.
 *   4. organismos/muni_maipu    → se borra solo si ya nada lo referencia.
 *
 * Por defecto SOLO muestra el diagnóstico y no escribe nada.
 * Con --aplicar guarda un respaldo de lo que cambia y después escribe.
 *
 * Usa el Admin SDK, que no pasa por las reglas de seguridad. Por eso pide una
 * clave de cuenta de servicio, que NUNCA debe quedar dentro del repositorio.
 *
 *   npm install -D firebase-admin
 *   (cmd)        set GOOGLE_APPLICATION_CREDENTIALS=C:\claves\ciudad-alerta-admin.json
 *   (PowerShell) $env:GOOGLE_APPLICATION_CREDENTIALS="C:\claves\ciudad-alerta-admin.json"
 *   node scripts/corregir-maipu.mjs             # diagnóstico
 *   node scripts/corregir-maipu.mjs --aplicar   # corrección
 *   Opcional: --operador=<id> --duplicado=<id> si los ids reales son otros.
 *
 * No toca `updatedAt` de los reportes: la campana de avisos usa ese campo para
 * detectar cambios y el ciudadano recibiría un aviso por algo que no es un
 * cambio de estado.
 */
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const APLICAR = process.argv.includes('--aplicar');
const argumento = (nombre, porDefecto) =>
  process.argv.find((a) => a.startsWith(`--${nombre}=`))?.split('=')[1]?.trim() || porDefecto;

// Se pueden cambiar sin editar el archivo: --operador=<id> --duplicado=<id>
const DUPLICADO = argumento('duplicado', 'muni_maipu');
const OFICIAL = 'muni_13119';
const OPERADOR = argumento('operador', 'op_maipu');
const ESTADOS_INACTIVOS = new Set(['resuelto', 'cerrado']);
const TAMANO_LOTE = 400; // el máximo de Firestore es 500 escrituras por lote

const normalizar = (texto) =>
  (texto ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();

function terminar(mensaje) {
  console.error(`\n✖ ${mensaje}\n`);
  process.exit(1);
}

// ── Credenciales y proyecto ──────────────────────────────────────────────────
// En cmd, `set VAR="C:\ruta"` guarda las comillas dentro del valor. Se quitan
// aquí y se devuelve la ruta limpia a la variable, que el Admin SDK lee después.
const rutaClave = process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim().replace(/^"(.*)"$/, '$1');
if (rutaClave) process.env.GOOGLE_APPLICATION_CREDENTIALS = rutaClave;
if (!rutaClave) {
  terminar(
    'Falta GOOGLE_APPLICATION_CREDENTIALS. Descarga la clave en Firebase → Configuración del ' +
      'proyecto → Cuentas de servicio → Generar nueva clave privada, guárdala FUERA del proyecto ' +
      'y apunta la variable a ese archivo.',
  );
}
let projectId;
try {
  projectId = JSON.parse(readFileSync(rutaClave, 'utf8')).project_id;
} catch (error) {
  terminar(
    error.code === 'ENOENT'
      ? `No existe ningún archivo en ${rutaClave}. Revisa la carpeta y el nombre exacto ` +
          '(la clave descargada se llama algo como "<proyecto>-firebase-adminsdk-xxxxx.json").'
      : `El archivo ${rutaClave} existe pero no es una clave JSON válida (${error.message}).`,
  );
}
if (!projectId) terminar(`${rutaClave} no parece una clave de cuenta de servicio: no tiene project_id.`);

initializeApp({ credential: applicationDefault(), projectId });
const db = getFirestore();

console.log(`Proyecto: ${projectId}`);
console.log(APLICAR ? 'Modo: APLICAR (escribe cambios)\n' : 'Modo: diagnóstico (no escribe nada)\n');

// ── Lectura ──────────────────────────────────────────────────────────────────
const [oficialSnap, duplicadoSnap, operadorSnap] = await Promise.all([
  db.doc(`organismos/${OFICIAL}`).get(),
  db.doc(`organismos/${DUPLICADO}`).get(),
  db.doc(`operadores/${OPERADOR}`).get(),
]);

if (!oficialSnap.exists) {
  terminar(`No existe organismos/${OFICIAL}. Carga el catálogo de municipalidades antes de corregir.`);
}
if (!operadorSnap.exists) {
  // Muestra lo que sí hay, para elegir el id correcto con --operador=<id>.
  const [operadores, organismosMaipu] = await Promise.all([
    db.collection('operadores').get(),
    db.collection('organismos').where('comuna', 'in', ['Maipú', 'Maipu', 'MAIPÚ', 'MAIPU', 'maipu']).get(),
  ]);
  console.log(`No existe operadores/${OPERADOR}. Operadores registrados (${operadores.size}):`);
  operadores.docs.forEach((d) =>
    console.log(
      `   · doc=${d.id}  id=${d.get('id') ?? '—'}  nombre=${d.get('nombre') ?? '—'}  ` +
        `organismoId=${d.get('organismoId') ?? '—'}  activo=${d.get('activo')}`,
    ),
  );
  console.log(`\nOrganismos con comuna Maipú (${organismosMaipu.size}):`);
  organismosMaipu.docs.forEach((d) =>
    console.log(`   · doc=${d.id}  nombre=${d.get('nombre') ?? '—'}  activo=${d.get('activo')}`),
  );
  console.log(`\norganismos/${DUPLICADO}: ${duplicadoSnap.exists ? 'existe' : 'no existe'}`);
  terminar(
    'Vuelve a ejecutar indicando el operador que corresponde a Maipú, por ejemplo:\n' +
      '  node scripts/corregir-maipu.mjs --operador=EL_DOC_ID',
  );
}

const oficial = oficialSnap.data();
if (oficial.activo === false) {
  terminar(`organismos/${OFICIAL} está marcado como inactivo. Actívalo antes de reasignar.`);
}

// La misma copia reducida que guarda la app al crear un reporte.
const organismoCopia = {
  id: OFICIAL,
  nombre: oficial.nombre,
  tipo: oficial.tipo,
  comuna: oficial.comuna ?? null,
};
const comunaOficial = normalizar(oficial.comuna ?? 'Maipú');

const [repDuplicado, repOficial, repOperador, opsDuplicado, opsOficial] = await Promise.all([
  db.collection('reports').where('organismo.id', '==', DUPLICADO).get(),
  db.collection('reports').where('organismo.id', '==', OFICIAL).get(),
  db.collection('reports').where('operadorId', '==', OPERADOR).get(),
  db.collection('operadores').where('organismoId', '==', DUPLICADO).get(),
  db.collection('operadores').where('organismoId', '==', OFICIAL).get(),
]);

// ── Clasificación ────────────────────────────────────────────────────────────
const aMover = [];   // muni_maipu con comuna Maipú → se corrigen
const aRevisar = []; // muni_maipu con otra comuna o sin comuna → revisión manual
for (const d of repDuplicado.docs) {
  (normalizar(d.get('comuna')) === comunaOficial ? aMover : aRevisar).push(d);
}

const sinOperador = repOficial.docs.filter(
  (d) => !d.get('operadorId') && !ESTADOS_INACTIVOS.has(d.get('estado')),
);

const idsAMover = new Set(aMover.map((d) => d.id));
const operadorFueraDeLugar = repOperador.docs.filter(
  (d) => d.get('organismo.id') !== OFICIAL && !idsAMover.has(d.id),
);

// La app asigna el primer operador activo del organismo en orden alfabético.
const competidores = opsOficial.docs
  .filter((d) => d.id !== OPERADOR && d.get('activo') === true && d.id.localeCompare(OPERADOR) < 0)
  .map((d) => d.id);

const operador = operadorSnap.data();

// ── Diagnóstico ──────────────────────────────────────────────────────────────
const linea = (d) =>
  `   · ${d.id}  estado=${d.get('estado') ?? '—'}  comuna=${d.get('comuna') ?? '—'}  operador=${d.get('operadorId') ?? '—'}`;

console.log(`Operador ${OPERADOR}: organismoId=${operador.organismoId}  activo=${operador.activo}`);
console.log(
  operador.organismoId === OFICIAL && operador.activo === true
    ? '   ✓ ya está correcto'
    : `   → se cambiará a organismoId=${OFICIAL}, activo=true`,
);

console.log(`\nOrganismo ${DUPLICADO}: ${duplicadoSnap.exists ? 'existe' : 'no existe (nada que borrar)'}`);

console.log(`\nReportes con organismo ${DUPLICADO} y comuna Maipú (se reasignan): ${aMover.length}`);
aMover.forEach((d) => console.log(linea(d)));

console.log(`\nReportes con organismo ${DUPLICADO} y OTRA comuna (no se tocan, revísalos): ${aRevisar.length}`);
aRevisar.forEach((d) => console.log(linea(d)));

console.log(`\nReportes abiertos de ${OFICIAL} sin operador (se asignan a ${OPERADOR}): ${sinOperador.length}`);
sinOperador.forEach((d) => console.log(linea(d)));

console.log(`\nReportes de ${OPERADOR} con otro organismo (no se tocan, revísalos): ${operadorFueraDeLugar.length}`);
operadorFueraDeLugar.forEach((d) => console.log(`${linea(d)}  organismo=${d.get('organismo.id') ?? '—'}`));

console.log(`\nOperadores que apuntan a ${DUPLICADO}: ${opsDuplicado.size}`);
opsDuplicado.docs.forEach((d) => console.log(`   · ${d.id}`));

if (competidores.length) {
  console.log(
    `\n⚠ Hay operadores activos de ${OFICIAL} que van antes que ${OPERADOR} en orden alfabético: ` +
      `${competidores.join(', ')}. La app les asignará los reportes nuevos a ellos.`,
  );
}

if (!APLICAR) {
  console.log('\nNada se escribió. Si el diagnóstico es correcto, vuelve a ejecutar con --aplicar.\n');
  process.exit(0);
}

// ── Respaldo ─────────────────────────────────────────────────────────────────
const carpeta = join(dirname(fileURLToPath(import.meta.url)), 'respaldos');
mkdirSync(carpeta, { recursive: true });
const archivoRespaldo = join(carpeta, `maipu-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
writeFileSync(
  archivoRespaldo,
  JSON.stringify(
    {
      proyecto: projectId,
      fecha: new Date().toISOString(),
      operador: { path: operadorSnap.ref.path, antes: operador },
      organismoDuplicado: duplicadoSnap.exists ? { path: duplicadoSnap.ref.path, antes: duplicadoSnap.data() } : null,
      reportes: [...aMover, ...sinOperador].map((d) => ({
        path: d.ref.path,
        antes: { organismo: d.get('organismo') ?? null, operadorId: d.get('operadorId') ?? null },
      })),
    },
    null,
    2,
  ),
);
console.log(`\nRespaldo guardado en ${archivoRespaldo}`);

// ── Escritura ────────────────────────────────────────────────────────────────
const escrituras = [];
if (operador.organismoId !== OFICIAL || operador.activo !== true) {
  escrituras.push((lote) => lote.update(operadorSnap.ref, { organismoId: OFICIAL, activo: true }));
}
for (const d of aMover) {
  escrituras.push((lote) => lote.update(d.ref, { organismo: organismoCopia, operadorId: OPERADOR }));
}
for (const d of sinOperador) {
  escrituras.push((lote) => lote.update(d.ref, { operadorId: OPERADOR }));
}

for (let i = 0; i < escrituras.length; i += TAMANO_LOTE) {
  const lote = db.batch();
  escrituras.slice(i, i + TAMANO_LOTE).forEach((aplicar) => aplicar(lote));
  await lote.commit();
}
console.log(`Escrituras aplicadas: ${escrituras.length}`);

// ── Borrado del duplicado, solo si ya nada lo referencia ────────────────────
if (duplicadoSnap.exists) {
  const [quedanReportes, quedanOperadores] = await Promise.all([
    db.collection('reports').where('organismo.id', '==', DUPLICADO).limit(1).get(),
    db.collection('operadores').where('organismoId', '==', DUPLICADO).limit(1).get(),
  ]);
  if (quedanReportes.empty && quedanOperadores.empty) {
    await duplicadoSnap.ref.delete();
    console.log(`organismos/${DUPLICADO} eliminado.`);
  } else {
    const quienes = [!quedanReportes.empty && 'reportes', !quedanOperadores.empty && 'operadores']
      .filter(Boolean)
      .join(' y ');
    console.log(
      `organismos/${DUPLICADO} NO se eliminó: todavía lo referencian ${quienes}. ` +
        'Corrígelos a mano y vuelve a ejecutar el script.',
    );
  }
}

console.log('\nListo. Cierra y vuelve a abrir la app antes de probar: guarda el operador en memoria.\n');
