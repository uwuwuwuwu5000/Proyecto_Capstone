/**
 * Imitación de `firebase/firestore` sobre el intérprete de reglas.
 *
 * Cubre lo que usan los scripts de reglas: doc, collection, query, where,
 * orderBy, limit, getDoc, getDocs, setDoc (con y sin merge), updateDoc (con
 * rutas «a.b»), deleteDoc, writeBatch, runTransaction, serverTimestamp,
 * deleteField, increment, arrayUnion, arrayRemove y Timestamp.
 *
 * Cada escritura (o lote) se evalúa como en Firestore: todas las escrituras
 * del lote contra el estado previo, `getAfter()` contra el estado final, la
 * misma hora para todo el lote y los límites de lecturas de documentos (10 por
 * operación, 20 por lote). Si una escritura se rechaza, no se aplica ninguna.
 */
import { Marca, NoSimulado, analizar, evaluar, simbolico } from './interprete.mjs';

// ─── Tipos del SDK ────────────────────────────────────────────────────────────

export class Timestamp {
  constructor(seconds, nanoseconds = 0) {
    this.seconds = seconds;
    this.nanoseconds = nanoseconds;
  }
  static now() {
    return Timestamp.fromMillis(Date.now());
  }
  static fromMillis(ms) {
    return new Timestamp(Math.floor(ms / 1000), (ms % 1000) * 1e6);
  }
  static fromDate(fecha) {
    return Timestamp.fromMillis(fecha.getTime());
  }
  toMillis() {
    return this.seconds * 1000 + Math.floor(this.nanoseconds / 1e6);
  }
  toDate() {
    return new Date(this.toMillis());
  }
  isEqual(otro) {
    return otro instanceof Timestamp && otro.toMillis() === this.toMillis();
  }
  valueOf() {
    return String(this.toMillis()).padStart(20, '0');
  }
}

class Centinela {
  constructor(tipo, valor) {
    this.tipo = tipo;
    this.valor = valor;
  }
}

export const serverTimestamp = () => new Centinela('serverTimestamp');
export const deleteField = () => new Centinela('deleteField');
export const increment = (n) => new Centinela('increment', n);
export const arrayUnion = (...v) => new Centinela('arrayUnion', v);
export const arrayRemove = (...v) => new Centinela('arrayRemove', v);
export function setLogLevel() {}

export class FirestoreError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
    this.name = 'FirebaseError';
  }
}

export class DocumentReference {
  constructor(firestore, path) {
    this.firestore = firestore;
    this.path = path;
    this.id = path.split('/').at(-1);
    this.type = 'document';
  }
  get parent() {
    return new CollectionReference(this.firestore, this.path.split('/').slice(0, -1).join('/'));
  }
}

export class CollectionReference {
  constructor(firestore, path) {
    this.firestore = firestore;
    this.path = path;
    this.id = path.split('/').at(-1);
    this.type = 'collection';
  }
}

class Query {
  constructor(coleccion, restricciones) {
    this.firestore = coleccion.firestore;
    this.coleccion = coleccion;
    this.restricciones = restricciones;
    this.type = 'query';
  }
}

const limpiarRuta = (partes) =>
  partes
    .join('/')
    .split('/')
    .filter(Boolean)
    .join('/');

let contadorIds = 0;
const idNuevo = () => `sim${String(++contadorIds).padStart(17, '0')}`;

export function doc(base, ...partes) {
  if (base instanceof CollectionReference) {
    return new DocumentReference(base.firestore, limpiarRuta([base.path, ...(partes.length ? partes : [idNuevo()])]));
  }
  if (base instanceof DocumentReference) return new DocumentReference(base.firestore, limpiarRuta([base.path, ...partes]));
  const ruta = limpiarRuta(partes);
  if (ruta.split('/').length % 2 !== 0) throw new FirestoreError('invalid-argument', `Ruta de documento inválida: ${ruta}`);
  return new DocumentReference(base, ruta);
}

export function collection(base, ...partes) {
  const db = base instanceof DocumentReference || base instanceof CollectionReference ? base.firestore : base;
  const prefijo = base instanceof DocumentReference || base instanceof CollectionReference ? [base.path] : [];
  const ruta = limpiarRuta([...prefijo, ...partes]);
  if (ruta.split('/').length % 2 !== 1) throw new FirestoreError('invalid-argument', `Ruta de colección inválida: ${ruta}`);
  return new CollectionReference(db, ruta);
}

export function collectionGroup() {
  throw new NoSimulado('collectionGroup()');
}

export const where = (campo, op, valor) => ({ tipo: 'where', campo, op, valor });
export const orderBy = (campo, dir = 'asc') => ({ tipo: 'orderBy', campo, dir });
export const limit = (n) => ({ tipo: 'limit', n });
export const startAfter = (...v) => ({ tipo: 'startAfter', v });
export const documentId = () => '__name__';

export function query(base, ...restricciones) {
  if (base instanceof Query) return new Query(base.coleccion, [...base.restricciones, ...restricciones]);
  return new Query(base, restricciones);
}

// ─── Conversión de valores ───────────────────────────────────────────────────

const esObjetoPlano = (v) => v !== null && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype;

/** Del cliente al almacén (Timestamp → Marca, centinelas resueltos). */
function aAlmacen(v, hora, previo) {
  if (v instanceof Centinela) {
    if (v.tipo === 'serverTimestamp') return hora;
    if (v.tipo === 'increment') return (typeof previo === 'number' ? previo : 0) + v.valor;
    if (v.tipo === 'arrayUnion') {
      const base = Array.isArray(previo) ? [...previo] : [];
      for (const x of v.valor) if (!base.some((y) => JSON.stringify(y) === JSON.stringify(x))) base.push(aAlmacen(x, hora));
      return base;
    }
    if (v.tipo === 'arrayRemove') {
      const base = Array.isArray(previo) ? previo : [];
      return base.filter((y) => !v.valor.some((x) => JSON.stringify(aAlmacen(x, hora)) === JSON.stringify(y)));
    }
    throw new FirestoreError('invalid-argument', `${v.tipo}() no se puede usar aquí`);
  }
  if (v instanceof Timestamp) return new Marca(v.toMillis());
  if (v instanceof Date) return new Marca(v.getTime());
  if (v instanceof Marca) return v;
  if (v instanceof DocumentReference) throw new NoSimulado('referencias a documentos como valor');
  if (v === undefined) throw new FirestoreError('invalid-argument', 'Function setDoc() called with invalid data. Unsupported field value: undefined');
  if (Array.isArray(v)) return v.map((x) => aAlmacen(x, hora));
  if (esObjetoPlano(v)) {
    const m = {};
    for (const [k, x] of Object.entries(v)) {
      if (x instanceof Centinela && x.tipo === 'deleteField') continue;
      m[k] = aAlmacen(x, hora, previo && typeof previo === 'object' ? previo[k] : undefined);
    }
    return m;
  }
  if (typeof v === 'number' && !Number.isFinite(v)) return v;
  return v;
}

/** Del almacén al cliente. */
function aCliente(v) {
  if (v instanceof Marca) return Timestamp.fromMillis(v.ms);
  if (Array.isArray(v)) return v.map(aCliente);
  if (v !== null && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, aCliente(x)]));
  return v;
}

function clonar(v) {
  if (v instanceof Marca) return new Marca(v.ms);
  if (Array.isArray(v)) return v.map(clonar);
  if (v !== null && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, clonar(x)]));
  return v;
}

/** Aplica un updateDoc con rutas «a.b» sobre una copia del documento. */
function aplicarActualizacion(actual, cambios, hora) {
  const nuevo = clonar(actual);
  for (const [ruta, valor] of Object.entries(cambios)) {
    const partes = ruta.split('.');
    let nodo = nuevo;
    for (const p of partes.slice(0, -1)) {
      if (nodo[p] === null || typeof nodo[p] !== 'object' || Array.isArray(nodo[p]) || nodo[p] instanceof Marca) nodo[p] = {};
      nodo = nodo[p];
    }
    const ultima = partes.at(-1);
    if (valor instanceof Centinela && valor.tipo === 'deleteField') delete nodo[ultima];
    else nodo[ultima] = aAlmacen(valor, hora, nodo[ultima]);
  }
  return nuevo;
}

function fusionar(actual, datos, hora) {
  const nuevo = clonar(actual ?? {});
  for (const [k, v] of Object.entries(datos)) {
    if (v instanceof Centinela && v.tipo === 'deleteField') delete nuevo[k];
    else if (esObjetoPlano(v) && nuevo[k] && typeof nuevo[k] === 'object' && !Array.isArray(nuevo[k]) && !(nuevo[k] instanceof Marca)) nuevo[k] = fusionar(nuevo[k], v, hora);
    else nuevo[k] = aAlmacen(v, hora, nuevo[k]);
  }
  return nuevo;
}

// ─── Instantáneas ─────────────────────────────────────────────────────────────

class DocumentSnapshot {
  constructor(ref, datos) {
    this.ref = ref;
    this.id = ref.id;
    this._datos = datos;
  }
  exists() {
    return this._datos !== undefined;
  }
  data() {
    return this._datos === undefined ? undefined : aCliente(this._datos);
  }
  get(campo) {
    return this.data()?.[campo];
  }
}

class QuerySnapshot {
  constructor(docs) {
    this.docs = docs;
    this.size = docs.length;
    this.empty = docs.length === 0;
  }
  forEach(fn) {
    this.docs.forEach(fn);
  }
}

// ─── El almacén con reglas ────────────────────────────────────────────────────

export class Simulador {
  constructor(textoReglas) {
    this.reglas = analizar(textoReglas);
    this.docs = new Map();
    /** Cada decisión, para el informe: { operacion, ruta, permitido, motivo }. */
    this.registro = [];
  }

  instancia(auth, sinReglas = false) {
    return { __simulador: this, auth, sinReglas, type: 'firestore' };
  }

  limpiar() {
    this.docs.clear();
  }

  decidir(db, peticion) {
    if (db.sinReglas) return { permitido: true, motivo: 'sin reglas' };
    const r = evaluar(this.reglas, { ...peticion, auth: db.auth });
    this.registro.push({ ...r, ruta: peticion.ruta, metodo: peticion.metodo, uid: db.auth?.uid ?? null });
    if (process.env.SIMULADOR_DETALLE) {
      process.stderr.write(`    · ${r.permitido ? 'permite' : 'deniega'} ${peticion.metodo} ${peticion.ruta} (${db.auth?.uid ?? 'anónimo'}): ${r.motivo}\n`);
    }
    return r;
  }
}

const sim = (db) => {
  const s = db?.__simulador;
  if (!s) throw new FirestoreError('invalid-argument', 'La instancia no viene del simulador');
  return s;
};

const denegado = (mensaje) => new FirestoreError('permission-denied', `PERMISSION_DENIED: ${mensaje}`);

export async function getDoc(ref) {
  const s = sim(ref.firestore);
  const datos = s.docs.get(ref.path);
  const accesos = new Set();
  const r = s.decidir(ref.firestore, {
    ruta: ref.path,
    metodo: 'get',
    tiempo: new Marca(Date.now()),
    recurso: datos ?? null,
    leer: (p) => s.docs.get(p),
    leerDespues: (p) => s.docs.get(p),
    accesos,
  });
  if (!r.permitido) throw denegado(`get ${ref.path}: ${r.motivo}`);
  return new DocumentSnapshot(ref, datos === undefined ? undefined : clonar(datos));
}

function cumple(datos, w) {
  const valor = w.campo.split('.').reduce((o, k) => (o && typeof o === 'object' ? o[k] : undefined), datos);
  const v = aAlmacen(w.valor, null);
  const cmp = (a, b) => (a instanceof Marca ? a.ms : a) - (b instanceof Marca ? b.ms : b);
  switch (w.op) {
    case '==':
      return JSON.stringify(valor) === JSON.stringify(v);
    case '!=':
      return valor !== undefined && JSON.stringify(valor) !== JSON.stringify(v);
    case 'in':
      return v.some((x) => JSON.stringify(x) === JSON.stringify(valor));
    case 'not-in':
      return valor !== undefined && !v.some((x) => JSON.stringify(x) === JSON.stringify(valor));
    case 'array-contains':
      return Array.isArray(valor) && valor.some((x) => JSON.stringify(x) === JSON.stringify(v));
    case 'array-contains-any':
      return Array.isArray(valor) && valor.some((x) => v.some((y) => JSON.stringify(x) === JSON.stringify(y)));
    case '<':
      return valor !== undefined && cmp(valor, v) < 0;
    case '<=':
      return valor !== undefined && cmp(valor, v) <= 0;
    case '>':
      return valor !== undefined && cmp(valor, v) > 0;
    case '>=':
      return valor !== undefined && cmp(valor, v) >= 0;
    default:
      throw new NoSimulado(`where con ${w.op}`);
  }
}

export async function getDocs(q) {
  const coleccion = q instanceof Query ? q.coleccion : q;
  const restricciones = q instanceof Query ? q.restricciones : [];
  const s = sim(coleccion.firestore);
  const filtros = restricciones.filter((r) => r.tipo === 'where');
  // Documento simbólico: lo único que Firestore sabe de cada resultado son sus filtros de igualdad.
  const conocidos = Object.fromEntries(filtros.filter((w) => w.op === '==').map((w) => [w.campo, aAlmacen(w.valor, null)]));
  const r = s.decidir(coleccion.firestore, {
    ruta: `${coleccion.path}/__consulta__`,
    metodo: 'list',
    tiempo: new Marca(Date.now()),
    recurso: simbolico(conocidos),
    consulta: { limit: restricciones.find((x) => x.tipo === 'limit')?.n ?? null },
    leer: (p) => s.docs.get(p),
    leerDespues: (p) => s.docs.get(p),
    accesos: new Set(),
  });
  if (!r.permitido) throw denegado(`list ${coleccion.path}: ${r.motivo}`);
  const profundidad = coleccion.path.split('/').length + 1;
  let docs = [...s.docs.entries()]
    .filter(([ruta]) => ruta.startsWith(coleccion.path + '/') && ruta.split('/').length === profundidad)
    .filter(([, datos]) => filtros.every((w) => cumple(datos, w)))
    .map(([ruta, datos]) => new DocumentSnapshot(new DocumentReference(coleccion.firestore, ruta), clonar(datos)));
  const lim = restricciones.find((x) => x.tipo === 'limit');
  if (lim) docs = docs.slice(0, lim.n);
  return new QuerySnapshot(docs);
}

/**
 * Aplica un lote de escrituras: [{ tipo: set|update|delete, ref, datos, merge }].
 * Todas se evalúan contra el estado previo; getAfter ve el estado final.
 */
async function confirmar(db, escrituras) {
  const s = sim(db);
  const hora = new Marca(Date.now());
  const antes = s.docs;
  const despues = new Map([...antes.entries()].map(([k, v]) => [k, clonar(v)]));
  const nuevos = [];

  for (const e of escrituras) {
    const actual = despues.get(e.ref.path);
    let nuevo;
    if (e.tipo === 'set') nuevo = e.merge ? fusionar(actual, e.datos, hora) : aAlmacen(e.datos, hora);
    else if (e.tipo === 'update') {
      if (actual === undefined) throw new FirestoreError('not-found', `No document to update: ${e.ref.path}`);
      nuevo = aplicarActualizacion(actual, e.datos, hora);
    } else nuevo = undefined;
    if (nuevo === undefined) despues.delete(e.ref.path);
    else despues.set(e.ref.path, nuevo);
    nuevos.push(nuevo);
  }

  if (!db.sinReglas) {
    const todos = new Set();
    escrituras.forEach((e, k) => {
      const previo = antes.get(e.ref.path);
      const metodo = e.tipo === 'delete' ? 'delete' : previo === undefined ? 'create' : 'update';
      const accesos = new Set();
      const r = s.decidir(db, {
        ruta: e.ref.path,
        metodo,
        tiempo: hora,
        recurso: previo ?? null,
        nuevo: nuevos[k],
        leer: (p) => antes.get(p),
        leerDespues: (p) => despues.get(p),
        accesos,
      });
      accesos.forEach((a) => todos.add(a));
      if (!r.permitido) throw denegado(`${metodo} ${e.ref.path}: ${r.motivo}`);
    });
    if (escrituras.length > 1 && todos.size > 20) throw denegado(`el lote lee ${todos.size} documentos distintos (máximo 20)`);
  }
  s.docs = despues;
}

export async function setDoc(ref, datos, opciones = {}) {
  await confirmar(ref.firestore, [{ tipo: 'set', ref, datos, merge: !!opciones.merge }]);
}

function cambiosDe(args) {
  if (args.length === 1) return args[0];
  const cambios = {};
  for (let k = 0; k < args.length; k += 2) cambios[args[k]] = args[k + 1];
  return cambios;
}

export async function updateDoc(ref, ...args) {
  await confirmar(ref.firestore, [{ tipo: 'update', ref, datos: cambiosDe(args) }]);
}

export async function deleteDoc(ref) {
  await confirmar(ref.firestore, [{ tipo: 'delete', ref }]);
}

export async function addDoc(coleccion, datos) {
  const ref = doc(coleccion);
  await setDoc(ref, datos);
  return ref;
}

export function writeBatch(db) {
  const escrituras = [];
  const lote = {
    set(ref, datos, opciones = {}) {
      escrituras.push({ tipo: 'set', ref, datos, merge: !!opciones.merge });
      return lote;
    },
    update(ref, ...args) {
      escrituras.push({ tipo: 'update', ref, datos: cambiosDe(args) });
      return lote;
    },
    delete(ref) {
      escrituras.push({ tipo: 'delete', ref });
      return lote;
    },
    commit: () => confirmar(db, escrituras),
  };
  return lote;
}

export async function runTransaction(db, fn) {
  const escrituras = [];
  const tx = {
    get: (ref) => getDoc(ref),
    set(ref, datos, opciones = {}) {
      escrituras.push({ tipo: 'set', ref, datos, merge: !!opciones.merge });
      return tx;
    },
    update(ref, ...args) {
      escrituras.push({ tipo: 'update', ref, datos: cambiosDe(args) });
      return tx;
    },
    delete(ref) {
      escrituras.push({ tipo: 'delete', ref });
      return tx;
    },
  };
  const resultado = await fn(tx);
  await confirmar(db, escrituras);
  return resultado;
}

export function getFirestore() {
  throw new NoSimulado('getFirestore(): usa el entorno de pruebas');
}
export const __esSimulador = true;
