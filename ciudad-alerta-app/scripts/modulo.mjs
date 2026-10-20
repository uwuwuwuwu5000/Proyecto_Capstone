#!/usr/bin/env node
/**
 * Módulos de Ciudad Alerta desde la terminal.
 *
 *   npm run modulos                              lista los módulos y su estado
 *   npm run modulo -- desactivar municipalidades quita una funcionalidad
 *   npm run modulo -- activar municipalidades    la vuelve a poner
 *   npm run modulo -- nuevo mapa-calor           crea un módulo nuevo con una pantalla
 *   npm run modulo -- nuevo mapa-calor --nombre "Mapa de calor" --staff
 *
 * Solo edita src/app/modulos.config.ts (activar/desactivar) o crea la carpeta
 * del módulo nuevo (nuevo). Después: `npm run diagnostico` y `ionic serve`.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { leerModulos } from './diagnostico/modulos.mjs';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(RAIZ, 'src');
const [, , comando = 'lista', id, ...resto] = process.argv;

const opcion = (nombre) => {
  const i = resto.indexOf(`--${nombre}`);
  return i < 0 ? null : resto[i + 1] && !resto[i + 1].startsWith('--') ? resto[i + 1] : true;
};

const salir = (mensaje) => {
  console.error(`\n✖ ${mensaje}\n`);
  process.exit(1);
};

const inventario = leerModulos(SRC);
if (!inventario.config) salir('No se encontró src/app/modulos.config.ts. Ejecuta el comando desde la raíz del proyecto.');

const modulos = inventario.modulos.filter((m) => m.valido);
const porId = new Map(modulos.map((m) => [m.id, m]));

switch (comando) {
  case 'lista':
    lista();
    break;
  case 'activar':
  case 'desactivar':
    cambiar(comando === 'activar');
    break;
  case 'nuevo':
    nuevo();
    break;
  default:
    salir(`Comando desconocido '${comando}'. Usa: lista, activar <id>, desactivar <id>, nuevo <id>.`);
}

function lista() {
  console.log('\nMódulos de Ciudad Alerta (src/app/modulos.config.ts)\n');
  const ancho = Math.max(...modulos.map((m) => m.id.length), 4);
  for (const m of modulos) {
    const estado = !m.enConfig ? '  sin configurar' : m.activo ? '● activo' : '○ inactivo';
    const partes = [
      m.rutas.length && `rutas: ${m.rutas.map((r) => `/${r.path}`).join(' ')}`,
      m.accesos.length && `botones: ${m.accesos.length}`,
      m.ranuras.length && `ranuras: ${m.ranuras.join(', ')}`,
      m.requiere.length && `requiere: ${m.requiere.join(', ')}`,
      m.opcionales.length && `usa si está: ${m.opcionales.join(', ')}`,
    ].filter(Boolean);
    console.log(`  ${estado.padEnd(16)} ${m.id.padEnd(ancho)}  ${m.nombre}`);
    if (partes.length) console.log(`  ${''.padEnd(16)} ${''.padEnd(ancho)}  ${partes.join(' · ')}`);
  }
  for (const m of inventario.modulos.filter((x) => !x.valido)) {
    console.log(`  ✖ ${m.carpeta}: carpeta sin ${m.carpeta}.modulo.ts`);
  }
  console.log('\nCambiar: npm run modulo -- desactivar <id>   ·   Revisar: npm run diagnostico\n');
}

function cambiar(activar) {
  if (!id) salir(`Falta el id. Ejemplo: npm run modulo -- ${activar ? 'activar' : 'desactivar'} municipalidades`);
  const modulo = porId.get(id);
  if (!modulo) salir(`No existe el módulo '${id}'. Módulos: ${[...porId.keys()].join(', ')}`);
  if (!modulo.enConfig) salir(`'${id}' no está en modulos.config.ts. Agrega su import y la línea { modulo: ${modulo.constante}, activo: true }.`);
  if (modulo.activo === activar) {
    console.log(`\n'${id}' ya estaba ${activar ? 'activo' : 'inactivo'}. Nada que cambiar.\n`);
    return;
  }

  if (activar) {
    const faltan = modulo.requiere.filter((dep) => !porId.get(dep)?.activo);
    if (faltan.length) salir(`'${id}' requiere ${faltan.join(', ')}. Actívalos primero.`);
  } else {
    const dependientes = modulos.filter((m) => m.activo && m.requiere.includes(id)).map((m) => m.id);
    if (dependientes.length && !opcion('forzar')) {
      salir(`${dependientes.join(', ')} requiere(n) '${id}'. Desactívalos primero o agrega --forzar.`);
    }
  }

  const { archivo, texto } = inventario.config;
  const patron = new RegExp(`(\\{\\s*modulo:\\s*${modulo.constante}\\s*,\\s*activo:\\s*)(true|false)`);
  if (!patron.test(texto)) salir(`No se encontró la línea de ${modulo.constante} en modulos.config.ts.`);
  writeFileSync(archivo, texto.replace(patron, `$1${activar}`));

  const usan = modulos.filter((m) => m.opcionales.includes(id)).map((m) => m.id);
  console.log(`\n✓ '${id}' ${activar ? 'activado' : 'desactivado'} en src/app/modulos.config.ts`);
  if (!activar && modulo.rutas.length) console.log(`  Sus pantallas (${modulo.rutas.map((r) => `/${r.path}`).join(', ')}) ahora llevan al inicio.`);
  if (usan.length) console.log(`  ${usan.join(', ')} lo ${activar ? 'vuelve(n) a usar' : 'dejan de usar'} automáticamente.`);
  console.log('  Recarga la app (ionic serve) o vuelve a generar el APK para ver el cambio.\n');
}

function nuevo() {
  if (!id) salir('Falta el id. Ejemplo: npm run modulo -- nuevo mapa-calor');
  if (!/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(id)) salir(`El id '${id}' debe ir en minúsculas, con guiones: mapa-calor, mi-perfil.`);
  if (existsSync(join(inventario.carpeta, id))) salir(`Ya existe src/app/modulos/${id}.`);

  const rutaUsada = modulos.find((m) => m.rutas.some((r) => r.path === id));
  if (rutaUsada) salir(`La ruta '/${id}' ya la usa el módulo '${rutaUsada.id}'.`);

  const nombre = typeof opcion('nombre') === 'string' ? opcion('nombre') : id.replace(/-/g, ' ').replace(/^./, (l) => l.toUpperCase());
  const staff = opcion('staff') === true;
  const pascal = id.replace(/(^|-)([a-z0-9])/g, (_, __, l) => l.toUpperCase());
  const constante = `MODULO_${id.toUpperCase().replace(/-/g, '_')}`;
  const comillas = (t) => t.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

  const dir = join(inventario.carpeta, id);
  const dirPagina = join(dir, 'paginas', id);
  mkdirSync(dirPagina, { recursive: true });

  writeFileSync(
    join(dir, `${id}.modulo.ts`),
    `import { appsOutline } from 'ionicons/icons';

import { ${staff ? 'staffGuard' : 'authGuard'} } from '../../guards/auth-guard';
import { ModuloApp } from '../../nucleo/modulos/modulo.model';

/**
 * ${nombre}.
 *
 * Qué hace y para quién: (escríbelo aquí; aparece en \`npm run modulos\`).
 */
export const ${constante}: ModuloApp = {
  id: '${id}',
  nombre: '${comillas(nombre)}',
  descripcion: 'Describe en una frase qué hace este módulo.',
  // requiere: ['otro-modulo'],   // módulos sin los que este no funciona
  // opcionales: ['confianza'],   // módulos que usa si están activos
  rutas: [
    {
      path: '${id}',
      canActivate: [${staff ? 'staffGuard' : 'authGuard'}],
      loadComponent: () => import('./paginas/${id}/${id}.page').then((m) => m.${pascal}Page),
    },
  ],
  accesos: [
    {
      id: '${id}',
      texto: '${comillas(nombre)}',
      icono: 'apps-outline',
      ruta: '/${id}',${staff ? "\n      roles: ['operador', 'admin'],\n      estilo: 'gestion'," : ''}
      orden: ${staff ? 130 : 60},
    },
  ],
  iconos: { 'apps-outline': appsOutline },
};
`,
  );

  writeFileSync(
    join(dir, 'index.ts'),
    `/** API pública del módulo ${id}. Exporta aquí lo que otros módulos puedan usar. */\nexport { ${constante} } from './${id}.modulo';\n`,
  );

  writeFileSync(
    join(dirPagina, `${id}.page.ts`),
    `import { Component } from '@angular/core';
import {
  IonBackButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonTitle,
  IonToolbar,
} from '@ionic/angular';

/** Pantalla principal del módulo ${id}. */
@Component({
  selector: 'app-${id}',
  standalone: true,
  templateUrl: './${id}.page.html',
  styleUrls: ['./${id}.page.scss'],
  imports: [IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton, IonContent],
})
export class ${pascal}Page {}
`,
  );

  writeFileSync(
    join(dirPagina, `${id}.page.html`),
    `<ion-header class="cabecera" [translucent]="true">
  <ion-toolbar>
    <ion-buttons slot="start">
      <ion-back-button defaultHref="/home" text="" aria-label="Volver"></ion-back-button>
    </ion-buttons>
    <ion-title>${nombre}</ion-title>
  </ion-toolbar>
</ion-header>

<ion-content class="contenido" [fullscreen]="true">
  <div class="shell">
    <p>Pantalla nueva del módulo <strong>${id}</strong>.</p>
  </div>
</ion-content>
`,
  );

  writeFileSync(
    join(dirPagina, `${id}.page.scss`),
    `.cabecera ion-toolbar {
  --background: var(--ca-base);
  --color: var(--ca-ink);
  --border-color: var(--ca-line);
}

.contenido {
  --background: var(--ca-base);
  --color: var(--ca-ink);
}

.shell {
  max-width: 520px;
  margin: 0 auto;
  padding: 1.25rem;
}
`,
  );

  // Registro en modulos.config.ts: el import junto a los demás y la entrada al final.
  const { archivo, texto } = inventario.config;
  const linea = `import { ${constante} } from './modulos/${id}/${id}.modulo';`;
  const imports = [...texto.matchAll(/^import \{ MODULO_\w+ \} from '\.\/modulos\/[^']+';$/gm)];
  let actualizado = imports.length
    ? texto.slice(0, imports.at(-1).index + imports.at(-1)[0].length) + `\n${linea}` + texto.slice(imports.at(-1).index + imports.at(-1)[0].length)
    : `${linea}\n${texto}`;
  actualizado = actualizado.replace(
    /(export const CONFIG_MODULOS[^=]*=\s*\[[\s\S]*?)(\n\];)/,
    `$1\n  { modulo: ${constante}, activo: true },$2`,
  );
  writeFileSync(archivo, actualizado);

  console.log(`
✓ Módulo '${id}' creado y activado

  src/app/modulos/${id}/${id}.modulo.ts      manifiesto: rutas, botón del inicio, íconos
  src/app/modulos/${id}/index.ts             lo que otros módulos pueden usar
  src/app/modulos/${id}/paginas/${id}/       la pantalla /${id}
  src/app/modulos.config.ts                  { modulo: ${constante}, activo: true }

Siguiente:
  1. ionic serve  → el botón «${nombre}» ya aparece en el inicio${staff ? ' (solo staff)' : ''}.
  2. Escribe la pantalla en paginas/${id}/.
  3. Si lee o escribe Firestore, agrega la regla en firestore.rules.
  4. npm run diagnostico
`);
}
