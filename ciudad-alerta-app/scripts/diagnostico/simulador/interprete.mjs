/**
 * Intérprete del lenguaje de reglas de Cloud Firestore (rules_version 2).
 *
 * Sirve para probar firestore.rules sin el emulador (que pide Java y descarga
 * un .jar de Google). Implementa lo que usan las reglas de Ciudad Alerta:
 *
 *   - match anidados con comodines {x} y {x=**}, funciones con `let`,
 *     allow get/list/create/update/delete/read/write;
 *   - expresiones: && || ! ?: == != < <= > >= in is + - * / %, listas, mapas,
 *     rutas /databases/$(database)/documents/...;
 *   - request.auth, request.time, request.resource, resource;
 *   - get, exists, getAfter, existsAfter, string, int, float, math.abs/floor/ceil/round;
 *   - métodos de texto (size, matches, lower, upper, trim, split), listas
 *     (size, hasOnly, hasAll, hasAny, toSet, join, concat), mapas (keys,
 *     values, size, get, diff), conjuntos y diff de mapas (affectedKeys…),
 *     marcas de tiempo (toMillis, seconds, nanos).
 *
 * Semántica de errores como la de Firestore: acceder a un campo que no existe
 * es un error; `||` es verdadero si un lado es verdadero aunque el otro falle;
 * `&&` es falso si un lado es falso aunque el otro falle; cualquier otro error
 * deniega. Lo que no se implementa lanza un error explícito («no simulado»), y
 * el caso se informa como no evaluable en vez de adivinar.
 *
 * Diferencias conocidas con Firestore real (por eso los hallazgos se deben
 * confirmar con el emulador): las consultas de listado se evalúan con un
 * documento simbólico armado con sus filtros de igualdad, `size()` de un
 * texto cuenta caracteres Unicode y los números se distinguen como enteros o
 * decimales igual que el SDK de JavaScript (un número con decimales en cero es
 * entero).
 */

// ─── Valores ──────────────────────────────────────────────────────────────────

/** Marca de tiempo (timestamp de las reglas). */
export class Marca {
  constructor(ms) {
    this.ms = ms;
  }
  toMillis() {
    return this.ms;
  }
}

/** Ruta absoluta de un documento: /databases/(default)/documents/... */
export class Ruta {
  constructor(texto) {
    this.texto = texto.replace(/\/+$/, '');
  }
  /** La ruta relativa a /documents (users/ana). */
  get documento() {
    const m = this.texto.match(/^\/databases\/[^/]+\/documents\/(.*)$/);
    return m ? m[1] : this.texto.replace(/^\//, '');
  }
}

class Conjunto {
  constructor(elementos) {
    this.elementos = [];
    for (const e of elementos) if (!this.elementos.some((x) => igual(x, e))) this.elementos.push(e);
  }
}

class DiferenciaDeMapas {
  constructor(nuevo, viejo) {
    this.nuevo = nuevo;
    this.viejo = viejo;
  }
  claves(filtro) {
    const todas = new Set([...Object.keys(this.nuevo), ...Object.keys(this.viejo)]);
    return new Conjunto([...todas].filter((k) => filtro(k in this.nuevo, k in this.viejo, k)));
  }
}

/** Error de evaluación de una regla: la regla no se cumple (deniega). */
export class ErrorDeReglas extends Error {
  constructor(mensaje, posicion) {
    super(mensaje);
    this.name = 'ErrorDeReglas';
    this.posicion = posicion;
  }
}

/** Algo que el simulador no sabe evaluar: el caso no se puede concluir. */
export class NoSimulado extends Error {
  constructor(mensaje) {
    super(`no simulado: ${mensaje}`);
    this.name = 'NoSimulado';
  }
}

const esMapa = (v) => v !== null && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Marca) && !(v instanceof Ruta) && !(v instanceof Conjunto) && !(v instanceof DiferenciaDeMapas);
const esEntero = (v) => typeof v === 'number' && Number.isInteger(v);

export function tipoDe(v) {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'boolean') return 'bool';
  if (typeof v === 'number') return esEntero(v) ? 'int' : 'float';
  if (typeof v === 'string') return 'string';
  if (Array.isArray(v)) return 'list';
  if (v instanceof Marca) return 'timestamp';
  if (v instanceof Ruta) return 'path';
  if (v instanceof Conjunto) return 'set';
  if (v instanceof DiferenciaDeMapas) return 'mapdiff';
  if (esMapa(v)) return 'map';
  return 'desconocido';
}

export function igual(a, b) {
  if (a === undefined) a = null;
  if (b === undefined) b = null;
  if (typeof a === 'number' && typeof b === 'number') return a === b;
  if (a === null || b === null) return a === b;
  if (a instanceof Marca || b instanceof Marca) return a instanceof Marca && b instanceof Marca && a.ms === b.ms;
  if (a instanceof Ruta || b instanceof Ruta) return a instanceof Ruta && b instanceof Ruta && a.texto === b.texto;
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => igual(x, b[i]));
  }
  if (a instanceof Conjunto || b instanceof Conjunto) {
    return a instanceof Conjunto && b instanceof Conjunto && a.elementos.length === b.elementos.length && a.elementos.every((x) => b.elementos.some((y) => igual(x, y)));
  }
  if (esMapa(a) && esMapa(b)) {
    const ka = Object.keys(a);
    const kb = Object.keys(b);
    return ka.length === kb.length && ka.every((k) => k in b && igual(a[k], b[k]));
  }
  return a === b;
}

const contiene = (lista, v) => lista.some((x) => igual(x, v));

// ─── Analizador ───────────────────────────────────────────────────────────────

const PALABRAS = new Set(['true', 'false', 'null', 'in', 'is', 'if', 'let', 'return', 'function', 'match', 'allow', 'service']);

export function analizar(fuente) {
  let i = 0;
  const n = fuente.length;

  const error = (m) => {
    const linea = fuente.slice(0, i).split('\n').length;
    throw new SyntaxError(`firestore.rules:${linea}: ${m}`);
  };

  function espacios() {
    for (;;) {
      while (i < n && /\s/.test(fuente[i])) i++;
      if (fuente.startsWith('//', i)) {
        while (i < n && fuente[i] !== '\n') i++;
        continue;
      }
      if (fuente.startsWith('/*', i)) {
        const fin = fuente.indexOf('*/', i + 2);
        i = fin < 0 ? n : fin + 2;
        continue;
      }
      return;
    }
  }

  const ver = (texto) => {
    espacios();
    return fuente.startsWith(texto, i);
  };
  const tomar = (texto) => {
    if (ver(texto)) {
      i += texto.length;
      return true;
    }
    return false;
  };
  const exigir = (texto) => {
    if (!tomar(texto)) error(`se esperaba «${texto}» y hay «${fuente.slice(i, i + 20)}»`);
  };
  const verPalabra = (p) => {
    espacios();
    return fuente.startsWith(p, i) && !/[A-Za-z0-9_]/.test(fuente[i + p.length] ?? '');
  };
  const tomarPalabra = (p) => {
    if (verPalabra(p)) {
      i += p.length;
      return true;
    }
    return false;
  };
  const identificador = () => {
    espacios();
    const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(fuente.slice(i, i + 200));
    if (!m) error(`se esperaba un nombre y hay «${fuente.slice(i, i + 20)}»`);
    i += m[0].length;
    return m[0];
  };
  const posicion = () => fuente.slice(0, i).split('\n').length;

  // Patrón de un match: /databases/{database}/documents o /users/{userId}
  function patron() {
    espacios();
    const inicio = i;
    while (i < n && !/\s/.test(fuente[i])) i++;
    const texto = fuente.slice(inicio, i);
    return texto
      .split('/')
      .filter(Boolean)
      .map((s) => {
        const m = s.match(/^\{([A-Za-z_][A-Za-z0-9_]*)(=\*\*)?\}$/);
        return m ? { variable: m[1], resto: !!m[2] } : { literal: s };
      });
  }

  function bloque(segmentos) {
    const nodo = { segmentos, funciones: new Map(), permisos: [], hijos: [] };
    exigir('{');
    for (;;) {
      espacios();
      if (tomar('}')) return nodo;
      if (tomarPalabra('function')) {
        const f = funcion();
        nodo.funciones.set(f.nombre, f);
      } else if (tomarPalabra('match')) {
        const p = patron();
        nodo.hijos.push(bloque(p));
      } else if (tomarPalabra('allow')) {
        nodo.permisos.push(permiso());
      } else {
        error(`declaración inesperada «${fuente.slice(i, i + 30)}»`);
      }
    }
  }

  function permiso() {
    const metodos = [];
    do metodos.push(identificador());
    while (tomar(','));
    let condicion = { t: 'lit', v: true };
    const linea = posicion();
    if (tomar(':')) {
      if (!tomarPalabra('if')) error('se esperaba «if»');
      condicion = expresion();
    }
    exigir(';');
    return { metodos, condicion, linea };
  }

  function funcion() {
    const nombre = identificador();
    const linea = posicion();
    exigir('(');
    const parametros = [];
    if (!tomar(')')) {
      do parametros.push(identificador());
      while (tomar(','));
      exigir(')');
    }
    exigir('{');
    const lets = [];
    let resultado = null;
    for (;;) {
      if (tomarPalabra('let')) {
        const nombreLet = identificador();
        exigir('=');
        lets.push([nombreLet, expresion()]);
        tomar(';');
      } else if (tomarPalabra('return')) {
        resultado = expresion();
        tomar(';');
      } else if (tomar('}')) {
        break;
      } else {
        error(`en la función ${nombre}: «${fuente.slice(i, i + 30)}»`);
      }
    }
    return { nombre, parametros, lets, resultado, linea };
  }

  // Expresiones, de menor a mayor precedencia.
  function expresion() {
    const c = oLogico();
    if (tomar('?')) {
      const a = expresion();
      exigir(':');
      const b = expresion();
      return { t: 'tern', c, a, b };
    }
    return c;
  }
  function oLogico() {
    let a = yLogico();
    while (ver('||')) {
      i += 2;
      a = { t: 'o', a, b: yLogico() };
    }
    return a;
  }
  /** Cada término de un && guarda su texto: sirve para explicar por qué se denegó. */
  function termino() {
    espacios();
    const ini = i;
    const x = relacion();
    if (!x.texto) x.texto = fuente.slice(ini, i).replace(/\s+/g, ' ').trim();
    if (!x.linea) x.linea = fuente.slice(0, ini).split('\n').length;
    return x;
  }
  function yLogico() {
    let a = termino();
    while (ver('&&')) {
      i += 2;
      a = { t: 'y', a, b: termino() };
    }
    return a;
  }
  function relacion() {
    let a = suma();
    for (;;) {
      espacios();
      const op = ['==', '!=', '<=', '>=', '<', '>'].find((o) => fuente.startsWith(o, i));
      if (op) {
        i += op.length;
        a = { t: 'bin', op, a, b: suma() };
        continue;
      }
      if (tomarPalabra('in')) {
        a = { t: 'bin', op: 'in', a, b: suma() };
        continue;
      }
      if (tomarPalabra('is')) {
        a = { t: 'is', a, tipo: identificador() };
        continue;
      }
      return a;
    }
  }
  function suma() {
    let a = producto();
    for (;;) {
      espacios();
      if (fuente[i] === '+' || (fuente[i] === '-' && fuente[i + 1] !== '-')) {
        const op = fuente[i++];
        a = { t: 'bin', op, a, b: producto() };
      } else return a;
    }
  }
  function producto() {
    let a = unario();
    for (;;) {
      espacios();
      if ((fuente[i] === '*' || fuente[i] === '/' || fuente[i] === '%') && fuente[i + 1] !== '/' && fuente[i + 1] !== '*') {
        const op = fuente[i++];
        a = { t: 'bin', op, a, b: unario() };
      } else return a;
    }
  }
  function unario() {
    if (tomar('!')) return { t: 'no', x: unario() };
    espacios();
    if (fuente[i] === '-' && !/\d/.test(fuente[i + 1] ?? '')) {
      i++;
      return { t: 'neg', x: unario() };
    }
    return posfijo(primario());
  }
  function posfijo(x) {
    for (;;) {
      if (tomar('.')) {
        const nombre = identificador();
        if (ver('(')) x = { t: 'metodo', obj: x, nombre, args: argumentos() };
        else x = { t: 'campo', obj: x, nombre };
      } else if (ver('[')) {
        i++;
        const idx = expresion();
        exigir(']');
        x = { t: 'indice', obj: x, idx };
      } else return x;
    }
  }
  function argumentos() {
    exigir('(');
    const args = [];
    if (tomar(')')) return args;
    do args.push(expresion());
    while (tomar(','));
    exigir(')');
    return args;
  }
  function primario() {
    espacios();
    const pos = posicion();
    const c = fuente[i];
    if (c === '(') {
      i++;
      const e = expresion();
      exigir(')');
      return e;
    }
    if (c === '[') {
      i++;
      const items = [];
      if (!tomar(']')) {
        do items.push(expresion());
        while (tomar(','));
        exigir(']');
      }
      return { t: 'lista', items };
    }
    if (c === '{') {
      i++;
      const pares = [];
      if (!tomar('}')) {
        do {
          const k = expresion();
          exigir(':');
          pares.push([k, expresion()]);
        } while (tomar(','));
        exigir('}');
      }
      return { t: 'mapa', pares };
    }
    if (c === "'" || c === '"') return { t: 'lit', v: cadena() };
    if (c === '-' || /\d/.test(c)) {
      const m = /^-?\d+(\.\d+)?([eE][+-]?\d+)?/.exec(fuente.slice(i, i + 40));
      i += m[0].length;
      return { t: 'lit', v: Number(m[0]), decimal: !!m[1] };
    }
    if (c === '/') return ruta();
    const nombre = identificador();
    if (nombre === 'true') return { t: 'lit', v: true };
    if (nombre === 'false') return { t: 'lit', v: false };
    if (nombre === 'null') return { t: 'lit', v: null };
    if (ver('(')) return { t: 'llamada', nombre, args: argumentos(), pos };
    return { t: 'id', nombre, pos };
  }
  function cadena() {
    const comilla = fuente[i++];
    let s = '';
    while (i < n && fuente[i] !== comilla) {
      if (fuente[i] === '\\') {
        const sig = fuente[i + 1];
        s += { n: '\n', t: '\t', '\\': '\\', "'": "'", '"': '"' }[sig] ?? '\\' + sig;
        i += 2;
      } else s += fuente[i++];
    }
    i++;
    return s;
  }
  function ruta() {
    const partes = [];
    while (fuente[i] === '/') {
      i++;
      if (fuente.startsWith('$(', i)) {
        i += 2;
        partes.push(expresion());
        exigir(')');
      } else {
        const m = /^[A-Za-z0-9_\-.~]+/.exec(fuente.slice(i, i + 200));
        if (!m) error('ruta mal formada');
        partes.push(m[0]);
        i += m[0].length;
      }
    }
    return { t: 'ruta', partes };
  }

  // Encabezado: rules_version = '2'; service cloud.firestore { match ... { } }
  espacios();
  if (tomarPalabra('rules_version')) {
    exigir('=');
    espacios();
    cadena();
    tomar(';');
  }
  if (!tomarPalabra('service')) error('se esperaba «service»');
  const servicio = identificador() + (tomar('.') ? '.' + identificador() : '');
  const raiz = { segmentos: [], funciones: new Map(), permisos: [], hijos: [] };
  exigir('{');
  for (;;) {
    espacios();
    if (tomar('}')) break;
    if (tomarPalabra('function')) {
      const f = funcion();
      raiz.funciones.set(f.nombre, f);
    } else if (tomarPalabra('match')) {
      raiz.hijos.push(bloque(patron()));
    } else error('se esperaba «match»');
  }
  return { servicio, raiz };
}

// ─── Coincidencia de rutas ────────────────────────────────────────────────────

const METODOS = { read: ['get', 'list'], write: ['create', 'update', 'delete'] };

/**
 * Bloques cuyo patrón completo coincide con la ruta, cada uno con sus
 * variables y la cadena de bloques desde la raíz (para las funciones).
 */
function bloquesQueCoinciden(nodo, segmentos, desde = 0, variables = {}, cadena = []) {
  const salida = [];
  const propia = [...cadena, nodo];
  let j = desde;
  const vars = { ...variables };
  for (let k = 0; k < nodo.segmentos.length; k++) {
    const s = nodo.segmentos[k];
    if (s.resto) {
      vars[s.variable] = segmentos.slice(j).join('/');
      j = segmentos.length;
      break;
    }
    if (j >= segmentos.length) return salida;
    if (s.literal !== undefined) {
      if (s.literal !== segmentos[j]) return salida;
    } else vars[s.variable] = segmentos[j];
    j++;
  }
  if (j === segmentos.length && nodo.segmentos.length) salida.push({ nodo, variables: vars, cadena: propia });
  for (const hijo of nodo.hijos) salida.push(...bloquesQueCoinciden(hijo, segmentos, j, vars, propia));
  return salida;
}

// ─── Evaluación ───────────────────────────────────────────────────────────────

const MAX_ACCESOS_POR_OPERACION = 10;

/**
 * Evalúa una petición.
 *
 * @param {object} reglas  Resultado de analizar().
 * @param {object} p
 *   - ruta: 'users/ana' (relativa a /documents)
 *   - metodo: get | list | create | update | delete
 *   - auth: null | { uid, token }
 *   - tiempo: Marca (request.time)
 *   - recurso: datos actuales del documento o null (en list: documento simbólico)
 *   - nuevo: datos del documento tras la escritura (request.resource.data)
 *   - leer(ruta): datos de un documento antes de la operación (o undefined)
 *   - leerDespues(ruta): datos al final del lote (o undefined)
 *   - accesos: Set compartido para contar lecturas de documentos
 * @returns {{ permitido: boolean, motivo: string, lineas: number[], accesos: number }}
 */
export function evaluar(reglas, p) {
  const segmentos = ['databases', '(default)', 'documents', ...p.ruta.split('/')];
  const coincidencias = bloquesQueCoinciden({ segmentos: [], hijos: reglas.raiz.hijos, funciones: reglas.raiz.funciones, permisos: [] }, segmentos);
  const accesos = p.accesos ?? new Set();
  const nombreDoc = (datos, ruta) => (datos === undefined || datos === null ? null : { data: datos, id: ruta.split('/').at(-1), __name__: new Ruta(`/databases/(default)/documents/${ruta}`) });

  const request = {
    auth: p.auth ? { uid: p.auth.uid, token: { sub: p.auth.uid, ...p.auth.token } } : null,
    time: p.tiempo,
    method: p.metodo,
    path: new Ruta(`/databases/(default)/documents/${p.ruta}`),
    resource: p.metodo === 'delete' || p.metodo === 'get' || p.metodo === 'list' ? null : nombreDoc(p.nuevo, p.ruta),
    query: p.consulta ?? null,
  };
  const resource = nombreDoc(p.recurso, p.ruta);

  let ultimoError = null;
  let ultimoErrorTrivial = false;
  let hubo = false;
  const lineas = [];
  for (const { nodo, variables, cadena } of coincidencias) {
    for (const permiso of nodo.permisos) {
      const metodos = permiso.metodos.flatMap((m) => METODOS[m] ?? [m]);
      if (!metodos.includes(p.metodo)) continue;
      hubo = true;
      const funciones = new Map();
      for (const b of cadena) for (const [k, f] of b.funciones) funciones.set(k, f);
      const contexto = { funciones, base: { ...variables, request, resource }, p, accesos, falsos: [] };
      try {
        const v = valor(permiso.condicion, contexto.base, contexto);
        if (v === true) {
          if (accesos.size > MAX_ACCESOS_POR_OPERACION) {
            ultimoError = `supera el límite de ${MAX_ACCESOS_POR_OPERACION} lecturas de documentos (${accesos.size})`;
            continue;
          }
          return { permitido: true, motivo: `allow ${permiso.metodos.join(', ')} (línea ${permiso.linea})`, lineas: [permiso.linea], accesos: accesos.size };
        }
        const trivial = permiso.condicion.t === 'lit';
        const texto = v !== false ? `la condición no es booleana (línea ${permiso.linea})` : trivial ? `allow ${permiso.metodos.join(', ')}: if false (línea ${permiso.linea})` : explicar(contexto.falsos, permiso.linea);
        if (!ultimoError || (ultimoErrorTrivial && !trivial)) {
          ultimoError = texto;
          ultimoErrorTrivial = trivial;
        }
        lineas.push(permiso.linea);
      } catch (e) {
        // Un error de JavaScript es un fallo del simulador, no una denegación.
        if (!(e instanceof ErrorDeReglas)) throw e instanceof NoSimulado ? e : new NoSimulado(`error interno: ${e.stack ?? e}`);
        if (!ultimoError || ultimoErrorTrivial) {
          ultimoError = `${e.message} (allow de la línea ${permiso.linea})`;
          ultimoErrorTrivial = false;
        }
        lineas.push(permiso.linea);
      }
    }
  }
  return {
    permitido: false,
    motivo: hubo ? (ultimoError ?? 'ninguna condición se cumple') : 'ninguna regla cubre esta ruta y operación',
    lineas,
    accesos: accesos.size,
  };
}

/** «falso: A (línea 10) ← B (línea 40)»: el término más externo y el más interno que dieron falso. */
function explicar(falsos, linea) {
  if (!falsos.length) return `la condición es falsa (allow de la línea ${linea})`;
  const corto = (x) => (x.texto.length > 90 ? x.texto.slice(0, 87) + '…' : x.texto);
  const externo = falsos.at(-1);
  const interno = falsos[0];
  const partes = [`${corto(externo)} (línea ${externo.linea})`];
  if (interno !== externo) partes.push(`${corto(interno)} (línea ${interno.linea})`);
  return `falso: ${partes.join(' ← ')}`;
}

function falla(m) {
  throw new ErrorDeReglas(m);
}

function valor(nodo, entorno, ctx) {
  return evaluarNodo(nodo, entorno, ctx);
}

function evaluarNodo(nodo, entorno, ctx) {
  switch (nodo.t) {
    case 'lit':
      return nodo.v;
    case 'id': {
      if (nodo.nombre in entorno) {
        const v = entorno[nodo.nombre];
        return v instanceof Diferido ? v.resolver() : v;
      }
      if (nodo.nombre === 'math' || nodo.nombre === 'duration' || nodo.nombre === 'timestamp' || nodo.nombre === 'latlng' || nodo.nombre === 'hashing') return { __espacio: nodo.nombre };
      return falla(`variable desconocida «${nodo.nombre}»`);
    }
    case 'lista':
      return nodo.items.map((x) => evaluarNodo(x, entorno, ctx));
    case 'mapa': {
      const m = {};
      for (const [k, v] of nodo.pares) {
        const clave = evaluarNodo(k, entorno, ctx);
        if (typeof clave !== 'string') falla('clave de mapa no es texto');
        m[clave] = evaluarNodo(v, entorno, ctx);
      }
      return m;
    }
    case 'ruta': {
      const partes = nodo.partes.map((parte) => {
        if (typeof parte === 'string') return parte;
        const v = evaluarNodo(parte, entorno, ctx);
        if (typeof v === 'string') return v;
        if (v instanceof Ruta) return v.texto.replace(/^\//, '');
        if (typeof v === 'number') return String(v);
        return falla(`$(…) de una ruta no es texto (${tipoDe(v)})`);
      });
      return new Ruta('/' + partes.join('/'));
    }
    case 'no': {
      const v = evaluarNodo(nodo.x, entorno, ctx);
      if (typeof v !== 'boolean') falla('! sobre algo que no es booleano');
      return !v;
    }
    case 'neg': {
      const v = evaluarNodo(nodo.x, entorno, ctx);
      if (typeof v !== 'number') falla('- sobre algo que no es número');
      return -v;
    }
    case 'o':
    case 'y': {
      const corto = nodo.t === 'o';
      let a;
      let errorA = null;
      try {
        a = evaluarNodo(nodo.a, entorno, ctx);
        if (typeof a !== 'boolean') throw new ErrorDeReglas(`${corto ? '||' : '&&'} con algo que no es booleano`);
      } catch (e) {
        if (!(e instanceof ErrorDeReglas)) throw e;
        errorA = e;
      }
      if (!errorA && a === corto) {
        if (!corto && nodo.a.texto) ctx.falsos?.push(nodo.a);
        return corto;
      }
      const b = evaluarNodo(nodo.b, entorno, ctx);
      if (!corto && b === false && nodo.b.texto) ctx.falsos?.push(nodo.b);
      if (typeof b !== 'boolean') falla(`${corto ? '||' : '&&'} con algo que no es booleano`);
      if (errorA) {
        if (b === corto) return corto;
        throw errorA;
      }
      return b;
    }
    case 'tern': {
      const c = evaluarNodo(nodo.c, entorno, ctx);
      if (typeof c !== 'boolean') falla('?: con una condición que no es booleana');
      return evaluarNodo(c ? nodo.a : nodo.b, entorno, ctx);
    }
    case 'is': {
      const v = evaluarNodo(nodo.a, entorno, ctx);
      const t = tipoDe(v);
      switch (nodo.tipo) {
        case 'number':
          return t === 'int' || t === 'float';
        case 'float':
          return t === 'float';
        case 'bool':
        case 'int':
        case 'string':
        case 'list':
        case 'map':
        case 'timestamp':
        case 'path':
        case 'set':
          return t === nodo.tipo;
        default:
          throw new NoSimulado(`is ${nodo.tipo}`);
      }
    }
    case 'bin':
      return binario(nodo, entorno, ctx);
    case 'campo': {
      const obj = evaluarNodo(nodo.obj, entorno, ctx);
      return campo(obj, nodo.nombre);
    }
    case 'indice': {
      const obj = evaluarNodo(nodo.obj, entorno, ctx);
      const idx = evaluarNodo(nodo.idx, entorno, ctx);
      if (Array.isArray(obj)) {
        if (!esEntero(idx) || idx < 0 || idx >= obj.length) falla('índice fuera de la lista');
        return obj[idx];
      }
      if (typeof idx === 'string') return campo(obj, idx);
      return falla('índice inválido');
    }
    case 'llamada':
      return llamada(nodo, entorno, ctx);
    case 'metodo':
      return metodo(nodo, entorno, ctx);
    default:
      throw new NoSimulado(`nodo ${nodo.t}`);
  }
}

function campo(obj, nombre) {
  if (obj === null || obj === undefined) falla(`«${nombre}» de null`);
  if (obj?.__espacio) throw new NoSimulado(`${obj.__espacio}.${nombre}`);
  if (obj?.__simbolico) {
    if (nombre in obj.valores) return obj.valores[nombre];
    falla(`la consulta no filtra por «${nombre}»: Firestore no puede asegurar la regla`);
  }
  if (esMapa(obj)) {
    if (!Object.prototype.hasOwnProperty.call(obj, nombre)) falla(`el campo «${nombre}» no existe`);
    return obj[nombre];
  }
  return falla(`«${nombre}» de un ${tipoDe(obj)}`);
}

function numeros(a, b, op) {
  if (typeof a !== 'number' || typeof b !== 'number') falla(`${op} entre ${tipoDe(a)} y ${tipoDe(b)}`);
}

function binario(nodo, entorno, ctx) {
  const a = evaluarNodo(nodo.a, entorno, ctx);
  const b = evaluarNodo(nodo.b, entorno, ctx);
  switch (nodo.op) {
    case '==':
      return igual(a, b);
    case '!=':
      return !igual(a, b);
    case '<':
    case '<=':
    case '>':
    case '>=': {
      let x = a;
      let y = b;
      if (a instanceof Marca && b instanceof Marca) {
        x = a.ms;
        y = b.ms;
      } else if (typeof a === 'string' && typeof b === 'string') {
        // orden lexicográfico
      } else numeros(a, b, nodo.op);
      return nodo.op === '<' ? x < y : nodo.op === '<=' ? x <= y : nodo.op === '>' ? x > y : x >= y;
    }
    case 'in':
      if (Array.isArray(b)) return contiene(b, a);
      if (b instanceof Conjunto) return contiene(b.elementos, a);
      if (b?.__simbolico) {
        if (typeof a !== 'string') falla('in sobre un mapa con una clave que no es texto');
        return a in b.valores ? true : falla(`la consulta no filtra por «${a}»`);
      }
      if (esMapa(b)) {
        if (typeof a !== 'string') falla('in sobre un mapa con una clave que no es texto');
        return Object.prototype.hasOwnProperty.call(b, a);
      }
      return falla(`in sobre un ${tipoDe(b)}`);
    case '+':
      if (typeof a === 'string' && typeof b === 'string') return a + b;
      if (Array.isArray(a) && Array.isArray(b)) return [...a, ...b];
      numeros(a, b, '+');
      return a + b;
    case '-':
      if (a instanceof Marca && b instanceof Marca) throw new NoSimulado('resta de marcas de tiempo (duration)');
      numeros(a, b, '-');
      return a - b;
    case '*':
      numeros(a, b, '*');
      return a * b;
    case '/':
      numeros(a, b, '/');
      if (b === 0) falla('división por cero');
      return esEntero(a) && esEntero(b) ? Math.trunc(a / b) : a / b;
    case '%':
      numeros(a, b, '%');
      if (b === 0) falla('módulo por cero');
      return a % b;
    default:
      throw new NoSimulado(`operador ${nodo.op}`);
  }
}

function documento(ctx, ruta, despues) {
  if (!(ruta instanceof Ruta)) falla('get/exists de algo que no es ruta');
  const rel = ruta.documento;
  ctx.accesos.add(rel);
  const datos = despues ? ctx.p.leerDespues(rel) : ctx.p.leer(rel);
  return datos;
}

function llamada(nodo, entorno, ctx) {
  const args = () => nodo.args.map((a) => evaluarNodo(a, entorno, ctx));
  switch (nodo.nombre) {
    case 'get':
    case 'getAfter': {
      const [ruta] = args();
      const datos = documento(ctx, ruta, nodo.nombre === 'getAfter');
      if (datos === undefined || datos === null) falla(`${nodo.nombre}() de un documento que no existe (${ruta.documento})`);
      return { data: datos, id: ruta.documento.split('/').at(-1), __name__: ruta };
    }
    case 'exists':
    case 'existsAfter': {
      const [ruta] = args();
      const datos = documento(ctx, ruta, nodo.nombre === 'existsAfter');
      return datos !== undefined && datos !== null;
    }
    case 'string': {
      const [v] = args();
      if (typeof v === 'string') return v;
      if (typeof v === 'number') return esEntero(v) ? String(v) : String(v);
      if (typeof v === 'boolean' || v === null) return String(v);
      return falla(`string() de un ${tipoDe(v)}`);
    }
    case 'int': {
      const [v] = args();
      if (typeof v === 'number') return Math.trunc(v);
      if (typeof v === 'string' && /^-?\d+$/.test(v)) return Number(v);
      return falla(`int() de ${tipoDe(v)}`);
    }
    case 'float': {
      const [v] = args();
      if (typeof v === 'number') return v;
      if (typeof v === 'string' && !Number.isNaN(Number(v))) return Number(v);
      return falla(`float() de ${tipoDe(v)}`);
    }
    case 'debug':
      return args()[0];
    default: {
      const f = ctx.funciones.get(nodo.nombre);
      if (!f) throw new NoSimulado(`función ${nodo.nombre}()`);
      const valores = args();
      if (valores.length !== f.parametros.length) falla(`${nodo.nombre}() con ${valores.length} argumentos`);
      const propio = { ...ctx.base };
      f.parametros.forEach((p, k) => (propio[p] = valores[k]));
      ctx.profundidad = (ctx.profundidad ?? 0) + 1;
      if (ctx.profundidad > 20) falla('demasiadas llamadas anidadas');
      try {
        for (const [nombre, expr] of f.lets) propio[nombre] = evaluarPerezoso(expr, propio, ctx);
        return evaluarNodo(f.resultado, propio, ctx);
      } finally {
        ctx.profundidad--;
      }
    }
  }
}

/**
 * Un `let` de las reglas no falla al declararse si nunca se usa: Firestore lo
 * evalúa al usarlo. Se guarda un valor diferido que se resuelve al leerlo.
 */
class Diferido {
  constructor(expr, entorno, ctx) {
    this.expr = expr;
    this.entorno = entorno;
    this.ctx = ctx;
    this.listo = false;
  }
  resolver() {
    if (!this.listo) {
      this.listo = true;
      try {
        this.valor = evaluarNodo(this.expr, this.entorno, this.ctx);
      } catch (e) {
        this.error = e;
      }
    }
    if (this.error) throw this.error;
    return this.valor;
  }
}

function evaluarPerezoso(expr, entorno, ctx) {
  return new Diferido(expr, entorno, ctx);
}

function metodo(nodo, entorno, ctx) {
  const objNodo = nodo.obj;
  // math.abs(x), duration.value(…), timestamp.value(…)
  if (objNodo.t === 'id' && ['math', 'duration', 'timestamp', 'latlng', 'hashing'].includes(objNodo.nombre) && !(objNodo.nombre in entorno)) {
    const args = nodo.args.map((a) => evaluarNodo(a, entorno, ctx));
    if (objNodo.nombre === 'math') {
      const [x] = args;
      if (typeof x !== 'number') falla(`math.${nodo.nombre} de un ${tipoDe(x)}`);
      if (nodo.nombre === 'abs') return Math.abs(x);
      if (nodo.nombre === 'floor') return Math.floor(x);
      if (nodo.nombre === 'ceil') return Math.ceil(x);
      if (nodo.nombre === 'round') return Math.round(x);
      if (nodo.nombre === 'sqrt') return Math.sqrt(x);
    }
    throw new NoSimulado(`${objNodo.nombre}.${nodo.nombre}()`);
  }
  const obj = evaluarNodo(objNodo, entorno, ctx);
  const args = nodo.args.map((a) => evaluarNodo(a, entorno, ctx));
  const t = tipoDe(obj);
  const n = nodo.nombre;

  const comoLista = (v) => (Array.isArray(v) ? v : v instanceof Conjunto ? v.elementos : falla(`${n}() espera una lista`));

  if (obj?.__simbolico) {
    if (n === 'get') {
      const [clave, defecto] = args;
      return clave in obj.valores ? obj.valores[clave] : falla(`la consulta no filtra por «${clave}» (get con valor por defecto)`);
    }
    falla(`${n}() sobre un documento de consulta`);
  }

  switch (t) {
    case 'string':
      if (n === 'size') return [...obj].length;
      if (n === 'matches') {
        const [re] = args;
        if (typeof re !== 'string') falla('matches() espera texto');
        return new RegExp(`^(?:${re})$`, 'su').test(obj);
      }
      if (n === 'lower') return obj.toLowerCase();
      if (n === 'upper') return obj.toUpperCase();
      if (n === 'trim') return obj.trim();
      if (n === 'split') return obj.split(new RegExp(args[0], 'u'));
      if (n === 'replace') return obj.replace(new RegExp(args[0], 'gu'), args[1]);
      break;
    case 'list':
    case 'set': {
      const lista = comoLista(obj);
      if (n === 'size') return lista.length;
      if (n === 'hasOnly') return lista.every((x) => contiene(comoLista(args[0]), x));
      if (n === 'hasAll') return comoLista(args[0]).every((x) => contiene(lista, x));
      if (n === 'hasAny') return comoLista(args[0]).some((x) => contiene(lista, x));
      if (n === 'toSet') return new Conjunto(lista);
      if (n === 'join') return lista.join(args[0] ?? '');
      if (n === 'concat') return [...lista, ...comoLista(args[0])];
      if (n === 'difference') return new Conjunto(lista.filter((x) => !contiene(comoLista(args[0]), x)));
      if (n === 'union') return new Conjunto([...lista, ...comoLista(args[0])]);
      if (n === 'intersection') return new Conjunto(lista.filter((x) => contiene(comoLista(args[0]), x)));
      if (n === 'removeAll') return lista.filter((x) => !contiene(comoLista(args[0]), x));
      break;
    }
    case 'map':
      if (n === 'keys') return Object.keys(obj);
      if (n === 'values') return Object.values(obj);
      if (n === 'size') return Object.keys(obj).length;
      if (n === 'get') {
        const [clave, defecto] = args;
        if (Array.isArray(clave)) {
          let actual = obj;
          for (const k of clave) {
            if (!esMapa(actual) || !(k in actual)) return defecto;
            actual = actual[k];
          }
          return actual;
        }
        if (typeof clave !== 'string') falla('get() con una clave que no es texto');
        return Object.prototype.hasOwnProperty.call(obj, clave) ? obj[clave] : defecto;
      }
      if (n === 'diff') {
        const [otro] = args;
        if (!esMapa(otro)) falla('diff() con algo que no es mapa');
        return new DiferenciaDeMapas(obj, otro);
      }
      break;
    case 'mapdiff':
      if (n === 'affectedKeys') return obj.claves((enNuevo, enViejo, k) => !enNuevo || !enViejo || !igual(obj.nuevo[k], obj.viejo[k]));
      if (n === 'addedKeys') return obj.claves((enNuevo, enViejo) => enNuevo && !enViejo);
      if (n === 'removedKeys') return obj.claves((enNuevo, enViejo) => !enNuevo && enViejo);
      if (n === 'changedKeys') return obj.claves((enNuevo, enViejo, k) => enNuevo && enViejo && !igual(obj.nuevo[k], obj.viejo[k]));
      if (n === 'unchangedKeys') return obj.claves((enNuevo, enViejo, k) => enNuevo && enViejo && igual(obj.nuevo[k], obj.viejo[k]));
      break;
    case 'timestamp':
      if (n === 'toMillis') return obj.ms;
      if (n === 'seconds') return Math.floor(obj.ms / 1000);
      if (n === 'nanos') return (obj.ms % 1000) * 1e6;
      break;
    case 'null':
      falla(`${n}() de null`);
      break;
    default:
      break;
  }
  if (['size', 'matches', 'hasOnly', 'hasAll', 'hasAny', 'keys', 'get', 'diff', 'toMillis'].includes(n)) falla(`${n}() de un ${t}`);
  throw new NoSimulado(`método ${t}.${n}()`);
}

/**
 * Lo que hay que exportar para depurar: las reglas sin evaluar, por ejemplo
 * para el análisis estático del script de ataques.
 */
export function recorrer(reglas, visita) {
  const paso = (nodo, ruta) => {
    const propia = [...ruta, ...nodo.segmentos.map((s) => (s.literal ?? `{${s.variable}${s.resto ? '=**' : ''}}`))];
    visita(nodo, '/' + propia.join('/'));
    for (const h of nodo.hijos) paso(h, propia);
  };
  for (const h of reglas.raiz.hijos) paso(h, []);
}

export function simbolico(valores) {
  return { __simbolico: true, valores };
}
