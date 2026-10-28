#!/usr/bin/env node
/**
 * Crea las cuentas de las municipalidades de Santiago: por defecto Maipú,
 * Cerrillos y Pudahuel. Dos tipos, que son rangos distintos:
 *
 *   organismo (por defecto) · Solo mira: en la app ve, en el mapa «Reportes
 *     validados», los reportes de SU comuna que la comunidad ya validó
 *     (validacion.validado). No reporta, no confirma ni gestiona; las reglas
 *     (1.2) le niegan todo lo demás. Pasos:
 *       1. Comprueba que la municipalidad exista y esté activa (organismos/muni_<CUT>).
 *       2. Crea la cuenta en Authentication con una contraseña al azar.
 *       3. Crea su perfil users/{uid} con role 'organismo' y su organismoId.
 *
 *   operador (--rol=operador) · Gestiona los reportes de su municipalidad
 *     (cambia estados, deriva, responde). Hace lo mismo que el panel
 *     (Operadores + Cuentas): usa el operador activo de la municipalidad o
 *     crea `op_<comuna>`, crea la cuenta y su perfil con role 'operador' y la
 *     anota en operadores/{id}.cuentas.
 *
 * Por defecto SOLO muestra lo que haría y no escribe nada.
 * Con --aplicar escribe y muestra las contraseñas UNA vez, solo en pantalla:
 * no se guardan en ningún archivo. Cópialas y entrégalas por un canal privado.
 *
 * Se puede repetir sin duplicar nada: una cuenta que ya existe se reutiliza
 * (sin cambiar su contraseña, salvo con --nueva-clave). Una cuenta existente
 * con otro rol u otra municipalidad NO se toca: el script avisa y la salta.
 *
 * Usa el Admin SDK, que no pasa por las reglas de seguridad. Por eso pide una
 * clave de cuenta de servicio, que NUNCA debe quedar dentro del repositorio.
 *
 *   (cmd)        set GOOGLE_APPLICATION_CREDENTIALS=C:\claves\ciudad-alerta-admin.json
 *   (PowerShell) $env:GOOGLE_APPLICATION_CREDENTIALS="C:\claves\ciudad-alerta-admin.json"
 *   node scripts/crear-cuentas-municipales.mjs              # qué haría
 *   node scripts/crear-cuentas-municipales.mjs --aplicar    # crea las cuentas de organismo
 *
 * Opciones:
 *   --rol=organismo|operador  Tipo de cuenta (por defecto organismo).
 *   --dominio=<dominio>    Dominio de los correos (por defecto ciudadalerta.test,
 *                          reservado: nunca llega correo ahí). Usa uno tuyo si
 *                          quieres poder recuperar contraseñas por correo.
 *   --comunas=a,b,c        Otras comunas de la tabla COMUNAS (por defecto las tres).
 *   --nueva-clave          Da una contraseña nueva también a las cuentas que ya existían.
 *   --sin-verificar        Deja el correo sin verificar (por defecto se marca
 *                          verificado: lo crea un admin y la casilla no existe,
 *                          así la app no le pide verificarlo).
 *   --asignar-abiertos     Solo con --rol=operador: asigna al operador los
 *                          reportes abiertos de su municipalidad que no tienen
 *                          operador (sin tocar updatedAt, para no generar avisos falsos).
 */
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

/**
 * Comunas de la Región Metropolitana que el script conoce, con su código CUT
 * (el de src/assets/geo/region-13.geojson). Para agregar otra, súmala aquí.
 */
const COMUNAS = {
  maipu: { nombre: 'Maipú', cut: '13119' },
  cerrillos: { nombre: 'Cerrillos', cut: '13102' },
  pudahuel: { nombre: 'Pudahuel', cut: '13124' },
  santiago: { nombre: 'Santiago', cut: '13101' },
  estacion_central: { nombre: 'Estación Central', cut: '13106' },
  lo_prado: { nombre: 'Lo Prado', cut: '13117' },
  quinta_normal: { nombre: 'Quinta Normal', cut: '13126' },
};
const POR_DEFECTO = ['maipu', 'cerrillos', 'pudahuel'];
const ESTADOS_INACTIVOS = new Set(['resuelto', 'cerrado']);

const ROLES = ['organismo', 'operador'];
const APLICAR = process.argv.includes('--aplicar');
const NUEVA_CLAVE = process.argv.includes('--nueva-clave');
const VERIFICADO = !process.argv.includes('--sin-verificar');
const ASIGNAR = process.argv.includes('--asignar-abiertos');
const argumento = (nombre, porDefecto) =>
  process.argv.find((a) => a.startsWith(`--${nombre}=`))?.split('=')[1]?.trim() || porDefecto;
const ROL = argumento('rol', 'organismo').toLowerCase();
const DOMINIO = argumento('dominio', 'ciudadalerta.test').replace(/^@/, '').toLowerCase();
const ELEGIDAS = argumento('comunas', POR_DEFECTO.join(','))
  .split(',')
  .map((c) => c.trim().toLowerCase())
  .filter(Boolean);

function terminar(mensaje) {
  console.error(`\n✖ ${mensaje}\n`);
  process.exit(1);
}

const desconocidas = ELEGIDAS.filter((c) => !COMUNAS[c]);
if (desconocidas.length) {
  terminar(`Comuna desconocida: ${desconocidas.join(', ')}. Disponibles: ${Object.keys(COMUNAS).join(', ')}.`);
}
if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(DOMINIO)) terminar(`El dominio «${DOMINIO}» no es válido.`);
if (!ROLES.includes(ROL)) terminar(`Rol desconocido: «${ROL}». Usa --rol=organismo o --rol=operador.`);
if (ASIGNAR && ROL !== 'operador') {
  terminar('--asignar-abiertos es solo para --rol=operador: una cuenta de organismo no gestiona reportes.');
}
const ES_ORGANISMO = ROL === 'organismo';
/** Las reglas aceptan nombres de hasta 60 caracteres. */
const recortar = (texto) => [...String(texto).trim()].slice(0, 60).join('').trim();

/** Contraseña al azar: 16 caracteres (letras, números, - y _). */
const contrasena = () => randomBytes(12).toString('base64url');

// ── Credenciales y proyecto (igual que corregir-maipu.mjs) ───────────────────
// En cmd, `set VAR="C:\ruta"` guarda las comillas dentro del valor: se quitan.
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
      ? `No existe ningún archivo en ${rutaClave}. Revisa la carpeta y el nombre exacto.`
      : `El archivo ${rutaClave} existe pero no es una clave JSON válida (${error.message}).`,
  );
}
if (!projectId) terminar(`${rutaClave} no parece una clave de cuenta de servicio: no tiene project_id.`);

initializeApp({ credential: applicationDefault(), projectId });
const auth = getAuth();
const db = getFirestore();

console.log(`Proyecto: ${projectId}`);
console.log(`Cuentas: ${ES_ORGANISMO ? 'organismo (solo ve los reportes validados de su comuna)' : 'operador (gestiona los reportes de su municipalidad)'}`);
console.log(APLICAR ? 'Modo: APLICAR (crea las cuentas)\n' : 'Modo: diagnóstico (no escribe nada)\n');

/** La cuenta de Authentication con ese correo, o null. */
async function cuentaPorCorreo(correo) {
  try {
    return await auth.getUserByEmail(correo);
  } catch (error) {
    if (error?.code === 'auth/user-not-found') return null;
    throw error;
  }
}

/**
 * Cuenta de organismo: organismo.<comuna>@<dominio>, con el nombre de la
 * municipalidad. No usa operadores ni asigna reportes.
 */
async function planOrganismo(plan, clave) {
  const local = clave.replace(/_/g, '.');
  plan.correo = `organismo.${local}@${DOMINIO}`;
  plan.nombreCuenta = recortar(plan.organismoNombre);
  const existente = await cuentaPorCorreo(plan.correo);
  if (!existente) {
    plan.crearCuenta = true;
    plan.crearPerfil = true;
    plan.pasos.push(`crear la cuenta ${plan.correo} con una contraseña al azar${VERIFICADO ? ' (correo marcado verificado)' : ''}`);
    plan.pasos.push(`crear su perfil con role 'organismo' y organismoId ${plan.organismoId}`);
  } else {
    plan.uid = existente.uid;
    const perfil = await db.doc(`users/${existente.uid}`).get();
    const rol = perfil.exists ? perfil.get('role') : null;
    const suOrganismo = perfil.exists ? perfil.get('organismoId') : null;
    if (perfil.exists && rol !== 'organismo') {
      plan.problema = `${plan.correo} ya existe con rol «${rol}». No se convierte una cuenta existente: usa otro correo (--dominio=...) o cámbiala a mano.`;
      return;
    }
    if (perfil.exists && suOrganismo !== plan.organismoId) {
      plan.problema = `${plan.correo} ya es cuenta de «${suOrganismo}», no de ${plan.organismoId}. No se mueve una cuenta existente.`;
      return;
    }
    plan.pasos.push(`la cuenta ${plan.correo} ya existe (uid ${existente.uid})${NUEVA_CLAVE ? ': se le da una contraseña nueva' : ': se reutiliza sin cambiar la contraseña'}`);
    if (NUEVA_CLAVE) plan.nuevaClave = true;
    if (!perfil.exists) {
      plan.crearPerfil = true;
      plan.pasos.push(`crear su perfil users/${existente.uid} con role 'organismo' (no tenía)`);
    }
  }

  // Si antes se corrió la versión que creaba operadores, esa cuenta sigue ahí
  // y puede gestionar reportes. No se borra sola: se avisa.
  const anterior = await cuentaPorCorreo(`operador.${local}@${DOMINIO}`);
  if (anterior) {
    const perfil = await db.doc(`users/${anterior.uid}`).get();
    if (perfil.exists && perfil.get('role') === 'operador') {
      plan.avisos = [
        `ojo: también existe operador.${local}@${DOMINIO} con rol «operador» (gestiona reportes). ` +
          'Si no la necesitas, bórrala en Firebase → Authentication y su perfil en users/' + anterior.uid + '.',
      ];
    }
  }
}

// ── Plan: qué hay y qué falta, comuna por comuna ─────────────────────────────
const planes = [];
for (const clave of ELEGIDAS) {
  const { nombre, cut } = COMUNAS[clave];
  const organismoId = `muni_${cut}`;
  const plan = { clave, comuna: nombre, organismoId, pasos: [], problema: null };
  planes.push(plan);

  const organismo = await db.doc(`organismos/${organismoId}`).get();
  if (!organismo.exists) {
    plan.problema = `No existe organismos/${organismoId}. Carga el catálogo de municipalidades en el panel (Organismos).`;
    continue;
  }
  if (organismo.get('activo') === false) {
    plan.problema = `organismos/${organismoId} está inactivo. Actívalo en el panel antes de crear la cuenta.`;
    continue;
  }
  plan.organismoNombre = organismo.get('nombre') ?? `Municipalidad de ${nombre}`;

  if (ES_ORGANISMO) {
    await planOrganismo(plan, clave);
    continue;
  }

  // Operador: el activo de ese organismo (el mismo que elige la app al derivar).
  const operadores = await db.collection('operadores').where('organismoId', '==', organismoId).get();
  const activos = operadores.docs.filter((d) => d.get('activo') === true).sort((a, b) => a.id.localeCompare(b.id));
  const idPropuesto = `op_${clave}`;
  if (activos.length) {
    plan.operadorId = activos[0].id;
    plan.pasos.push(`usar el operador activo «${activos[0].get('nombre') ?? activos[0].id}» (operadores/${activos[0].id})`);
  } else if (operadores.docs.some((d) => d.id === idPropuesto)) {
    plan.operadorId = idPropuesto;
    plan.reactivarOperador = true;
    plan.pasos.push(`reactivar operadores/${idPropuesto} (estaba inactivo)`);
  } else {
    const ocupado = await db.doc(`operadores/${idPropuesto}`).get();
    if (ocupado.exists) {
      plan.problema = `operadores/${idPropuesto} ya existe pero pertenece a ${ocupado.get('organismoId')}. Revisa el panel (Operadores).`;
      continue;
    }
    plan.operadorId = idPropuesto;
    plan.crearOperador = { id: idPropuesto, nombre: `Operador ${nombre}` };
    plan.pasos.push(`crear el operador «Operador ${nombre}» (operadores/${idPropuesto}); desde ahí la app le deriva los reportes nuevos de ${nombre}`);
  }

  // Cuenta: operador.<comuna>@<dominio>
  plan.correo = `operador.${clave.replace(/_/g, '.')}@${DOMINIO}`;
  plan.nombreCuenta = `Operador ${nombre}`;
  const existente = await cuentaPorCorreo(plan.correo);
  if (!existente) {
    plan.crearCuenta = true;
    plan.pasos.push(`crear la cuenta ${plan.correo} con una contraseña al azar${VERIFICADO ? ' (correo marcado verificado)' : ''}`);
  } else {
    plan.uid = existente.uid;
    const perfil = await db.doc(`users/${existente.uid}`).get();
    const rol = perfil.exists ? perfil.get('role') : null;
    const suOperador = perfil.exists ? perfil.get('operadorId') : null;
    if (perfil.exists && rol !== 'operador') {
      plan.problema = `${plan.correo} ya existe con rol «${rol}». No se convierte una cuenta existente: usa otro correo (--dominio=...) o cámbiala a mano.`;
      continue;
    }
    if (perfil.exists && suOperador !== plan.operadorId) {
      plan.problema = `${plan.correo} ya es operador de «${suOperador}», no de ${plan.operadorId}. No se mueve una cuenta existente.`;
      continue;
    }
    plan.pasos.push(`la cuenta ${plan.correo} ya existe (uid ${existente.uid})${NUEVA_CLAVE ? ': se le da una contraseña nueva' : ': se reutiliza sin cambiar la contraseña'}`);
    if (NUEVA_CLAVE) plan.nuevaClave = true;
    if (!perfil.exists) {
      plan.crearPerfil = true;
      plan.pasos.push(`crear su perfil users/${existente.uid} (no tenía)`);
    }
  }
  if (plan.crearCuenta) plan.crearPerfil = true;

  // Reportes abiertos sin operador de esa municipalidad.
  const reportes = await db.collection('reports').where('organismo.id', '==', organismoId).get();
  plan.huerfanos = reportes.docs.filter((d) => !d.get('operadorId') && !ESTADOS_INACTIVOS.has(d.get('estado')));
  if (plan.huerfanos.length) {
    plan.pasos.push(
      ASIGNAR
        ? `asignar al operador ${plan.huerfanos.length} reporte(s) abierto(s) de ${nombre} que no tenían operador`
        : `hay ${plan.huerfanos.length} reporte(s) abierto(s) de ${nombre} sin operador (con --asignar-abiertos se le asignan)`,
    );
  }
}

for (const p of planes) {
  console.log(`▸ ${p.comuna} · ${p.organismoId}`);
  if (p.problema) console.log(`  ✖ ${p.problema}`);
  else p.pasos.forEach((paso) => console.log(`  · ${paso}`));
  for (const aviso of p.avisos ?? []) console.log(`  ⚠ ${aviso}`);
  console.log('');
}

const listos = planes.filter((p) => !p.problema);
if (!APLICAR) {
  console.log(`Nada se escribió. Para crear ${listos.length} cuenta(s): agrega --aplicar.\n`);
  process.exit(planes.some((p) => p.problema) ? 1 : 0);
}

// ── Aplicar ──────────────────────────────────────────────────────────────────

/** Crea la cuenta y el perfil de organismo; devuelve la contraseña nueva o null. */
async function aplicarOrganismo(p) {
  let clave = null;
  if (p.crearCuenta) {
    clave = contrasena();
    const usuario = await auth.createUser({ email: p.correo, password: clave, displayName: p.nombreCuenta, emailVerified: VERIFICADO });
    p.uid = usuario.uid;
  } else if (p.nuevaClave) {
    clave = contrasena();
    await auth.updateUser(p.uid, { password: clave });
  }
  // La misma forma que aceptan las reglas (creacionCuentaOrganismo).
  if (p.crearPerfil) {
    await db.doc(`users/${p.uid}`).set({
      uid: p.uid,
      email: p.correo,
      displayName: p.nombreCuenta,
      role: 'organismo',
      organismoId: p.organismoId,
      trustLevel: 0,
      validatedReports: 0,
      emailVerified: VERIFICADO,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  }
  return clave;
}
const resultado = [];
for (const p of listos) {
  if (ES_ORGANISMO) {
    resultado.push({ ...p, clave: await aplicarOrganismo(p), asignados: 0 });
    console.log(`✓ ${p.comuna}: ${p.correo} lista (organismo ${p.organismoId})`);
    continue;
  }

  // 1 · Operador (como lo guarda el panel: merge, para no perder sus cuentas).
  if (p.crearOperador) {
    await db.doc(`operadores/${p.operadorId}`).set(
      {
        id: p.operadorId,
        nombre: p.crearOperador.nombre,
        organismoId: p.organismoId,
        telefonoContacto: null,
        correoContacto: null,
        direccionContacto: null,
        activo: true,
      },
      { merge: true },
    );
  } else if (p.reactivarOperador) {
    await db.doc(`operadores/${p.operadorId}`).update({ activo: true });
  }

  // 2 · Cuenta de Authentication.
  let clave = null;
  if (p.crearCuenta) {
    clave = contrasena();
    const usuario = await auth.createUser({ email: p.correo, password: clave, displayName: p.nombreCuenta, emailVerified: VERIFICADO });
    p.uid = usuario.uid;
  } else if (p.nuevaClave) {
    clave = contrasena();
    await auth.updateUser(p.uid, { password: clave });
  }

  // 3 · Perfil (la misma forma que crea el panel en AdminCuentas).
  if (p.crearPerfil) {
    await db.doc(`users/${p.uid}`).set({
      uid: p.uid,
      email: p.correo,
      displayName: p.nombreCuenta,
      role: 'operador',
      operadorId: p.operadorId,
      trustLevel: 0,
      validatedReports: 0,
      emailVerified: VERIFICADO,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  }

  // 4 · Registro en el operador, para que el panel liste la cuenta.
  await db.doc(`operadores/${p.operadorId}`).update({
    cuentas: FieldValue.arrayUnion({ uid: p.uid, correo: p.correo, nombre: p.nombreCuenta }),
  });

  // 5 · Reportes abiertos sin operador (opcional). Sin updatedAt: la campana de
  // avisos lo usa para detectar cambios de estado.
  let asignados = 0;
  if (ASIGNAR && p.huerfanos.length) {
    for (let i = 0; i < p.huerfanos.length; i += 400) {
      const lote = db.batch();
      for (const d of p.huerfanos.slice(i, i + 400)) lote.update(d.ref, { operadorId: p.operadorId });
      await lote.commit();
    }
    asignados = p.huerfanos.length;
  }

  resultado.push({ ...p, clave, asignados });
  console.log(`✓ ${p.comuna}: ${p.correo} lista (operador ${p.operadorId}${asignados ? `, ${asignados} reporte(s) asignado(s)` : ''})`);
}

console.log('\nCuentas (las contraseñas no se guardan en ningún lado: cópialas ahora):\n');
for (const r of resultado) {
  console.log(`  ${r.comuna.padEnd(18)} ${r.correo.padEnd(40)} ${r.clave ?? '(sin cambios)'}`);
}
console.log(
  (ES_ORGANISMO
    ? '\nCada cuenta entra a la app con su correo y contraseña y ve, en «Reportes validados», los reportes de\n' +
      'su comuna que la comunidad ya validó. No puede reportar, confirmar ni gestionar. '
    : '\nCada cuenta entra a la app y al portal con su correo y contraseña, y gestiona los reportes de su\n' +
      'municipalidad. ') +
    `${DOMINIO === 'ciudadalerta.test'
      ? 'Con el dominio .test no llega correo: para cambiar una contraseña, vuelve a correr con --nueva-clave.'
      : 'Como el dominio es real, pueden cambiarla con «¿Olvidaste tu contraseña?» en el inicio de sesión.'}\n`,
);
if (planes.some((p) => p.problema)) process.exit(1);
