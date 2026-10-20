/**
 * Lectura y revisión de los módulos de la app (src/app/modulos).
 *
 * Lo usan el diagnóstico de código (sección «Módulos») y el comando
 * `npm run modulo`. Lee los archivos como texto: no compila ni ejecuta nada.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';

import { bloqueBalanceado, lineaDe, sinComentarios } from './comun.mjs';

const leer = (p) => sinComentarios(readFileSync(p, 'utf8'));

/** Contenido entre los corchetes o llaves que siguen a `clave:`. */
function bloque(texto, clave, abre = '[', cierra = ']') {
  const m = new RegExp(`\\b${clave}:\\s*\\${abre}`).exec(texto);
  return m ? bloqueBalanceado(texto, m.index + m[0].length - 1, abre, cierra) : '';
}

const textos = (texto, re) => [...texto.matchAll(re)].map((m) => m[1]);

/** Nombres de ranura declarados en nucleo/modulos/ranuras.ts: { clave → nombre }. */
export function leerRanuras(src) {
  const archivo = join(src, 'app', 'nucleo', 'modulos', 'ranuras.ts');
  if (!existsSync(archivo)) return { archivo, porClave: new Map() };
  const texto = leer(archivo);
  return {
    archivo,
    porClave: new Map([...texto.matchAll(/(\w+):\s*'([a-z0-9-]+\.[a-z0-9-]+)'/g)].map((m) => [m[1], m[2]])),
  };
}

/**
 * Inventario de módulos y de la configuración.
 * @returns {{
 *   carpeta: string,
 *   config: { archivo: string, texto: string, entradas: {constante: string, carpeta: string|null, activo: boolean, indice: number}[] } | null,
 *   modulos: object[],
 *   ranuras: Map<string,string>,
 * }}
 */
export function leerModulos(src) {
  const carpeta = join(src, 'app', 'modulos');
  const ranuras = leerRanuras(src).porClave;

  const archivoConfig = join(src, 'app', 'modulos.config.ts');
  let config = null;
  if (existsSync(archivoConfig)) {
    const crudo = readFileSync(archivoConfig, 'utf8');
    const texto = sinComentarios(crudo);
    const carpetaDe = new Map(
      [...texto.matchAll(/import\s*\{\s*(MODULO_\w+)\s*\}\s*from\s*'\.\/modulos\/([^/']+)\/[^']*'/g)].map((m) => [m[1], m[2]]),
    );
    const entradas = [...texto.matchAll(/\{\s*modulo:\s*(MODULO_\w+)\s*,\s*activo:\s*(true|false)\s*,?\s*\}/g)].map((m) => ({
      constante: m[1],
      carpeta: carpetaDe.get(m[1]) ?? null,
      activo: m[2] === 'true',
      indice: m.index,
    }));
    config = { archivo: archivoConfig, texto: crudo, entradas };
  }

  const modulos = [];
  if (existsSync(carpeta)) {
    for (const entrada of readdirSync(carpeta, { withFileTypes: true })) {
      if (!entrada.isDirectory()) continue;
      const dir = join(carpeta, entrada.name);
      const archivo = join(dir, `${entrada.name}.modulo.ts`);
      const base = { carpeta: entrada.name, dir, archivo, tieneIndex: existsSync(join(dir, 'index.ts')) };

      if (!existsSync(archivo)) {
        modulos.push({ ...base, valido: false });
        continue;
      }

      const texto = leer(archivo);
      const inicio = texto.search(/:\s*ModuloApp\s*=\s*\{/);
      const cuerpo = inicio >= 0 ? bloqueBalanceado(texto, texto.indexOf('{', inicio), '{', '}') : texto;
      const constante = texto.match(/export\s+const\s+(MODULO_\w+)/)?.[1] ?? null;
      const enConfig = config?.entradas.find((e) => e.constante === constante) ?? null;

      const rutas = [];
      const bloqueRutas = bloque(cuerpo, 'rutas');
      for (const m of bloqueRutas.matchAll(/path:\s*'([^']*)'/g)) rutas.push({ path: m[1], indice: texto.indexOf(m[0]) });
      const cargas = [...bloqueRutas.matchAll(/import\(\s*'([^']+)'\s*\)\s*\.then\(\s*\(?\s*(\w+)\s*\)?\s*=>\s*\2\.(\w+)/g)].map((m) => ({
        ruta: m[1],
        clase: m[3],
        indice: texto.indexOf(m[0]),
      }));

      const bloqueAccesos = bloque(cuerpo, 'accesos');
      const idsAcceso = textos(bloqueAccesos, /\bid:\s*'([^']+)'/g);
      const iconosAcceso = textos(bloqueAccesos, /icono:\s*'([^']+)'/g);
      const rutasAcceso = textos(bloqueAccesos, /ruta:\s*'([^']+)'/g);
      const accesos = idsAcceso.map((id, i) => ({ id, icono: iconosAcceso[i], ruta: rutasAcceso[i] }));

      const bloqueRanuras = bloque(cuerpo, 'ranuras');
      const aportes = [...bloqueRanuras.matchAll(/ranura:\s*(?:RANURAS\.(\w+)|'([^']+)')/g)].map((m) =>
        m[1] ? ranuras.get(m[1]) ?? `RANURAS.${m[1]}` : m[2],
      );
      const cargasRanura = [...bloqueRanuras.matchAll(/import\(\s*'([^']+)'\s*\)\s*\.then\(\s*\(?\s*(\w+)\s*\)?\s*=>\s*\2\.(\w+)/g)].map((m) => ({
        ruta: m[1],
        clase: m[3],
        indice: texto.indexOf(m[0]),
      }));

      modulos.push({
        ...base,
        valido: true,
        texto,
        constante,
        id: cuerpo.match(/^\s*id:\s*'([^']+)'/m)?.[1] ?? null,
        nombre: cuerpo.match(/^\s*nombre:\s*'([^']+)'/m)?.[1] ?? entrada.name,
        descripcion: cuerpo.match(/^\s*descripcion:\s*'([^']+)'/m)?.[1] ?? '',
        requiere: textos(bloque(cuerpo, 'requiere'), /'([^']+)'/g),
        opcionales: textos(bloque(cuerpo, 'opcionales'), /'([^']+)'/g),
        rutas,
        cargas: [...cargas, ...cargasRanura],
        accesos,
        iconos: textos(bloque(cuerpo, 'iconos', '{', '}'), /'([^']+)'\s*:/g),
        ranuras: aportes,
        enConfig,
        activo: enConfig?.activo ?? false,
      });
    }
  }

  return { carpeta, config, modulos, ranuras };
}

/** Rutas de los módulos activos, para la revisión de enlaces. */
export function rutasActivas(inventario) {
  return inventario.modulos.filter((m) => m.valido && m.activo).flatMap((m) => m.rutas.map((r) => r.path));
}

/**
 * Sección «Módulos» del diagnóstico de código.
 *
 * @param {object} ctx
 * @param {import('./comun.mjs').Informe} ctx.informe
 * @param {string} ctx.SRC
 * @param {Map<string,string>} ctx.codigo  archivo → código sin comentarios
 * @param {{archivoPlantilla: string, plantilla: string}[]} ctx.componentes
 * @param {(p: string) => string} ctx.rel
 */
export function revisarModulos({ informe, SRC, codigo, componentes, rel }) {
  const inv = leerModulos(SRC);
  const { config, modulos, ranuras } = inv;
  let problemas = 0;
  const avisar = (nivel, mensaje, extra) => {
    problemas++;
    informe.agregar(nivel, mensaje, extra);
  };

  if (!existsSync(inv.carpeta)) {
    informe.agregar('info', 'La app no usa módulos todavía (no existe src/app/modulos).');
    return inv;
  }
  if (!config) {
    avisar('error', 'Existe src/app/modulos pero no src/app/modulos.config.ts', {
      solucion: 'Copia modulos.config.ts del paquete de modularización.',
    });
    return inv;
  }

  const validos = modulos.filter((m) => m.valido);
  const porId = new Map(validos.map((m) => [m.id, m]));

  // 1 · Estructura de cada carpeta
  for (const m of modulos) {
    if (!m.valido) {
      avisar('error', `La carpeta modulos/${m.carpeta} no tiene ${m.carpeta}.modulo.ts`, {
        solucion: `Cada módulo necesita su manifiesto. Créalo con: npm run modulo -- nuevo ${m.carpeta}`,
      });
      continue;
    }
    if (m.id !== m.carpeta) {
      avisar('error', `El módulo de la carpeta '${m.carpeta}' declara id '${m.id}'`, {
        archivo: rel(m.archivo),
        solucion: 'El id y el nombre de la carpeta deben ser iguales.',
      });
    }
    if (!m.tieneIndex) {
      avisar('advertencia', `modulos/${m.carpeta} no tiene index.ts (su API pública)`, { archivo: rel(m.dir) });
    }
    if (!m.enConfig) {
      avisar('advertencia', `El módulo '${m.carpeta}' no está en modulos.config.ts: la app no lo carga`, {
        archivo: rel(config.archivo),
        solucion: `Agrega { modulo: ${m.constante ?? 'MODULO_...'}, activo: true } y su import.`,
      });
    }

    // Cargas diferidas de pantallas y piezas de ranura.
    for (const carga of m.cargas) {
      const destino = resolve(m.dir, carga.ruta);
      const archivo = [`${destino}.ts`, destino].find((p) => existsSync(p));
      if (!archivo) {
        avisar('error', `'${m.id}' carga '${carga.ruta}', que no existe`, { archivo: rel(m.archivo), linea: lineaDe(m.texto, carga.indice) });
      } else if (!new RegExp(`export\\s+class\\s+${carga.clase}\\b`).test(readFileSync(archivo, 'utf8'))) {
        avisar('error', `'${m.id}' espera la clase ${carga.clase} en '${carga.ruta}', pero el archivo no la exporta`, {
          archivo: rel(m.archivo),
          linea: lineaDe(m.texto, carga.indice),
        });
      }
    }

    // Íconos de los botones del inicio.
    for (const acceso of m.accesos) {
      if (acceso.icono && !m.iconos.includes(acceso.icono)) {
        avisar('error', `El botón '${acceso.id}' de '${m.id}' usa el ícono '${acceso.icono}', que no está en 'iconos'`, {
          archivo: rel(m.archivo),
          solucion: `Agrega '${acceso.icono}': ${acceso.icono.replace(/-([a-z0-9])/g, (_, l) => l.toUpperCase())} en iconos (y su import de 'ionicons/icons').`,
        });
      }
    }
  }

  for (const e of config.entradas) {
    if (!e.carpeta || !existsSync(join(inv.carpeta, e.carpeta))) {
      avisar('error', `modulos.config.ts usa ${e.constante}, pero no se encontró su carpeta`, { archivo: rel(config.archivo), linea: lineaDe(config.texto, e.indice) });
    }
  }

  // 2 · Dependencias entre módulos
  const activos = validos.filter((m) => m.activo);
  for (const m of activos) {
    for (const dep of m.requiere) {
      const otro = porId.get(dep);
      if (!otro) avisar('error', `'${m.id}' requiere '${dep}', que no existe`, { archivo: rel(m.archivo) });
      else if (!otro.activo) {
        avisar('error', `'${m.id}' requiere '${dep}', que está desactivado`, {
          archivo: rel(config.archivo),
          solucion: `Activa '${dep}' o desactiva '${m.id}' en modulos.config.ts.`,
        });
      }
    }
    for (const dep of m.opcionales) {
      if (!porId.has(dep)) avisar('advertencia', `'${m.id}' declara como opcional a '${dep}', que no existe`, { archivo: rel(m.archivo) });
    }
  }

  // 3 · Rutas, botones y ranuras repetidos entre módulos activos
  const repetidos = (lista, que) => {
    const vistos = new Map();
    for (const [clave, id] of lista) {
      if (vistos.has(clave) && vistos.get(clave) !== id) avisar('error', `${que} '${clave}' está en '${vistos.get(clave)}' y en '${id}'`);
      vistos.set(clave, id);
    }
  };
  repetidos(activos.flatMap((m) => m.rutas.map((r) => [r.path, m.id])), 'La ruta');
  repetidos(activos.flatMap((m) => m.accesos.map((a) => [a.id, m.id])), 'El botón del inicio');

  const nombresRanura = new Set(ranuras.values());
  for (const m of validos) {
    for (const r of m.ranuras) {
      if (!nombresRanura.has(r)) avisar('error', `'${m.id}' aporta a la ranura '${r}', que no está en ranuras.ts`, { archivo: rel(m.archivo) });
    }
  }
  const usadas = new Set();
  for (const c of componentes) {
    for (const m of c.plantilla.matchAll(/<app-ranura[^>]*?\snombre="([^"]+)"/g)) {
      usadas.add(m[1]);
      if (!nombresRanura.has(m[1])) {
        avisar('error', `La pantalla usa la ranura '${m[1]}', que no está en ranuras.ts`, { archivo: rel(c.archivoPlantilla), linea: lineaDe(c.plantilla, m.index) });
      }
    }
  }
  for (const nombre of nombresRanura) {
    if (!usadas.has(nombre)) informe.agregar('info', `La ranura '${nombre}' está declarada pero ninguna pantalla la muestra`);
  }

  // 4 · Fronteras: quién importa qué
  /** Carpeta de módulo que contiene una ruta (o la carpeta misma), o null. */
  const dentroDe = (ruta) => {
    const r = relative(inv.carpeta, ruta).split(sep);
    return r[0] && r[0] !== '..' && !r[0].includes(':') ? r[0] : null;
  };
  const enlacesAvisados = new Set();
  for (const [archivo, texto] of codigo) {
    const propio = dentroDe(archivo);
    for (const m of texto.matchAll(/(?:from|import\()\s*'(\.[^']+)'/g)) {
      const destino = resolve(dirname(archivo), m[1]);
      const ajeno = dentroDe(destino);
      if (!ajeno || ajeno === propio) continue;
      if (archivo === config.archivo) continue; // la configuración importa los manifiestos

      const partes = relative(join(inv.carpeta, ajeno), destino).split(sep).filter(Boolean);
      const porIndice = partes.length === 0 || (partes.length === 1 && partes[0] === 'index');
      const clave = `${rel(archivo)}→${ajeno}`;
      if (enlacesAvisados.has(clave)) continue;

      if (!porIndice) {
        enlacesAvisados.add(clave);
        avisar('advertencia', `${rel(archivo)} importa el interior del módulo '${ajeno}' (${m[1]})`, {
          archivo: rel(archivo),
          linea: lineaDe(texto, m.index),
          solucion: `Importa desde 'modulos/${ajeno}' (su index.ts), o usa una ranura si es una pieza visual.`,
        });
        continue;
      }

      const usuario = propio ? porId.get(propio) : null;
      if (propio && usuario && !usuario.requiere.includes(ajeno) && !usuario.opcionales.includes(ajeno)) {
        enlacesAvisados.add(clave);
        avisar('advertencia', `'${propio}' usa el módulo '${ajeno}' sin declararlo en requiere u opcionales`, { archivo: rel(archivo), linea: lineaDe(texto, m.index) });
      } else if (!propio) {
        enlacesAvisados.add(clave);
        avisar('advertencia', `${rel(archivo)} (fuera de los módulos) importa el módulo '${ajeno}'`, {
          archivo: rel(archivo),
          linea: lineaDe(texto, m.index),
          solucion: 'El código compartido no debe depender de un módulo: si este se desactiva o se borra, se rompe. Usa una ranura o ModulosService.activo().',
        });
      }
    }

    // activo('x') con ids que no existen, o sin declarar.
    for (const m of texto.matchAll(/\.activo\(\s*'([^']+)'\s*\)/g)) {
      const id = m[1];
      if (!porId.has(id)) {
        avisar('advertencia', `activo('${id}'): no existe un módulo con ese id, así que siempre da false`, {
          archivo: rel(archivo),
          linea: lineaDe(texto, m.index),
          solucion: 'Si el módulo se borró a propósito, puedes quitar también el código que preguntaba por él.',
        });
        continue;
      }
      const usuario = propio ? porId.get(propio) : null;
      if (usuario && id !== propio && !usuario.requiere.includes(id) && !usuario.opcionales.includes(id)) {
        avisar('advertencia', `'${propio}' pregunta por '${id}' sin declararlo en opcionales`, { archivo: rel(archivo), linea: lineaDe(texto, m.index) });
      }
    }
  }

  // Resumen
  const inactivos = validos.filter((m) => !m.activo && m.enConfig);
  if (inactivos.length) informe.agregar('info', `Módulos desactivados: ${inactivos.map((m) => m.id).join(', ')}`);
  if (!problemas) {
    informe.ok(`${activos.length} módulos activos de ${validos.length}; dependencias, rutas, ranuras y fronteras en orden`);
  }
  return inv;
}

/**
 * Compara la tabla del sistema de confianza (modulos/confianza/dominio/parametros.ts)
 * con las funciones de firestore.rules. Si difieren, la app calcula valores
 * que las reglas rechazan.
 */
export function revisarParametrosConfianza({ informe, SRC, reglas, rel }) {
  const archivo = join(SRC, 'app', 'modulos', 'confianza', 'dominio', 'parametros.ts');
  if (!existsSync(archivo) || !reglas) return;
  const ts = leer(archivo);

  const funcionDeReglas = (nombre, parametro) => {
    const m = new RegExp(`function\\s+${nombre}\\s*\\(\\s*${parametro}\\s*\\)\\s*\\{\\s*return\\s+([\\s\\S]*?);\\s*\\}`).exec(reglas);
    if (!m) return null;
    const expresion = m[1].replace(/\s+/g, ' ');
    // Solo números, el parámetro y operadores: nada que ejecutar.
    if (!new RegExp(`^(?:[\\d.\\s?:<>=!+\\-*/()]|${parametro})+$`).test(expresion)) return null;
    try {
      return new Function(parametro, `return ${expresion};`);
    } catch {
      return null;
    }
  };

  const numero = (clave) => Number(ts.match(new RegExp(`\\b${clave}:\\s*(-?[\\d_.]+)`))?.[1]?.replaceAll('_', ''));
  const umbrales = [...ts.matchAll(/puntosMinimos:\s*(\d+)/g)].map((m) => Number(m[1]));
  const limites = [...ts.matchAll(/hastaNivel:\s*(\d+),\s*confirmaciones:\s*(\d+)/g)].map((m) => [Number(m[1]), Number(m[2])]);

  const nivelApp = (pc) => umbrales.reduce((n, u, i) => (pc >= u ? i : n), 0);
  const pesoApp = (n) => Math.min(numero('pesoBase') + numero('pesoPorNivel') * n, numero('pesoMaximo'));
  const limiteApp = (n) => (limites.find(([hasta]) => n <= hasta) ?? limites.at(-1))[1];

  const diferencias = [];
  const comparar = (nombre, fnReglas, fnApp, valores) => {
    if (!fnReglas) {
      diferencias.push(`${nombre}: no se pudo leer la función en firestore.rules`);
      return;
    }
    const distinto = valores.find((v) => fnReglas(v) !== fnApp(v));
    if (distinto !== undefined) diferencias.push(`${nombre}(${distinto}): reglas ${fnReglas(distinto)}, app ${fnApp(distinto)}`);
  };

  const niveles = Array.from({ length: 11 }, (_, i) => i);
  comparar('nivelDePuntos', funcionDeReglas('nivelDePuntos', 'pc'), nivelApp, Array.from({ length: 801 }, (_, i) => i));
  comparar('pesoDeNivel', funcionDeReglas('pesoDeNivel', 'nivel'), pesoApp, niveles);
  comparar('limiteDiario', funcionDeReglas('limiteDiario', 'nivel'), limiteApp, niveles);

  const dia = reglas.match(/function\s+numeroDeDia\s*\(\s*\)\s*\{[\s\S]*?toMillis\(\)\s*-\s*(\d+)\)\s*\/\s*(\d+)/);
  if (!dia) diferencias.push('numeroDeDia: no se pudo leer en firestore.rules');
  else if (Number(dia[1]) !== numero('desfaseDiaMs') || Number(dia[2]) !== numero('duracionDiaMs')) {
    diferencias.push(`numeroDeDia: reglas (${dia[1]}, ${dia[2]}), app (${numero('desfaseDiaMs')}, ${numero('duracionDiaMs')})`);
  }

  const literal = (re, clave, nombre) => {
    const m = reglas.match(re);
    if (!m) diferencias.push(`${nombre}: no se encontró en firestore.rules`);
    else if (Number(m[1]) !== numero(clave)) diferencias.push(`${nombre}: reglas ${m[1]}, app ${numero(clave)}`);
  };
  literal(/ultimaAt\.toMillis\(\)\s*>=\s*(\d+)/, 'pausaEntreConfirmacionesMs', 'Pausa entre confirmaciones');
  literal(/createdAt\.toMillis\(\)\s*>=\s*(\d+)/, 'antiguedadMinimaMs', 'Antigüedad mínima de la cuenta');
  literal(/puntos\s*>=\s*(\d+)\s*&&\s*votos\s*>=\s*\d+/, 'puntosParaValidar', 'Puntos para validar');
  literal(/puntos\s*>=\s*\d+\s*&&\s*votos\s*>=\s*(\d+)/, 'votosParaValidar', 'Votos para validar');
  literal(/pcAntes\s*\+\s*(\d+)\s*>/, 'puntosPorReporteReal', 'PC por reporte real');
  literal(/pcAntes\s*\+\s*\d+\s*>\s*(\d+)/, 'puntosMaximos', 'Tope de PC');
  const falso = reglas.match(/pcAntes\s*-\s*(\d+)\s*</);
  if (!falso || -Number(falso[1]) !== numero('puntosPorReporteFalso')) {
    diferencias.push(`PC por reporte falso: reglas −${falso?.[1] ?? '?'}, app ${numero('puntosPorReporteFalso')}`);
  }

  if (diferencias.length) {
    for (const d of diferencias) {
      informe.agregar('error', `Sistema de confianza desalineado con las reglas · ${d}`, {
        archivo: rel(archivo),
        solucion: 'Las reglas mandan: ajusta parametros.ts (o cambia ambos lados a la vez y vuelve a desplegar las reglas).',
      });
    }
  } else {
    informe.ok('Parámetros del sistema de confianza idénticos en la app y en firestore.rules');
  }
}
