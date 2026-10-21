#!/usr/bin/env node
/**
 * Diagnóstico estático del código de Ciudad Alerta.
 *
 *   node scripts/diagnostico/codigo.mjs            # análisis (≈5 s)
 *   node scripts/diagnostico/codigo.mjs --build    # además compila en producción
 *
 * No modifica nada. Escribe el informe en diagnostico/codigo.md y termina con
 * código 1 si encuentra errores o brechas (útil en integración continua).
 *
 * Qué revisa:
 *   1. Dependencias e imports: paquetes usados y no instalados, rutas rotas,
 *      imports prohibidos en Ionic 9 / Angular 22.
 *   2. Componentes: plantillas y estilos existentes, etiquetas <app-*> e
 *      <ion-*> sin importar, íconos sin registrar.
 *   3. Navegación: rutas de routerLink / navigate que no existen.
 *   4. Firestore: colecciones usadas sin regla, consultas sin índice,
 *      catálogos (categorías, estados, intervalo, administradores) que se
 *      desincronizaron entre la app y las reglas.
 *   5. Reglas de seguridad: brechas conocidas, campos sin lista blanca,
 *      lecturas de documentos sobre el límite.
 *   6. Fugas y robustez: suscripciones sin cancelar, temporizadores, eventos.
 *   7. Seguridad del cliente: innerHTML, eval, registros con datos personales,
 *      claves y llaves dentro del proyecto.
 *   8. Android y build: paquete, manifiesto, presupuestos de estilos, assets.
 *   9. Módulos: manifiestos, modulos.config.ts, dependencias, ranuras,
 *      fronteras entre módulos y parámetros del sistema de confianza vs reglas.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Informe, aCamel, aPascal, bloqueBalanceado, catalogosDeLaApp, lineaDe, sinComentarios } from './comun.mjs';
import { leerModulos, revisarModulos, revisarParametrosConfianza } from './modulos.mjs';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SRC = join(RAIZ, 'src');
const CON_BUILD = process.argv.includes('--build');

const rel = (p) => relative(RAIZ, p).split(sep).join('/');
const leer = (p) => readFileSync(p, 'utf8');
const leerSiExiste = (p) => (existsSync(p) ? leer(p) : null);

const informe = new Informe('Diagnóstico del código · Ciudad Alerta');
console.log(`\nCiudad Alerta · diagnóstico del código\nProyecto: ${RAIZ}`);

if (!existsSync(SRC)) {
  console.error('\n✖ No se encontró la carpeta src. Ejecuta el script desde la raíz del proyecto.\n');
  process.exit(1);
}

// ═══ Inventario ══════════════════════════════════════════════════════════════
const IGNORAR = new Set(['node_modules', 'www', 'dist', '.angular', '.git', 'build', '.gradle', 'diagnostico', 'apk-demo']);

function listar(dir, filtro, salida = []) {
  if (!existsSync(dir)) return salida;
  for (const entrada of readdirSync(dir, { withFileTypes: true })) {
    if (IGNORAR.has(entrada.name)) continue;
    const ruta = join(dir, entrada.name);
    if (entrada.isDirectory()) listar(ruta, filtro, salida);
    else if (filtro(entrada.name)) salida.push(ruta);
  }
  return salida;
}

const archivosTs = listar(SRC, (n) => n.endsWith('.ts') && !n.endsWith('.spec.ts') && !n.endsWith('.d.ts'));
const codigo = new Map(archivosTs.map((f) => [f, sinComentarios(leer(f))]));
const todoElCodigo = [...codigo.values()].join('\n');

// ═══ 1. Dependencias e imports ══════════════════════════════════════════════
informe.seccion('Dependencias e imports');

const paquete = JSON.parse(leerSiExiste(join(RAIZ, 'package.json')) ?? '{}');
const declaradas = new Set([
  ...Object.keys(paquete.dependencies ?? {}),
  ...Object.keys(paquete.devDependencies ?? {}),
]);
if (!declaradas.size) informe.agregar('error', 'No se pudo leer package.json.');

/**
 * Alias de `compilerOptions.paths` del tsconfig (por ejemplo
 * '@ciudad-alerta/comun' → '../comun/src/index.ts'). No son paquetes de npm:
 * se resuelven contra el archivo al que apuntan.
 */
const alias = (() => {
  const crudo = leerSiExiste(join(RAIZ, 'tsconfig.json'));
  if (!crudo) return [];
  try {
    const tsconfig = JSON.parse(sinComentarios(crudo).replace(/,(\s*[}\]])/g, '$1'));
    const base = resolve(RAIZ, tsconfig.compilerOptions?.baseUrl ?? '.');
    return Object.entries(tsconfig.compilerOptions?.paths ?? {}).map(([clave, destinos]) => ({
      clave,
      comodin: clave.endsWith('/*'),
      prefijo: clave.replace(/\*$/, ''),
      destinos: destinos.map((d) => resolve(base, d)),
    }));
  } catch {
    informe.agregar('advertencia', 'No se pudo leer tsconfig.json para conocer sus alias (paths)', {
      archivo: 'tsconfig.json',
    });
    return [];
  }
})();

/** Archivos a los que apunta un import con alias; null si no usa ningún alias. */
function destinosDeAlias(especificador) {
  const a = alias.find((x) => (x.comodin ? especificador.startsWith(x.prefijo) : especificador === x.clave));
  if (!a) return null;
  const resto = a.comodin ? especificador.slice(a.prefijo.length) : '';
  return a.destinos.map((d) => d.replace('*', resto));
}

const existeModulo = (base) =>
  [base, `${base}.ts`, `${base}.js`, `${base}.mjs`, `${base}.json`, join(base, 'index.ts')].some(
    (c) => existsSync(c) && statSync(c).isFile(),
  );

const usadas = new Map(); // paquete → primer archivo que lo usa
let importsRotos = 0;
const REGEX_IMPORT = /(?:^|[\s;])(?:import|export)\s+(?:type\s+)?(?:[\w*{}\s,$]+\s+from\s+)?['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g;

for (const [archivo, texto] of codigo) {
  for (const m of texto.matchAll(REGEX_IMPORT)) {
    const especificador = m[1] ?? m[2];
    const linea = lineaDe(texto, m.index);

    if (especificador.startsWith('.')) {
      const base = resolve(dirname(archivo), especificador);
      if (/(^|\/)comun\/src(\/|$)/.test(especificador)) {
        informe.agregar('advertencia', `Import relativo al paquete compartido: '${especificador}'`, {
          archivo: rel(archivo),
          linea,
          solucion: "Importa desde '@ciudad-alerta/comun': la ruta relativa se rompe si el archivo se mueve.",
        });
      }
      if (!existeModulo(base)) {
        importsRotos++;
        informe.agregar('error', `Import a un archivo que no existe: '${especificador}'`, {
          archivo: rel(archivo),
          linea,
          solucion: 'Revisa el nombre o copia el archivo que falta.',
        });
      }
      continue;
    }

    if (especificador.startsWith('node:')) continue;

    const destinos = destinosDeAlias(especificador);
    if (destinos) {
      if (!destinos.some(existeModulo)) {
        importsRotos++;
        informe.agregar('error', `El alias '${especificador}' apunta a un archivo que no existe`, {
          archivo: rel(archivo),
          linea,
          detalle: `Destino según tsconfig.json: ${destinos.map(rel).join(', ')}`,
          solucion: 'Revisa que la carpeta comun/ esté en la raíz del repositorio (junto a ciudad-alerta-app/).',
        });
      }
      continue;
    }

    const nombre = especificador.startsWith('@')
      ? especificador.split('/').slice(0, 2).join('/')
      : especificador.split('/')[0];
    if (!usadas.has(nombre)) usadas.set(nombre, { archivo, linea });

    if (especificador === '@ionic/angular/standalone') {
      informe.agregar('error', "Import de '@ionic/angular/standalone', que Ionic 9 eliminó", {
        archivo: rel(archivo),
        linea,
        solucion: "Importa desde '@ionic/angular'.",
      });
    }
    if (nombre === '@angular/fire') {
      informe.agregar('error', "Import de '@angular/fire', que no es compatible con Angular 22 en este proyecto", {
        archivo: rel(archivo),
        linea,
        solucion: 'Usa el SDK modular `firebase/*` con los tokens de core/firebase.providers.ts.',
      });
    }
  }
}

/** Paquete declarado que trae `nombre` como dependencia propia, si lo hay. */
function traidoPor(nombre) {
  for (const d of declaradas) {
    const pj = leerSiExiste(join(RAIZ, 'node_modules', ...d.split('/'), 'package.json'));
    if (pj && Object.keys(JSON.parse(pj).dependencies ?? {}).includes(nombre)) return d;
  }
  return null;
}

for (const [nombre, { archivo, linea }] of usadas) {
  if (declaradas.has(nombre)) continue;
  const instalada = existsSync(join(RAIZ, 'node_modules', ...nombre.split('/')));
  const padre = instalada ? traidoPor(nombre) : null;
  if (padre) {
    informe.agregar('info', `'${nombre}' se importa directamente pero llega como dependencia de ${padre}`, {
      archivo: rel(archivo),
      linea,
      detalle: `Si ${padre} cambia de versión, esta importación puede romperse sin aviso.`,
    });
    continue;
  }
  informe.agregar(
    instalada ? 'advertencia' : 'error',
    instalada
      ? `'${nombre}' está instalado pero no figura en package.json`
      : `'${nombre}' se usa en el código pero no está instalado`,
    {
      archivo: rel(archivo),
      linea,
      solucion: `npm install ${nombre}`,
      detalle: instalada ? 'Funciona en tu equipo, pero un `npm ci` en otro computador no lo instalará.' : undefined,
    },
  );
}

const HERRAMIENTAS = /^(@angular|@angular-devkit|@ionic|@capacitor\/(android|ios|cli|assets)|typescript|tslib|zone\.js|rxjs|karma|jasmine|@types|eslint|@typescript-eslint|angular-eslint|firebase-admin|firebase-tools|@firebase\/rules-unit-testing|vitest|jest|prettier|sass|@ionic\/angular-toolkit)/;
const sinUso = [...declaradas].filter((d) => !usadas.has(d) && !HERRAMIENTAS.test(d));
if (sinUso.length) {
  informe.agregar('info', `Dependencias declaradas que el código de src/ no importa: ${sinUso.join(', ')}`, {
    detalle: 'Pueden ser plugins de Capacitor usados solo desde Android o restos de pruebas anteriores.',
  });
}
if (!importsRotos) {
  informe.ok(
    `${archivosTs.length} archivos TypeScript, imports relativos` + (alias.length ? ' y alias de tsconfig' : '') + ' resueltos',
  );
}

// El paquete compartido debe seguir siendo TypeScript puro: si importa
// Angular, Ionic, React o Firebase, deja de servirle a la otra aplicación.
const COMUN_SRC = resolve(RAIZ, '..', 'comun', 'src');
if (alias.some((a) => a.destinos.some((d) => d.startsWith(COMUN_SRC)))) {
  const archivosComun = listar(COMUN_SRC, (n) => n.endsWith('.ts') && !n.endsWith('.d.ts'));
  let externos = 0;
  for (const archivo of archivosComun) {
    const texto = sinComentarios(leer(archivo));
    for (const m of texto.matchAll(REGEX_IMPORT)) {
      const especificador = m[1] ?? m[2];
      if (especificador.startsWith('.')) continue;
      externos++;
      informe.agregar('error', `comun/ importa '${especificador}': el paquete compartido debe ser TypeScript puro`, {
        archivo: rel(archivo),
        linea: lineaDe(texto, m.index),
        solucion: 'Deja aquí solo la regla de negocio y pon el uso del framework o de Firebase en cada aplicación.',
      });
    }
  }
  if (!externos) informe.ok(`Paquete comun/: ${archivosComun.length} archivos, sin dependencias de Angular, React ni Firebase`);
}

// ═══ 2. Componentes ═════════════════════════════════════════════════════════
informe.seccion('Componentes, plantillas e íconos');

/** Íconos registrados con addIcons({ ... }) en un texto. */
function iconosRegistrados(texto) {
  const salida = new Set();
  for (const m of texto.matchAll(/addIcons\s*\(/g)) {
    const args = bloqueBalanceado(texto, m.index + m[0].length - 1);
    const objeto = args.slice(args.indexOf('{') + 1, args.lastIndexOf('}'));
    for (const parte of objeto.split(',')) {
      const limpio = parte.trim();
      if (!limpio) continue;
      const clave = limpio.includes(':') ? limpio.split(':')[0].trim().replace(/['"]/g, '') : limpio;
      salida.add(clave.includes('-') ? aCamel(clave) : clave);
    }
  }
  return salida;
}

const globales = new Set();
for (const f of [join(SRC, 'main.ts'), join(SRC, 'app', 'app.component.ts')]) {
  if (codigo.has(f)) iconosRegistrados(codigo.get(f)).forEach((i) => globales.add(i));
}

const componentes = [];
for (const [archivo, texto] of codigo) {
  const pos = texto.search(/@Component\s*\(/);
  if (pos < 0) continue;
  const meta = bloqueBalanceado(texto, texto.indexOf('(', pos));
  const clase = texto.slice(pos).match(/export\s+class\s+(\w+)/)?.[1] ?? '?';
  const selector = meta.match(/selector:\s*['"]([^'"]+)['"]/)?.[1] ?? null;
  const importsTxt = meta.match(/imports:\s*\[([\s\S]*?)\]/)?.[1] ?? '';
  const importados = new Set(importsTxt.split(/[\s,]+/).filter(Boolean));

  let plantilla = '';
  let archivoPlantilla = archivo;
  const urlPlantilla = meta.match(/templateUrl:\s*['"]([^'"]+)['"]/)?.[1];
  if (urlPlantilla) {
    archivoPlantilla = resolve(dirname(archivo), urlPlantilla);
    if (!existsSync(archivoPlantilla)) {
      informe.agregar('error', `La plantilla '${urlPlantilla}' no existe`, { archivo: rel(archivo) });
    } else {
      plantilla = leer(archivoPlantilla).replace(/<!--[\s\S]*?-->/g, '');
    }
  } else {
    const inline = meta.match(/template:\s*`([\s\S]*?)`/);
    if (inline) plantilla = inline[1];
  }

  const estilos = [
    ...(meta.match(/styleUrls:\s*\[([^\]]*)\]/)?.[1] ?? '').matchAll(/['"]([^'"]+)['"]/g),
  ].map((m) => m[1]);
  const estiloUnico = meta.match(/styleUrl:\s*['"]([^'"]+)['"]/)?.[1];
  if (estiloUnico) estilos.push(estiloUnico);
  for (const e of estilos) {
    if (!existsSync(resolve(dirname(archivo), e))) {
      informe.agregar('error', `La hoja de estilos '${e}' no existe`, { archivo: rel(archivo) });
    }
  }

  componentes.push({ archivo, archivoPlantilla, texto, clase, selector, importados, plantilla, estilos });
}

const porSelector = new Map(componentes.filter((c) => c.selector).map((c) => [c.selector, c]));
let etiquetasMal = 0;
let iconosMal = 0;

for (const c of componentes) {
  const vistas = new Set();
  for (const m of c.plantilla.matchAll(/<((?:app|ion)-[a-z0-9-]+)[\s>/]/g)) {
    const etiqueta = m[1];
    if (vistas.has(etiqueta)) continue;
    vistas.add(etiqueta);
    const linea = lineaDe(c.plantilla, m.index);

    if (etiqueta.startsWith('app-')) {
      const destino = porSelector.get(etiqueta);
      if (!destino) {
        etiquetasMal++;
        informe.agregar('error', `<${etiqueta}> no corresponde a ningún componente del proyecto`, {
          archivo: rel(c.archivoPlantilla),
          linea,
        });
      } else if (!c.importados.has(destino.clase) && destino !== c) {
        etiquetasMal++;
        informe.agregar('error', `<${etiqueta}> se usa pero ${destino.clase} no está en imports de ${c.clase}`, {
          archivo: rel(c.archivoPlantilla),
          linea,
          solucion: `Agrega ${destino.clase} al arreglo imports del componente.`,
        });
      }
    } else if (!c.importados.has(aPascal(etiqueta))) {
      etiquetasMal++;
      informe.agregar('error', `<${etiqueta}> se usa pero ${aPascal(etiqueta)} no está en imports de ${c.clase}`, {
        archivo: rel(c.archivoPlantilla),
        linea,
        solucion: `Importa ${aPascal(etiqueta)} desde '@ionic/angular' y agrégalo a imports.`,
      });
    }
  }

  // Íconos: los de la plantilla y los nombres que el .ts entrega a la plantilla.
  const propios = iconosRegistrados(c.texto);
  const usados = new Map();
  for (const m of c.plantilla.matchAll(/<ion-icon\b[^>]*?\sname="([a-z0-9]+(?:-[a-z0-9]+)*)"|<ion-(?!spinner)[a-z-]+\b[^>]*?\sicon="([a-z0-9]+(?:-[a-z0-9]+)*)"/g)) {
    const nombreIcono = m[1] ?? m[2];
    usados.set(nombreIcono, { archivo: c.archivoPlantilla, linea: lineaDe(c.plantilla, m.index) });
  }
  for (const m of c.plantilla.matchAll(/<ion-icon\b[^>]*?\[name\]="'([a-z0-9-]+)'"/g)) {
    usados.set(m[1], { archivo: c.archivoPlantilla, linea: lineaDe(c.plantilla, m.index) });
  }
  for (const m of c.texto.matchAll(/['"]([a-z]+(?:-[a-z0-9]+)*-(?:outline|sharp))['"]/g)) {
    if (!usados.has(m[1])) usados.set(m[1], { archivo: c.archivo, linea: lineaDe(c.texto, m.index) });
  }
  for (const [icono, donde] of usados) {
    const clave = aCamel(icono);
    if (propios.has(clave) || globales.has(clave)) continue;
    iconosMal++;
    informe.agregar('advertencia', `Ícono '${icono}' sin registrar en ${c.clase}: no se verá`, {
      archivo: rel(donde.archivo),
      linea: donde.linea,
      solucion: `import { ${clave} } from 'ionicons/icons'; y addIcons({ ${clave} }) en el constructor.`,
    });
  }
}
if (!etiquetasMal) informe.ok(`${componentes.length} componentes: etiquetas <app-*> e <ion-*> importadas`);
if (!iconosMal) informe.ok('Todos los íconos usados están registrados');

// ═══ 3. Navegación ══════════════════════════════════════════════════════════
informe.seccion('Rutas y navegación');

const archivoRutas = join(SRC, 'app', 'app.routes.ts');
const textoRutas = codigo.get(archivoRutas) ?? '';
// Las rutas de cada funcionalidad las declara su módulo (modulos/<id>/<id>.modulo.ts).
const inventarioModulos = leerModulos(SRC);
const rutasDeModulos = inventarioModulos.modulos.filter((m) => m.valido).flatMap((m) => m.rutas.map((r) => r.path));
const rutas = [
  ...[...textoRutas.matchAll(/path:\s*['"]([^'"]*)['"]/g)].map((m) => m[1]).filter((p) => p !== '**'),
  ...rutasDeModulos,
];

for (const m of textoRutas.matchAll(/import\(\s*['"]([^'"]+)['"]\s*\)\s*\.then\(\s*\(?\s*(\w+)\s*\)?\s*=>\s*\2\.(\w+)/g)) {
  const destino = resolve(dirname(archivoRutas), m[1]);
  const archivo = [`${destino}.ts`, destino].find((p) => existsSync(p));
  if (!archivo) {
    informe.agregar('error', `La ruta carga '${m[1]}', que no existe`, { archivo: rel(archivoRutas), linea: lineaDe(textoRutas, m.index) });
  } else if (!new RegExp(`export\\s+class\\s+${m[3]}\\b`).test(leer(archivo))) {
    informe.agregar('error', `La ruta espera la clase ${m[3]} en '${m[1]}', pero el archivo no la exporta`, {
      archivo: rel(archivoRutas),
      linea: lineaDe(textoRutas, m.index),
    });
  }
}

function rutaExiste(segmentos) {
  return rutas.some((patron) => {
    const partes = patron.split('/').filter(Boolean);
    return partes.length === segmentos.length && partes.every((p, i) => p.startsWith(':') || p === segmentos[i] || segmentos[i] === '*');
  });
}

let enlacesMal = 0;
function revisarEnlace(url, extra, archivo, texto, indice) {
  const segmentos = url.split(/[?#]/)[0].split('/').filter(Boolean);
  for (let i = 0; i < extra; i++) segmentos.push('*');
  if (segmentos.length === 0 || rutaExiste(segmentos)) return;
  enlacesMal++;
  informe.agregar('error', `Navegación a '/${segmentos.join('/').replaceAll('*', ':param')}', que no es ninguna ruta`, {
    archivo: rel(archivo),
    linea: lineaDe(texto, indice),
    solucion: `Rutas existentes (app.routes.ts y módulos): ${rutas.filter(Boolean).join(', ')}`,
  });
}

for (const c of componentes) {
  for (const m of c.plantilla.matchAll(/(?:routerLink|defaultHref)="(\/[^"{}]*)"/g)) revisarEnlace(m[1], 0, c.archivoPlantilla, c.plantilla, m.index);
  for (const m of c.plantilla.matchAll(/\[routerLink\]="\[\s*'(\/[^']*)'((?:\s*,[^\]]+)?)\]"/g)) {
    revisarEnlace(m[1], m[2] ? m[2].split(',').length - 1 : 0, c.archivoPlantilla, c.plantilla, m.index);
  }
}
for (const [archivo, texto] of codigo) {
  for (const m of texto.matchAll(/navigate\(\s*\[\s*['"](\/[^'"]*)['"]([^\]]*)\]/g)) {
    revisarEnlace(m[1], m[2].trim() ? m[2].split(',').filter((s) => s.trim()).length : 0, archivo, texto, m.index);
  }
  for (const m of texto.matchAll(/navigateByUrl\(\s*['"](\/[^'"]*)['"]/g)) revisarEnlace(m[1], 0, archivo, texto, m.index);
  for (const m of texto.matchAll(/navigateByUrl\(\s*`(\/[^`$]*)\$\{/g)) revisarEnlace(m[1], 1, archivo, texto, m.index);
}
if (!enlacesMal) informe.ok(`${rutas.length} rutas; todos los enlaces literales apuntan a rutas existentes`);

// ═══ 4. Firestore: código vs reglas vs índices ══════════════════════════════
informe.seccion('Firestore: colecciones, índices y catálogos');

const archivoReglas = join(RAIZ, 'firestore.rules');
const reglasCrudas = leerSiExiste(archivoReglas);
const reglas = reglasCrudas ? sinComentarios(reglasCrudas) : null;
if (!reglas) informe.agregar('error', 'No existe firestore.rules en la raíz del proyecto.');

/** Árbol de `match` de las reglas: lista de rutas como ['users','{userId}','avisos','{docId}']. */
function rutasDeReglas(texto) {
  const salida = [];
  const recorrer = (desde, hasta, prefijo) => {
    const re = /match\s+(\S+)\s*\{/g;
    re.lastIndex = desde;
    let m;
    while ((m = re.exec(texto)) && m.index < hasta) {
      const abre = m.index + m[0].length - 1;
      const cuerpo = bloqueBalanceado(texto, abre, '{', '}');
      const cierre = abre + cuerpo.length + 1;
      const partes = m[1].split('/').filter(Boolean);
      const ruta = [...prefijo, ...partes];
      salida.push({ ruta, inicio: abre, fin: cierre, cuerpo });
      recorrer(abre + 1, cierre, ruta);
      re.lastIndex = cierre;
    }
  };
  recorrer(0, texto.length, []);
  return salida
    .map((r) => ({ ...r, ruta: r.ruta.slice(r.ruta.indexOf('documents') + 1) }))
    .filter((r) => r.ruta.length && !r.ruta.includes('databases'));
}

const matches = reglas ? rutasDeReglas(reglas) : [];
const tieneRegla = (colecciones) =>
  matches.some(
    (r) =>
      !r.ruta.some((s) => s.includes('=**')) &&
      r.ruta.length === colecciones.length * 2 &&
      colecciones.every((col, i) => r.ruta[i * 2] === col),
  );

/** Rutas de colección literales usadas por el código: ['reports','statusHistory']. */
const coleccionesUsadas = new Map();
for (const [archivo, texto] of codigo) {
  for (const m of texto.matchAll(/\b(collection|doc|collectionGroup)\(\s*([^,()]+),/g)) {
    if (!/firestore|db\b|this\.db/i.test(m[2])) continue;
    const args = bloqueBalanceado(texto, m.index + m[1].length).split(',').slice(1).map((a) => a.trim());
    const cols = [];
    for (let i = 0; i < args.length; i += 2) {
      const lit = args[i].match(/^['"]([\w-]+)['"]$/);
      if (!lit) break;
      cols.push(lit[1]);
    }
    if (!cols.length) continue;
    const clave = m[1] === 'collectionGroup' ? `**/${cols[0]}` : cols.join('/');
    if (!coleccionesUsadas.has(clave)) coleccionesUsadas.set(clave, { archivo, linea: lineaDe(texto, m.index), cols, grupo: m[1] === 'collectionGroup' });
  }
}

let sinRegla = 0;
for (const [clave, uso] of coleccionesUsadas) {
  const cubierta = uso.grupo
    ? matches.some((r) => r.ruta.at(-2) === uso.cols[0])
    : tieneRegla(uso.cols);
  if (!cubierta && reglas) {
    sinRegla++;
    informe.agregar('error', `El código usa la colección '${clave}' pero firestore.rules no tiene un match para ella`, {
      archivo: rel(uso.archivo),
      linea: uso.linea,
      detalle: 'La regla por defecto lo deniega todo: en producción la app recibe "permiso denegado".',
    });
  }
}
if (!sinRegla && reglas) informe.ok(`${coleccionesUsadas.size} colecciones usadas, todas con reglas`);

// Índices compuestos
const indices = JSON.parse(leerSiExiste(join(RAIZ, 'firestore.indexes.json')) ?? '{"indexes":[]}').indexes ?? [];
const IGUALDAD = new Set(['==', 'in']);
let consultasRevisadas = 0;
let indicesFaltantes = 0;
for (const [archivo, texto] of codigo) {
  for (const m of texto.matchAll(/\bquery\(/g)) {
    const args = bloqueBalanceado(texto, m.index + 5);
    const coleccion = [...args.matchAll(/(?:collection|collectionGroup)\(\s*[^,]+,((?:\s*['"][\w-]+['"]\s*,?|\s*[\w.]+\s*,?)+)\)/g)]
      .map((c) => c[1].split(',').map((s) => s.trim()).filter(Boolean))
      .map((partes) => partes.filter((_, i) => i % 2 === 0).at(-1)?.replace(/['"]/g, ''))[0];
    if (!coleccion) continue;
    const wheres = [...args.matchAll(/where\(\s*['"]([\w.]+)['"]\s*,\s*['"]([^'"]+)['"]/g)].map((w) => ({ campo: w[1], op: w[2] }));
    const orden = [...args.matchAll(/orderBy\(\s*['"]([\w.]+)['"]/g)].map((o) => o[1]);
    consultasRevisadas++;

    const rangos = wheres.filter((w) => !IGUALDAD.has(w.op) && w.op !== 'array-contains');
    const campos = new Set([...wheres.map((w) => w.campo), ...orden]);
    const necesita = campos.size >= 2 && (orden.length > 0 || rangos.length > 0);
    if (!necesita) continue;

    const cubre = indices.some(
      (ix) =>
        ix.collectionGroup === coleccion &&
        [...campos].every((c) => ix.fields?.some((f) => f.fieldPath === c)),
    );
    if (!cubre) {
      indicesFaltantes++;
      informe.agregar('advertencia', `Consulta sobre '${coleccion}' con ${[...campos].join(' + ')} sin índice compuesto`, {
        archivo: rel(archivo),
        linea: lineaDe(texto, m.index),
        detalle: 'Firestore la rechaza con "failed-precondition: The query requires an index".',
        solucion: `Agrega a firestore.indexes.json un índice de '${coleccion}' con ${[...campos].join(', ')} y despliega con firebase deploy --only firestore:indexes.`,
      });
    }
  }
}
if (!indicesFaltantes) informe.ok(`${consultasRevisadas} consultas literales revisadas; índices compuestos presentes`);

// Catálogos que deben coincidir entre la app y las reglas (desde la fase 3,
// en comun/src/reportes; ver catalogosDeLaApp).
const catalogos = catalogosDeLaApp(RAIZ);
const categoriasApp = catalogos.categorias;
if (!categoriasApp.length || !Object.keys(catalogos.transiciones).length) {
  informe.agregar('advertencia', 'No se encontraron las categorías o las transiciones de la app para compararlas con las reglas', {
    detalle: 'Se buscan en comun/src/reportes/categorias.ts y estados.ts (o en models/report.model.ts en versiones anteriores).',
  });
}
const categoriasReglas = [...(reglas?.match(/categoria\s+in\s+\[([\s\S]*?)\]/)?.[1] ?? '').matchAll(/'([^']+)'/g)].map((m) => m[1]);
if (categoriasApp.length && categoriasReglas.length) {
  const soloApp = categoriasApp.filter((c) => !categoriasReglas.includes(c));
  const soloReglas = categoriasReglas.filter((c) => !categoriasApp.includes(c));
  if (soloApp.length) {
    informe.agregar('error', `Categorías de la app que las reglas rechazan: ${soloApp.join(', ')}`, {
      detalle: 'Un reporte con esa categoría falla con "permiso denegado" salvo que exista activa en /categorias.',
    });
  }
  if (soloReglas.length) informe.agregar('info', `Categorías aceptadas por las reglas que la app no ofrece: ${soloReglas.join(', ')}`);
  if (!soloApp.length && !soloReglas.length) informe.ok(`Categorías sincronizadas (${categoriasApp.length})`);
}

// Organismos genéricos: los ids que la app asigna sin municipalidad deben ser
// los que acepta la regla de creación de reportes.
const modeloOrganismos = codigo.get(join(SRC, 'app', 'models', 'organismo.model.ts')) ?? '';
const idsApp = [...(modeloOrganismos.match(/IDS_ORGANISMOS[^=]*=\s*\[([\s\S]*?)\]/)?.[1] ?? '').matchAll(/'([^']+)'/g)].map((m) => m[1]);
const idsAsignados = [...(modeloOrganismos.match(/ORGANISMOS\s*:[^=]*=\s*\{([\s\S]*?)\n\};/)?.[1] ?? '').matchAll(/id:\s*'([^']+)'/g)].map((m) => m[1]);
const idsReglas = [...(reglas?.match(/organismoId\s+in\s+\[([^\]]*)\]/)?.[1] ?? '').matchAll(/'([^']+)'/g)].map((m) => m[1]);
if (idsApp.length && idsReglas.length) {
  const fuera = [...new Set([...idsApp, ...idsAsignados])].filter((id) => !idsReglas.includes(id));
  if (fuera.length) {
    informe.agregar('error', `Organismos genéricos que las reglas no aceptan: ${fuera.join(', ')}`, {
      archivo: 'src/app/models/organismo.model.ts',
      detalle: 'Un reporte asignado a uno de ellos falla con "permiso denegado".',
      solucion: 'Iguala IDS_ORGANISMOS y ORGANISMOS con la lista organismoId in [...] de firestore.rules.',
    });
  } else {
    informe.ok(`Organismos genéricos sincronizados (${idsApp.length})`);
  }
}

const transApp = catalogos.transiciones;
const transReglas = {};
const cuerpoTransicion = reglas?.match(/function\s+transicionValida\s*\([^)]*\)\s*\{([\s\S]*?)\n\s*\}/)?.[1] ?? '';
for (const m of cuerpoTransicion.matchAll(/desde\s*==\s*'(\w+)'\s*&&\s*hacia\s*(?:in\s*\[([^\]]*)\]|==\s*'(\w+)')/g)) {
  transReglas[m[1]] = (m[2] ? [...m[2].matchAll(/'([^']+)'/g)].map((x) => x[1]) : [m[3]]).sort();
}
if (Object.keys(transApp).length && Object.keys(transReglas).length) {
  const diferencias = [...new Set([...Object.keys(transApp), ...Object.keys(transReglas)])].filter(
    (e) => JSON.stringify(transApp[e] ?? []) !== JSON.stringify(transReglas[e] ?? []),
  );
  if (diferencias.length) {
    informe.agregar('error', `Transiciones de estado distintas entre la app y las reglas en: ${diferencias.join(', ')}`, {
      detalle: diferencias.map((e) => `${e}: app [${transApp[e] ?? ''}] · reglas [${transReglas[e] ?? ''}]`).join(' | '),
      solucion: 'La app ofrecería un cambio que las reglas rechazan, o al revés. Iguala TRANSICIONES y transicionValida().',
    });
  } else {
    informe.ok('Transiciones de estado sincronizadas');
  }
}

const intervaloReglas = Number(reglas?.match(/function\s+intervaloMinimoMs\s*\(\)\s*\{\s*return\s+(\d+)/)?.[1]);
const intervaloApp = Number(todoElCodigo.match(/INTERVALO_MINIMO_REPORTE_MS\s*=\s*([\d_]+)/)?.[1]?.replaceAll('_', ''));
if (intervaloReglas && intervaloApp && intervaloReglas !== intervaloApp) {
  informe.agregar('error', `Intervalo entre reportes: la app espera ${intervaloApp} ms y las reglas exigen ${intervaloReglas} ms`, {
    detalle: 'La app deja enviar y las reglas rechazan con "permiso denegado".',
  });
} else if (intervaloReglas && intervaloApp) {
  informe.ok(`Intervalo entre reportes sincronizado (${intervaloReglas} ms)`);
}

const correosReglas = [...(reglas?.match(/request\.auth\.token\.email\s+in\s+\[([\s\S]*?)\]/)?.[1] ?? '').matchAll(/'([^']+)'/g)].map((m) => m[1].toLowerCase()).sort();
const correosApp = [...(todoElCodigo.match(/CORREOS_ADMINISTRADORES[^=]*=\s*\[([\s\S]*?)\]/)?.[1] ?? '').matchAll(/'([^']+)'/g)].map((m) => m[1].toLowerCase()).sort();
if (correosReglas.length && correosApp.length) {
  if (JSON.stringify(correosReglas) !== JSON.stringify(correosApp)) {
    informe.agregar('error', 'La lista de administradores difiere entre firestore.rules y core/admin-emails.ts', {
      detalle: `Solo en reglas: ${correosReglas.filter((c) => !correosApp.includes(c)).join(', ') || '—'} · Solo en la app: ${correosApp.filter((c) => !correosReglas.includes(c)).join(', ') || '—'}`,
    });
  } else {
    informe.ok(`Lista de administradores sincronizada (${correosApp.length} correos)`);
  }
}

// ═══ 5. Reglas de seguridad ═════════════════════════════════════════════════
informe.seccion('Reglas de seguridad (análisis estático)');

if (reglas) {
  // Funciones definidas en las reglas, para expandir cada condición.
  const funciones = new Map();
  for (const m of reglas.matchAll(/function\s+(\w+)\s*\(([^)]*)\)\s*\{/g)) {
    funciones.set(m[1], bloqueBalanceado(reglas, m.index + m[0].length - 1, '{', '}'));
  }
  const expandir = (texto, vistas = new Set()) => {
    let salida = texto;
    for (const m of texto.matchAll(/\b(\w+)\s*\(/g)) {
      if (funciones.has(m[1]) && !vistas.has(m[1])) {
        vistas.add(m[1]);
        salida += '\n' + expandir(funciones.get(m[1]), vistas);
      }
    }
    return salida;
  };
  /** Rutas distintas leídas con get/exists/getAfter/existsAfter. */
  const lecturas = (texto) =>
    new Set([...texto.matchAll(/\b(?:get|exists|getAfter|existsAfter)\(\s*(\/databases[^)]*?)\)/g)].map((m) => m[1].replace(/\s+/g, '')));

  if (!/match\s+\/\{document=\*\*\}\s*\{\s*allow\s+read\s*,\s*write\s*:\s*if\s+false\s*;/.test(reglas)) {
    informe.agregar('brecha', 'No hay regla final que deniegue todo lo no declarado', {
      solucion: 'Agrega al final: match /{document=**} { allow read, write: if false; }',
    });
  } else {
    informe.ok('Denegación por defecto presente');
  }

  /** Cuerpo de un match sin sus match anidados (reemplazados por espacios para conservar posiciones). */
  const cuerpoPropio = (cuerpo) => {
    let salida = cuerpo;
    for (const m of cuerpo.matchAll(/match\s+\S+\s*\{/g)) {
      const abre = m.index + m[0].length - 1;
      const largo = m[0].length + bloqueBalanceado(cuerpo, abre, '{', '}').length + 1;
      salida = salida.slice(0, m.index) + salida.slice(m.index, m.index + largo).replace(/[^\n]/g, ' ') + salida.slice(m.index + largo);
    }
    return salida;
  };

  const lecturaAbierta = [];
  const sinListaBlanca = [];
  for (const r of matches) {
    const nombre = r.ruta.filter((_, i) => i % 2 === 0).join('/');
    const propio = cuerpoPropio(r.cuerpo);
    for (const a of propio.matchAll(/allow\s+([a-z ,]+):\s*if\s+([\s\S]*?);/g)) {
      const operaciones = a[1].split(',').map((s) => s.trim());
      const condicion = a[2].trim();
      const linea = lineaDe(reglas, r.inicio + 1 + a.index);
      const expandida = expandir(condicion);

      if (/^true$/.test(condicion)) {
        informe.agregar('brecha', `'${nombre}': allow ${a[1]} if true (abierto a cualquiera)`, { archivo: 'firestore.rules', linea });
      }
      if (operaciones.some((o) => ['read', 'get', 'list'].includes(o)) && /^estaAutenticado\(\)$|^request\.auth\s*!=\s*null$/.test(condicion)) {
        lecturaAbierta.push(nombre);
      }

      const n = lecturas(expandida).size;
      if (n > 10) {
        informe.agregar('error', `'${nombre}' allow ${a[1]}: hasta ${n} lecturas de documentos (límite 10)`, {
          archivo: 'firestore.rules',
          linea,
          detalle: 'Firestore rechaza la operación como "permiso denegado" al superar el límite.',
        });
      } else if (n > 7) {
        informe.agregar('advertencia', `'${nombre}' allow ${a[1]}: ${n} lecturas de documentos, cerca del límite de 10 (20 en lotes)`, {
          archivo: 'firestore.rules',
          linea,
        });
      }

      const escribeElUsuario = /esPropietario|request\.auth\.uid\s*==|==\s*request\.auth\.uid/.test(expandida);
      if (operaciones.includes('create') && escribeElUsuario && !/hasOnly\(/.test(expandida)) {
        sinListaBlanca.push(`${nombre} (línea ${linea})`);
      }
    }
  }

  if (lecturaAbierta.length) {
    informe.agregar('info', `Cualquier usuario con sesión puede leer: ${[...new Set(lecturaAbierta)].join(', ')}`, {
      detalle: 'Incluye uid, nombre y ubicación exacta de cada reporte. Es intencional en el MVP; tenlo presente para la política de privacidad.',
    });
  }
  if (sinListaBlanca.length) {
    informe.agregar('advertencia', `Creación sin lista blanca de campos (keys().hasOnly) en: ${sinListaBlanca.join(', ')}`, {
      archivo: 'firestore.rules',
      detalle: 'Un cliente modificado puede guardar campos extra (por ejemplo validadoComunidad: true) o inflar documentos hasta 1 MiB.',
      solucion: 'Agrega request.resource.data.keys().hasOnly([...]) con los campos que la app escribe.',
    });
  }

  // Brechas específicas conocidas de este proyecto
  const camposProtegidos = funciones.get('camposProtegidosIntactos') ?? '';
  const updateUsers = matches.find((r) => r.ruta.join('/') === 'users/{userId}')?.cuerpo ?? '';
  if (/'operadorId'/.test(updateUsers) && !/operadorId/.test(camposProtegidos)) {
    informe.agregar('brecha', 'Un operador puede cambiar su propio operadorId y gestionar reportes de otra municipalidad', {
      archivo: 'firestore.rules',
      detalle: 'users/{userId} update permite operadorId en la lista blanca, pero camposProtegidosIntactos() no lo protege.',
      solucion: "En camposProtegidosIntactos(): && request.resource.data.get('operadorId', null) == resource.data.get('operadorId', null)",
    });
  }
  const cuerpoAdmin = funciones.get('esCorreoAdministrador') ?? '';
  if (cuerpoAdmin && !/email_verified/.test(cuerpoAdmin)) {
    informe.agregar('brecha', 'esCorreoAdministrador() no exige correo verificado', {
      archivo: 'firestore.rules',
      detalle: 'Quien registre primero un correo de la lista (sin verificarlo) obtiene rol admin. Revisa con diagnostico/datos que todos existan ya en Authentication.',
      solucion: '&& request.auth.token.email_verified == true (y verifica los correos de la lista).',
    });
  }
  const crearReporte = matches.find((r) => r.ruta.join('/') === 'reports/{reportId}')?.cuerpo.match(/allow\s+create\s*:\s*if([\s\S]*?);/)?.[1] ?? '';
  if (crearReporte && !/createdAt\s*==\s*request\.time/.test(expandir(crearReporte))) {
    informe.agregar('advertencia', 'reports create no exige createdAt == request.time: se pueden crear reportes con fecha falsa', {
      archivo: 'firestore.rules',
      solucion: '&& request.resource.data.createdAt == request.time',
    });
  }
  const crearFoto = matches.find((r) => r.ruta[0] === 'reportPhotos')?.cuerpo.match(/allow\s+create\s*:\s*if([\s\S]*?);/)?.[1] ?? '';
  if (crearFoto && !/existsAfter|getAfter/.test(crearFoto)) {
    informe.agregar('advertencia', 'reportPhotos create no comprueba que exista el reporte: se pueden subir fotos huérfanas de hasta 950 KB', {
      archivo: 'firestore.rules',
      solucion: "&& existsAfter(/databases/$(database)/documents/reports/$(reportId)) && getAfter(/databases/$(database)/documents/reports/$(reportId)).data.uid == request.auth.uid",
      detalle: 'existsAfter() ve el estado posterior al lote, así que funciona con la escritura conjunta foto + reporte.',
    });
  }
  const crearMensaje = matches.find((r) => r.ruta.join('/').startsWith('supportTickets/{ticketId}/messages'))?.cuerpo ?? '';
  if (/!exists\(/.test(crearMensaje) && !/existsAfter/.test(crearMensaje)) {
    informe.agregar('advertencia', 'Se pueden crear mensajes de soporte en tickets que no existen (quedan huérfanos)', {
      archivo: 'firestore.rules',
      solucion: 'Reemplaza !exists(ticket) por existsAfter(ticket) && getAfter(ticket).data.uid == request.auth.uid.',
    });
  }
}

// ═══ 6. Fugas y robustez ════════════════════════════════════════════════════
informe.seccion('Suscripciones, temporizadores y eventos');

let fugas = 0;
for (const c of componentes) {
  const t = c.texto;
  const limpia = /ngOnDestroy|DestroyRef|takeUntilDestroyed|onCleanup|destroyRef/.test(t);
  const revisar = (patron, cancelacion, que) => {
    const uso = t.search(patron);
    if (uso >= 0 && !cancelacion.test(t) && !limpia) {
      fugas++;
      informe.agregar('advertencia', `${c.clase}: ${que} sin cancelar al salir de la pantalla`, {
        archivo: rel(c.archivo),
        linea: lineaDe(t, uso),
        detalle: 'Sigue activo después de cerrar la pantalla: consume lecturas, batería y puede actualizar una vista destruida.',
      });
    }
  };
  revisar(/onSnapshot\(/, /unsub|cancelar|detener/i, 'onSnapshot');
  revisar(/\.subscribe\(/, /unsubscribe|takeUntil|first\(\)|take\(1\)/, 'subscribe');
  revisar(/setInterval\(/, /clearInterval/, 'setInterval');
  if (/addEventListener\(/.test(t) && !/removeEventListener\(/.test(t)) {
    fugas++;
    informe.agregar('advertencia', `${c.clase}: addEventListener sin removeEventListener`, {
      archivo: rel(c.archivo),
      linea: lineaDe(t, t.indexOf('addEventListener(')),
    });
  }
}
for (const [archivo, t] of codigo) {
  for (const m of t.matchAll(/getDocs\(\s*(?:collection|collectionGroup)\(/g)) {
    informe.agregar('advertencia', 'getDocs sobre una colección completa, sin límite', {
      archivo: rel(archivo),
      linea: lineaDe(t, m.index),
      detalle: 'Con muchos documentos agota la cuota diaria de lecturas del plan Spark (50.000).',
      solucion: 'Usa query(..., limit(n)) o pagina.',
    });
  }
}
if (!fugas) informe.ok('Sin suscripciones, intervalos ni listeners sin cancelar en componentes');

// ═══ 7. Seguridad del cliente ═══════════════════════════════════════════════
informe.seccion('Seguridad del cliente y secretos');

const plantillas = componentes.map((c) => [c.archivoPlantilla, c.plantilla]);
for (const [archivo, t] of [...codigo, ...plantillas]) {
  for (const [patron, nivel, msg] of [
    [/\[innerHTML\]|\.innerHTML\s*=/, 'advertencia', 'innerHTML: si el contenido viene de un usuario permite inyectar HTML'],
    [/bypassSecurityTrust\w*\(/, 'brecha', 'bypassSecurityTrust desactiva la protección XSS de Angular'],
    [/\beval\(|new Function\(/, 'brecha', 'eval / new Function ejecuta texto como código'],
  ]) {
    const m = t.match(patron);
    if (m) informe.agregar(nivel, msg, { archivo: rel(archivo), linea: lineaDe(t, m.index) });
  }
}

let logs = 0;
for (const [archivo, t] of codigo) {
  for (const m of t.matchAll(/console\.(log|debug|info)\(([^;]*)\)/g)) {
    logs++;
    if (/uid|email|correo|token|password|contrase|ubicacion|lat\b|lng\b|dataUrl/i.test(m[2])) {
      informe.agregar('advertencia', `console.${m[1]} con datos personales o sensibles`, {
        archivo: rel(archivo),
        linea: lineaDe(t, m.index),
        detalle: 'En Android quedan en el registro del sistema (logcat).',
      });
    }
  }
}
if (logs) informe.agregar('info', `${logs} llamadas a console.log/debug/info en src/`);

if (/-----BEGIN (RSA )?PRIVATE KEY-----|"private_key"\s*:/.test(todoElCodigo)) {
  informe.agregar('brecha', 'Hay una llave privada dentro de src/: terminaría dentro del APK');
}

const secretos = listar(RAIZ, (n) => /firebase-adminsdk.*\.json$|\.jks$|\.keystore$|^keystore\.properties$|^\.env(\..*)?$/.test(n));
const hayGit = spawnSync('git', ['rev-parse', '--is-inside-work-tree'], { cwd: RAIZ, encoding: 'utf8' }).stdout?.trim() === 'true';
const gitignore = leerSiExiste(join(RAIZ, '.gitignore')) ?? '';
for (const s of secretos) {
  const ignorado = hayGit
    ? spawnSync('git', ['check-ignore', '-q', s], { cwd: RAIZ }).status === 0
    : gitignore.split(/\r?\n/).some((p) => p.trim() && !p.startsWith('#') && new RegExp(`^${p.trim().replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`).test(s.split(sep).pop()));
  // keystore.properties ignorado es la práctica habitual de Android: solo se informa.
  const nivelIgnorado = s.endsWith('keystore.properties') ? 'info' : 'advertencia';
  informe.agregar(ignorado ? nivelIgnorado : 'brecha', `${ignorado ? 'Archivo secreto dentro del proyecto (ignorado por git)' : 'Archivo secreto que git SUBIRÍA al repositorio'}: ${rel(s)}`, {
    solucion: ignorado ? 'Mejor guárdalo fuera de la carpeta del proyecto, por ejemplo en C:\\claves.' : 'Agrégalo a .gitignore ya, y si ya se subió, revoca la clave y genera otra.',
  });
}
for (const patron of ['keystore.properties', '*.jks', '*firebase-adminsdk*.json']) {
  if (!gitignore.includes(patron)) {
    informe.agregar('advertencia', `.gitignore no incluye '${patron}'`, { solucion: `Agrega la línea ${patron} a .gitignore.` });
  }
}

const envProd = leerSiExiste(join(SRC, 'environments', 'environment.prod.ts'));
if (envProd) {
  if (/useEmulators:\s*true/.test(envProd)) informe.agregar('error', 'environment.prod.ts tiene useEmulators: true');
  if (/REEMPLAZA|000000000000/.test(envProd)) informe.agregar('error', 'environment.prod.ts tiene valores de ejemplo en firebase');
}

// ═══ 8. Android y build ═════════════════════════════════════════════════════
informe.seccion('Android, Capacitor y build');

const capConfig = leerSiExiste(join(RAIZ, 'capacitor.config.ts')) ?? '';
const appId = capConfig.match(/appId:\s*['"]([^'"]+)['"]/)?.[1];
const gradle = leerSiExiste(join(RAIZ, 'android', 'app', 'build.gradle')) ?? '';
const variables = leerSiExiste(join(RAIZ, 'android', 'variables.gradle')) ?? '';
if (!gradle) {
  informe.agregar('info', 'No hay carpeta android/ (ejecuta npx cap add android para revisar Android).');
} else {
  const applicationId = gradle.match(/applicationId\s*=?\s*["']([^"']+)["']/)?.[1];
  if (appId && applicationId && appId !== applicationId) {
    informe.agregar('error', `capacitor.config.ts usa ${appId} y build.gradle ${applicationId}`);
  } else if (applicationId) {
    informe.ok(`Paquete Android: ${applicationId}`);
  }
  const target = Number((variables + gradle).match(/targetSdkVersion\s*=?\s*(\d+)/)?.[1]);
  if (target && target < 36) {
    informe.agregar('info', `targetSdkVersion ${target}: Google Play exige 36 desde el 31-08-2026 (no afecta al APK de demo)`);
  }

  const gs = leerSiExiste(join(RAIZ, 'android', 'app', 'google-services.json'));
  if (gs && applicationId) {
    const paquetes = [...gs.matchAll(/"package_name"\s*:\s*"([^"]+)"/g)].map((m) => m[1]);
    if (!paquetes.includes(applicationId)) {
      informe.agregar('error', `google-services.json no incluye el paquete ${applicationId} (tiene: ${paquetes.join(', ')})`, {
        detalle: 'Gradle falla con "No matching client found for package name".',
      });
    }
  }

  const manifiesto = leerSiExiste(join(RAIZ, 'android', 'app', 'src', 'main', 'AndroidManifest.xml')) ?? '';
  if (/android:allowBackup="true"/.test(manifiesto)) {
    informe.agregar('advertencia', 'AndroidManifest: allowBackup="true" copia la sesión de Firebase en los respaldos de Android', { archivo: 'android/app/src/main/AndroidManifest.xml' });
  }
  if (/usesCleartextTraffic="true"/.test(manifiesto)) {
    informe.agregar('advertencia', 'AndroidManifest: usesCleartextTraffic="true" permite tráfico http sin cifrar', { archivo: 'android/app/src/main/AndroidManifest.xml' });
  }
  if (/ACCESS_BACKGROUND_LOCATION/.test(manifiesto)) {
    informe.agregar('advertencia', 'AndroidManifest pide ubicación en segundo plano; la app no la necesita', { archivo: 'android/app/src/main/AndroidManifest.xml' });
  }
}

const webDir = capConfig.match(/webDir:\s*['"]([^'"]+)['"]/)?.[1] ?? 'www';
if (existsSync(join(RAIZ, webDir)) && !existsSync(join(RAIZ, webDir, 'index.html'))) {
  informe.agregar('error', `webDir '${webDir}' no contiene index.html: el APK mostraría una pantalla en blanco`, {
    solucion: 'Revisa outputPath en angular.json (debe dejar index.html directo en www).',
  });
}

// Presupuesto de estilos por componente
const angularJson = JSON.parse(leerSiExiste(join(RAIZ, 'angular.json')) ?? '{}');
const presupuestos = Object.values(angularJson.projects ?? {})[0]?.architect?.build?.configurations?.production?.budgets ?? [];
const porComponente = presupuestos.find((b) => b.type === 'anyComponentStyle');
const aBytes = (v) => (v ? Number.parseFloat(v) * (/mb/i.test(v) ? 1024 * 1024 : /kb/i.test(v) ? 1024 : 1) : null);
const limiteEstilo = aBytes(porComponente?.maximumError);
if (limiteEstilo) {
  let sass = null;
  try {
    sass = createRequire(join(RAIZ, 'package.json'))('sass');
  } catch {
    // Sin sass instalado se usa el tamaño del archivo fuente, que sobrestima.
  }
  for (const c of componentes) {
    for (const e of c.estilos) {
      const ruta = resolve(dirname(c.archivo), e);
      if (!existsSync(ruta)) continue;
      let bytes = statSync(ruta).size;
      let compilado = false;
      try {
        if (sass) {
          bytes = Buffer.byteLength(sass.compile(ruta, { style: 'compressed', loadPaths: [SRC] }).css);
          compilado = true;
        }
      } catch {
        // Si no compila aislado, se mantiene el tamaño del fuente.
      }
      if (!compilado) {
        // El fuente incluye comentarios y espacios: solo se avisa si es claramente grande.
        if (bytes > limiteEstilo * 1.3) {
          informe.agregar('advertencia', `${rel(ruta)} pesa ${(bytes / 1024).toFixed(2)} kB sin compilar; podría superar el límite de ${porComponente.maximumError}`, {
            detalle: 'No se encontró el paquete sass para medir el tamaño real.',
          });
        }
        continue;
      }
      if (bytes > limiteEstilo) {
        informe.agregar('error', `${rel(ruta)} pesa ${(bytes / 1024).toFixed(2)} kB y el límite es ${porComponente.maximumError}`, {
          detalle: 'ng build falla con "exceeded maximum budget".',
          solucion: 'Mueve estilos de ::ng-deep a una hoja global en src/theme, como mapa.scss.',
        });
      } else if (bytes > limiteEstilo * 0.85) {
        informe.agregar('advertencia', `${rel(ruta)} pesa ${(bytes / 1024).toFixed(2)} kB, cerca del límite de ${porComponente.maximumError}`);
      }
    }
  }
}

// Recursos que la app carga en tiempo de ejecución
const BYTES_POR_TIPO = { float32: 4, int32: 4, bool: 1, uint8: 1, uint16: 2, float16: 2 };
for (const carpeta of ['coco-ssd', 'face-detection']) {
  const dir = join(SRC, 'assets', 'models', carpeta);
  const manifiesto = join(dir, 'model.json');
  if (!existsSync(manifiesto)) {
    informe.agregar('error', `Falta el modelo de privacidad ${carpeta}: las fotos no se podrán proteger`, {
      solucion: 'node scripts/descargar-modelos-privacidad.mjs',
    });
    continue;
  }
  try {
    const m = JSON.parse(leer(manifiesto));
    const ok = (m.weightsManifest ?? []).every((g) => {
      const esperado = g.weights.reduce((t, p) => t + p.shape.reduce((a, b) => a * b, 1) * (BYTES_POR_TIPO[p.quantization?.dtype ?? p.dtype] ?? 4), 0);
      const real = g.paths.reduce((t, f) => t + (existsSync(join(dir, f)) ? statSync(join(dir, f)).size : 0), 0);
      return esperado === real;
    });
    ok ? informe.ok(`Modelo ${carpeta} completo`) : informe.agregar('error', `Modelo ${carpeta} incompleto o corrupto`, { solucion: `Borra src/assets/models/${carpeta} y vuelve a descargarlo.` });
  } catch {
    informe.agregar('error', `model.json de ${carpeta} no es JSON válido`);
  }
}
const regiones = Array.from({ length: 16 }, (_, i) => `region-${String(i + 1).padStart(2, '0')}.geojson`);
const faltan = ['indice.json', ...regiones].filter((f) => !existsSync(join(SRC, 'assets', 'geo', f)));
faltan.length
  ? informe.agregar('error', `Faltan límites comunales: ${faltan.join(', ')}`, { detalle: 'Los reportes de esas regiones quedan sin comuna y van al organismo genérico.' })
  : informe.ok('Límites comunales completos (16 regiones)');

const pendientes = [...todoElCodigo.matchAll(/\b(TODO|FIXME|HACK)\b/g)].length;
if (pendientes) informe.agregar('info', `${pendientes} marcas TODO/FIXME/HACK en src/`);

// ═══ 9. Módulos ═════════════════════════════════════════════════════════════
informe.seccion('Módulos (src/app/modulos)');
revisarModulos({ informe, SRC, codigo, componentes, rel });
revisarParametrosConfianza({ informe, SRC, reglas, rel });

// ═══ Build opcional ═════════════════════════════════════════════════════════
if (CON_BUILD) {
  informe.seccion('Compilación de producción (ng build)');
  console.log('  compilando, puede tardar un minuto…');
  const r = spawnSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['ng', 'build', '--configuration', 'production'], {
    cwd: RAIZ,
    encoding: 'utf8',
    shell: process.platform === 'win32',
    maxBuffer: 64 * 1024 * 1024,
  });
  const salida = `${r.stdout ?? ''}\n${r.stderr ?? ''}`.replace(/\x1b\[[0-9;]*m/g, '');
  const errores = [...salida.matchAll(/X \[ERROR\] ([^\n]+)\n(?:[\s\S]*?\n\s+(src\/[^\s:]+):(\d+))?/g)];
  for (const e of errores) informe.agregar('error', `ng build: ${e[1].trim()}`, { archivo: e[2], linea: e[3] ? Number(e[3]) : undefined });
  const avisos = (salida.match(/▲ \[WARNING\]/g) ?? []).length;
  if (r.status === 0) informe.ok(`Compila en producción (${avisos} advertencias del compilador)`);
  else if (!errores.length) informe.agregar('error', 'ng build falló; revisa la salida completa ejecutando npx ng build');
}

process.exitCode = informe.cerrar(RAIZ, 'codigo.md');
