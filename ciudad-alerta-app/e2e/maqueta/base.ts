/**
 * Base de datos en memoria de la maqueta de pruebas de punta a punta.
 *
 * Reemplaza a Firebase: guarda cuentas, reportes, historial, confirmaciones
 * y conversaciones de soporte en el navegador (localStorage, clave `e2e.base`,
 * que «Borrar datos guardados» de la app no toca). Así una prueba puede
 * recargar la página, cerrar sesión o cortar la red y encontrar lo mismo.
 *
 * Las fechas se guardan en milisegundos; los servicios simulados las
 * convierten a Timestamp antes de entregarlas a la app.
 */

export type Rol = 'ciudadano' | 'operador' | 'admin';

export interface Cuenta {
  uid: string;
  email: string;
  password: string;
  displayName: string;
  role: Rol;
  operadorId?: string;
  emailVerified: boolean;
  creadaMs: number;
  terminosVersion?: string;
  eliminada?: boolean;
}

export interface ReportePlano {
  id: string;
  uid: string;
  descripcion: string;
  categoria: string;
  ubicacion: { lat: number; lng: number; accuracy: number };
  comuna: string | null;
  region: string | null;
  autorNombre: string;
  foto: { dataUrl: string } | null;
  estado: string;
  organismo: { id: string; nombre: string; tipo: string; comuna?: string | null };
  operadorId: string | null;
  creadoMs: number;
  actualizadoMs: number;
  editadoMs?: number;
  retiradoPorAutor?: boolean;
  validacion?: Record<string, unknown>;
}

export interface CambioPlano {
  id: string;
  desde: string;
  hacia: string;
  autorUid: string;
  autorNombre: string;
  autorRol?: Rol;
  comentario: string;
  creadoMs: number;
}

export interface TicketPlano {
  id: string;
  uid: string;
  autorNombre: string;
  autorEmail: string;
  tipo: 'queja' | 'sugerencia';
  asunto: string;
  estado: 'abierto' | 'en_atencion' | 'cerrado';
  creadoMs: number;
  ultimoMs: number;
  adelanto: string;
}

export interface MensajePlano {
  id: string;
  ticketId: string;
  autorUid: string;
  autorNombre: string;
  autorRol: 'ciudadano' | 'staff';
  texto: string;
  creadoMs: number;
}

export interface Base {
  cuentas: Record<string, Cuenta>;
  reportes: Record<string, ReportePlano>;
  historial: Record<string, CambioPlano[]>;
  confirmaciones: Record<string, string[]>;
  tickets: Record<string, TicketPlano>;
  mensajes: Record<string, MensajePlano[]>;
  operadores: Record<string, { nombre: string; organismoId: string; telefono?: string; correo?: string; direccion?: string }>;
  /** Avisos que cada cuenta ya vio. */
  vistos: Record<string, string[]>;
  sesion: string | null;
  siguienteId: number;
}

const CLAVE = 'e2e.base';
const HORA = 3_600_000;
const DIA = 24 * HORA;

/** Plaza de Maipú: dentro de los límites oficiales de la comuna. */
export const PLAZA_MAIPU = { lat: -33.5106, lng: -70.7572 };

const MAIPU = { id: 'muni_13119', nombre: 'Municipalidad de Maipú', tipo: 'municipio', comuna: 'Maipú' };
const REGION_RM = 'Región Metropolitana de Santiago';

function semilla(ahora: number): Base {
  const cerca = (metrosNorte: number, metrosEste = 0) => ({
    lat: PLAZA_MAIPU.lat + metrosNorte / 111_320,
    lng: PLAZA_MAIPU.lng + metrosEste / 93_000,
    accuracy: 12,
  });
  const reporte = (r: Partial<ReportePlano> & Pick<ReportePlano, 'id' | 'uid' | 'descripcion'>): ReportePlano => ({
    categoria: 'luminaria',
    ubicacion: cerca(40),
    comuna: 'Maipú',
    region: REGION_RM,
    autorNombre: 'Ana Pérez',
    foto: null,
    estado: 'reportado',
    organismo: MAIPU,
    operadorId: 'op_maipu',
    creadoMs: ahora - 2 * HORA,
    actualizadoMs: ahora - 2 * HORA,
    ...r,
  });

  return {
    cuentas: {
      ana: { uid: 'ana', email: 'ana@prueba.cl', password: 'secreta1', displayName: 'Ana Pérez', role: 'ciudadano', emailVerified: true, creadaMs: ahora - 30 * DIA, terminosVersion: 'vigente' },
      luis: { uid: 'luis', email: 'luis@prueba.cl', password: 'secreta1', displayName: 'Luis Soto', role: 'ciudadano', emailVerified: true, creadaMs: ahora - 60 * DIA, terminosVersion: 'vigente' },
      op: { uid: 'op', email: 'operadora@maipu.cl', password: 'secreta1', displayName: 'Operadora Maipú', role: 'operador', operadorId: 'op_maipu', emailVerified: true, creadaMs: ahora - 90 * DIA, terminosVersion: 'vigente' },
      admin: { uid: 'admin', email: 'admin@prueba.cl', password: 'secreta1', displayName: 'Admin Ciudad Alerta', role: 'admin', emailVerified: true, creadaMs: ahora - 120 * DIA, terminosVersion: 'vigente' },
      antigua: { uid: 'antigua', email: 'antigua@prueba.cl', password: 'secreta1', displayName: 'Cuenta Antigua', role: 'ciudadano', emailVerified: true, creadaMs: ahora - 400 * DIA },
    },
    reportes: {
      r_ana_nuevo: reporte({ id: 'r_ana_nuevo', uid: 'ana', descripcion: 'Luminaria apagada frente al paradero 3 de Av. Pajaritos', creadoMs: ahora - HORA, actualizadoMs: ahora - HORA }),
      r_ana_proceso: reporte({
        id: 'r_ana_proceso',
        uid: 'ana',
        categoria: 'microbasural',
        descripcion: 'Microbasural en la esquina de la plaza, con colchones y escombros',
        estado: 'en_proceso',
        ubicacion: cerca(-60, 30),
        creadoMs: ahora - 3 * DIA,
        actualizadoMs: ahora - 5 * HORA,
      }),
      r_luis: reporte({
        id: 'r_luis',
        uid: 'luis',
        autorNombre: 'Luis Soto',
        categoria: 'fuga_agua',
        descripcion: 'Fuga de agua en la vereda, corre hacia la calle desde la mañana',
        ubicacion: cerca(80, -20),
        creadoMs: ahora - 6 * HORA,
        actualizadoMs: ahora - 6 * HORA,
      }),
      r_resuelto: reporte({
        id: 'r_resuelto',
        uid: 'luis',
        autorNombre: 'Luis Soto',
        categoria: 'calle_deteriorada',
        descripcion: 'Bache profundo en la pista derecha, ya reparado',
        estado: 'resuelto',
        ubicacion: cerca(120, 60),
        creadoMs: ahora - 10 * DIA,
        actualizadoMs: ahora - 2 * DIA,
      }),
    },
    historial: {
      r_ana_proceso: [
        { id: 'h1', desde: 'reportado', hacia: 'en_revision', autorUid: 'op', autorNombre: 'Municipalidad de Maipú', autorRol: 'operador', comentario: '', creadoMs: ahora - 2 * DIA },
        { id: 'h2', desde: 'en_revision', hacia: 'derivado', autorUid: 'op', autorNombre: 'Municipalidad de Maipú', autorRol: 'operador', comentario: 'Lo enviamos a Aseo y Ornato.', creadoMs: ahora - DIA },
        { id: 'h3', desde: 'derivado', hacia: 'en_proceso', autorUid: 'op', autorNombre: 'Municipalidad de Maipú', autorRol: 'operador', comentario: 'Cuadrilla programada para mañana.', creadoMs: ahora - 5 * HORA },
      ],
      r_resuelto: [
        { id: 'h4', desde: 'reportado', hacia: 'en_proceso', autorUid: 'op', autorNombre: 'Municipalidad de Maipú', autorRol: 'operador', comentario: '', creadoMs: ahora - 8 * DIA },
        { id: 'h5', desde: 'en_proceso', hacia: 'resuelto', autorUid: 'op', autorNombre: 'Municipalidad de Maipú', autorRol: 'operador', comentario: 'Bache reparado.', creadoMs: ahora - 2 * DIA },
      ],
    },
    confirmaciones: { r_luis: ['admin'] },
    tickets: {
      t_ana: { id: 't_ana', uid: 'ana', autorNombre: 'Ana Pérez', autorEmail: 'ana@prueba.cl', tipo: 'queja', asunto: 'La foto tarda mucho en protegerse', estado: 'en_atencion', creadoMs: ahora - 2 * DIA, ultimoMs: ahora - DIA, adelanto: 'Gracias, lo estamos revisando.' },
    },
    mensajes: {
      t_ana: [
        { id: 'm1', ticketId: 't_ana', autorUid: 'ana', autorNombre: 'Ana Pérez', autorRol: 'ciudadano', texto: 'Al tomar la foto, la protección tarda casi un minuto.', creadoMs: ahora - 2 * DIA },
        { id: 'm2', ticketId: 't_ana', autorUid: 'admin', autorNombre: 'Equipo Ciudad Alerta', autorRol: 'staff', texto: 'Gracias, lo estamos revisando.', creadoMs: ahora - DIA },
      ],
    },
    operadores: {
      op_maipu: { nombre: 'Operadora Maipú', organismoId: 'muni_13119', telefono: '+56 2 2677 6000', correo: 'oirs@maipu.cl', direccion: 'Av. 5 de Abril 0260, Maipú' },
    },
    vistos: {},
    sesion: null,
    siguienteId: 1,
  };
}

let memoria: Base | null = null;

/** La base actual (la crea con la semilla la primera vez). */
export function base(): Base {
  if (memoria) return memoria;
  try {
    const guardada = localStorage.getItem(CLAVE);
    if (guardada) memoria = JSON.parse(guardada) as Base;
  } catch {
    // Sin almacenamiento: empieza de nuevo en cada carga.
  }
  if (!memoria) {
    memoria = semilla(Date.now());
    // Una prueba puede empezar con la sesión abierta (ver e2e/pruebas/ayudas.ts).
    const sesion = leer('e2e.sesionInicial');
    if (sesion && memoria.cuentas[sesion]) memoria.sesion = sesion;
  }
  guardar();
  return memoria;
}

/** Aplica un cambio y lo deja guardado. */
export function cambiar<T>(fn: (b: Base) => T): T {
  const resultado = fn(base());
  guardar();
  return resultado;
}

export function nuevoId(prefijo: string): string {
  return cambiar((b) => `${prefijo}_${b.siguienteId++}`);
}

function leer(clave: string): string | null {
  try {
    return localStorage.getItem(clave);
  } catch {
    return null;
  }
}

function guardar(): void {
  try {
    localStorage.setItem(CLAVE, JSON.stringify(memoria));
  } catch {
    // Sin almacenamiento: queda en memoria durante esta carga.
  }
}

/** Para la consola del navegador al depurar una prueba: `__e2e.base()`. */
(globalThis as unknown as { __e2e: unknown }).__e2e = { base, cambiar };
