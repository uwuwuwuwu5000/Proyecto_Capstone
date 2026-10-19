/**
 * Utilidades compartidas por los scripts de diagnóstico: registro de
 * hallazgos, impresión por consola e informe en Markdown.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** Severidades, de más a menos grave. */
export const NIVELES = {
  error: { icono: '✖', titulo: 'Errores', descripcion: 'Rompen el build o una funcionalidad.' },
  brecha: { icono: '⛨', titulo: 'Brechas de seguridad', descripcion: 'Permiten algo que no debería estar permitido.' },
  advertencia: { icono: '⚠', titulo: 'Advertencias', descripcion: 'Bugs probables o riesgos a futuro.' },
  info: { icono: 'ℹ', titulo: 'Información', descripcion: 'Datos útiles; no requieren acción inmediata.' },
};

export class Informe {
  constructor(titulo) {
    this.titulo = titulo;
    this.hallazgos = [];
    this.secciones = [];
    this.inicio = Date.now();
  }

  /** Marca el comienzo de un grupo de comprobaciones. */
  seccion(nombre) {
    this.secciones.push(nombre);
    this.actual = nombre;
    process.stdout.write(`\n▸ ${nombre}\n`);
  }

  /**
   * @param {'error'|'brecha'|'advertencia'|'info'} nivel
   * @param {string} mensaje   Qué está mal, en una línea.
   * @param {{archivo?: string, linea?: number, detalle?: string, solucion?: string}} [extra]
   */
  agregar(nivel, mensaje, extra = {}) {
    const h = { nivel, seccion: this.actual, mensaje, ...extra };
    this.hallazgos.push(h);
    const donde = h.archivo ? `  (${h.archivo}${h.linea ? `:${h.linea}` : ''})` : '';
    process.stdout.write(`  ${NIVELES[nivel].icono} ${mensaje}${donde}\n`);
    if (h.solucion) process.stdout.write(`      → ${h.solucion}\n`);
  }

  ok(mensaje) {
    process.stdout.write(`  ✓ ${mensaje}\n`);
  }

  cuenta(nivel) {
    return this.hallazgos.filter((h) => h.nivel === nivel).length;
  }

  /** Imprime el resumen, escribe el Markdown y devuelve el código de salida. */
  cerrar(raiz, nombreArchivo) {
    const segundos = ((Date.now() - this.inicio) / 1000).toFixed(1);
    const resumen = Object.keys(NIVELES)
      .map((n) => `${NIVELES[n].icono} ${this.cuenta(n)} ${NIVELES[n].titulo.toLowerCase()}`)
      .join('   ');

    process.stdout.write(`\n${'─'.repeat(70)}\n${resumen}\n`);

    const carpeta = join(raiz, 'diagnostico');
    mkdirSync(carpeta, { recursive: true });
    const ruta = join(carpeta, nombreArchivo);
    writeFileSync(ruta, this.markdown(segundos));
    process.stdout.write(`Informe: ${ruta}  (${segundos} s)\n\n`);

    return this.cuenta('error') + this.cuenta('brecha') > 0 ? 1 : 0;
  }

  markdown(segundos) {
    const fecha = new Date().toLocaleString('es-CL', { timeZone: 'America/Santiago' });
    const lineas = [
      `# ${this.titulo}`,
      '',
      `Generado el ${fecha} en ${segundos} s.`,
      '',
      '| Severidad | Cantidad | Significado |',
      '|---|---:|---|',
      ...Object.entries(NIVELES).map(([n, d]) => `| ${d.icono} ${d.titulo} | ${this.cuenta(n)} | ${d.descripcion} |`),
      '',
    ];

    for (const [nivel, datos] of Object.entries(NIVELES)) {
      const lista = this.hallazgos.filter((h) => h.nivel === nivel);
      if (!lista.length) continue;
      lineas.push(`## ${datos.icono} ${datos.titulo}`, '');
      for (const h of lista) {
        const donde = h.archivo ? ` — \`${h.archivo}${h.linea ? `:${h.linea}` : ''}\`` : '';
        lineas.push(`- **[${h.seccion}]** ${h.mensaje}${donde}`);
        if (h.detalle) lineas.push(`  - ${h.detalle}`);
        if (h.solucion) lineas.push(`  - Solución: ${h.solucion}`);
      }
      lineas.push('');
    }

    lineas.push('## Comprobaciones ejecutadas', '', ...this.secciones.map((s) => `- ${s}`), '');
    return lineas.join('\n');
  }
}

/** Número de línea (1-based) de una posición dentro de un texto. */
export function lineaDe(texto, indice) {
  let n = 1;
  for (let i = 0; i < indice && i < texto.length; i++) if (texto.charCodeAt(i) === 10) n++;
  return n;
}

/** Quita comentarios // y /* *\/ de TypeScript conservando saltos de línea. */
export function sinComentarios(codigo) {
  let salida = '';
  let i = 0;
  let cadena = null;
  while (i < codigo.length) {
    const c = codigo[i];
    const sig = codigo[i + 1];
    if (cadena) {
      salida += c;
      if (c === '\\') {
        salida += sig ?? '';
        i += 2;
        continue;
      }
      if (c === cadena) cadena = null;
      i++;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      cadena = c;
      salida += c;
      i++;
      continue;
    }
    if (c === '/' && sig === '/') {
      while (i < codigo.length && codigo[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && sig === '*') {
      i += 2;
      while (i < codigo.length && !(codigo[i] === '*' && codigo[i + 1] === '/')) {
        if (codigo[i] === '\n') salida += '\n';
        i++;
      }
      i += 2;
      continue;
    }
    salida += c;
    i++;
  }
  return salida;
}

/** Devuelve el texto entre el paréntesis/llave que abre en `inicio` y su cierre. */
export function bloqueBalanceado(texto, inicio, abre = '(', cierra = ')') {
  let profundidad = 0;
  for (let i = inicio; i < texto.length; i++) {
    if (texto[i] === abre) profundidad++;
    else if (texto[i] === cierra) {
      profundidad--;
      if (profundidad === 0) return texto.slice(inicio + 1, i);
    }
  }
  return texto.slice(inicio + 1);
}

/** kebab-case → camelCase (refresh-outline → refreshOutline). */
export const aCamel = (s) => s.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());

/** ion-back-button → IonBackButton */
export const aPascal = (s) => aCamel(s).replace(/^./, (c) => c.toUpperCase());
