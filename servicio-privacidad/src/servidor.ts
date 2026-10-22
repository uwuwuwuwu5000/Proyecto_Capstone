import { IncomingMessage, Server, ServerResponse, createServer } from 'node:http';

import { SesionInvalida, VerificadorSesion } from './autenticacion';
import { Configuracion } from './configuracion';
import { FotoProtegida, ImagenInvalida } from './difuminar';
import { LimitePorUsuario } from './limite';

export const VERSION = '1.0.0';

/** Lo que el servidor necesita para trabajar; en las pruebas se reemplaza. */
export interface Dependencias {
  config: Configuracion;
  verificar: VerificadorSesion;
  /** Procesa una foto. Debe esperar a que los modelos estén cargados. */
  procesar: (foto: Buffer) => Promise<FotoProtegida>;
  /** Estado de los modelos para /salud. */
  estado: () => { listo: boolean; rostros: boolean; similitud: boolean; backend: string | null; error: string | null };
}

/** Fotos esperando turno como máximo: con más, se pide reintentar. */
const COLA_MAXIMA = 8;

class ErrorHttp extends Error {
  constructor(
    readonly estado: number,
    readonly codigo: string,
    message: string,
    readonly encabezados: Record<string, string> = {},
  ) {
    super(message);
  }
}

function leerCuerpo(peticion: IncomingMessage, maximo: number): Promise<Buffer> {
  return new Promise((resolver, rechazar) => {
    const declarado = Number(peticion.headers['content-length'] ?? 0);
    if (declarado > maximo) {
      rechazar(new ErrorHttp(413, 'foto_muy_grande', 'La foto pesa demasiado.'));
      peticion.resume();
      return;
    }
    const partes: Buffer[] = [];
    let total = 0;
    peticion.on('data', (parte: Buffer) => {
      total += parte.length;
      if (total > maximo) {
        rechazar(new ErrorHttp(413, 'foto_muy_grande', 'La foto pesa demasiado.'));
        peticion.destroy();
        return;
      }
      partes.push(parte);
    });
    peticion.on('end', () => resolver(Buffer.concat(partes)));
    peticion.on('error', rechazar);
  });
}

export function crearServidor(dep: Dependencias): Server {
  const limite = new LimitePorUsuario(dep.config.fotosPorVentana, dep.config.ventanaMs);
  let cola: Promise<unknown> = Promise.resolve();
  let enCola = 0;

  /** Una foto a la vez: el plan gratuito tiene poca memoria y CPU. */
  function enTurno<T>(trabajo: () => Promise<T>): Promise<T> {
    if (enCola >= COLA_MAXIMA) {
      return Promise.reject(new ErrorHttp(503, 'ocupado', 'El servicio está ocupado. Intenta de nuevo en unos segundos.', { 'Retry-After': '5' }));
    }
    enCola++;
    const resultado = cola.then(trabajo, trabajo);
    cola = resultado.catch(() => undefined).finally(() => enCola--);
    return resultado;
  }

  function cors(peticion: IncomingMessage, respuesta: ServerResponse): void {
    const origen = peticion.headers.origin;
    if (origen && dep.config.origenes.includes(origen.replace(/\/$/, ''))) {
      respuesta.setHeader('Access-Control-Allow-Origin', origen);
      respuesta.setHeader('Vary', 'Origin');
      respuesta.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
      respuesta.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      respuesta.setHeader('Access-Control-Max-Age', '600');
    }
  }

  function json(respuesta: ServerResponse, estado: number, cuerpo: unknown, encabezados: Record<string, string> = {}): void {
    respuesta.writeHead(estado, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...encabezados });
    respuesta.end(JSON.stringify(cuerpo));
  }

  async function proteger(peticion: IncomingMessage): Promise<Record<string, unknown>> {
    let sesion;
    try {
      sesion = await dep.verificar(peticion.headers.authorization);
    } catch (error) {
      throw new ErrorHttp(401, 'sin_sesion', error instanceof SesionInvalida ? error.message : 'Sesión no válida.');
    }

    if (!limite.permitir(sesion.uid)) {
      const espera = limite.esperaSegundos(sesion.uid);
      throw new ErrorHttp(429, 'demasiadas_fotos', `Procesaste muchas fotos seguidas. Espera ${espera} s.`, {
        'Retry-After': String(espera),
      });
    }

    const tipo = String(peticion.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase();
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(tipo)) {
      throw new ErrorHttp(415, 'formato', 'Envía la foto como image/jpeg, image/png o image/webp.');
    }

    const foto = await leerCuerpo(peticion, dep.config.bytesMaximos);
    if (foto.length === 0) throw new ErrorHttp(400, 'sin_foto', 'No llegó ninguna foto.');

    const inicio = Date.now();
    try {
      const resultado = await enTurno(() => dep.procesar(foto));
      return {
        imagen: `data:image/jpeg;base64,${resultado.jpeg.toString('base64')}`,
        mimeType: 'image/jpeg',
        sizeBytes: resultado.jpeg.length,
        ancho: resultado.ancho,
        alto: resultado.alto,
        privacidad: resultado.privacidad,
        embedding: resultado.embedding,
        ms: Date.now() - inicio,
      };
    } catch (error) {
      if (error instanceof ErrorHttp) throw error;
      if (error instanceof ImagenInvalida) throw new ErrorHttp(422, 'imagen_invalida', error.message);
      // Nunca se registra la imagen: solo el error.
      console.error('Error al proteger una foto:', error instanceof Error ? error.message : error);
      throw new ErrorHttp(500, 'error_interno', 'No se pudo procesar la foto.');
    }
  }

  return createServer((peticion, respuesta) => {
    cors(peticion, respuesta);
    const ruta = (peticion.url ?? '/').split('?')[0];

    void (async () => {
      try {
        if (peticion.method === 'OPTIONS') {
          respuesta.writeHead(204).end();
        } else if (peticion.method === 'GET' && (ruta === '/salud' || ruta === '/')) {
          json(respuesta, 200, { ok: true, servicio: 'ciudad-alerta-privacidad', version: VERSION, ...dep.estado() });
        } else if (peticion.method === 'POST' && ruta === '/v1/proteger') {
          json(respuesta, 200, await proteger(peticion));
        } else {
          throw new ErrorHttp(404, 'no_existe', 'Ruta desconocida.');
        }
      } catch (error) {
        const e = error instanceof ErrorHttp ? error : new ErrorHttp(500, 'error_interno', 'Error inesperado.');
        if (!respuesta.headersSent) json(respuesta, e.estado, { error: e.codigo, mensaje: e.message }, e.encabezados);
      }
    })();
  });
}
