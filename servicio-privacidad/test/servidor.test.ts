import { AddressInfo } from 'node:net';
import { Server } from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SesionInvalida } from '../src/autenticacion';
import { leerConfiguracion } from '../src/configuracion';
import { FotoProtegida, ImagenInvalida } from '../src/difuminar';
import { crearServidor } from '../src/servidor';

const RESULTADO: FotoProtegida = {
  jpeg: Buffer.from([0xff, 0xd8, 0xff, 0xd9]),
  ancho: 10,
  alto: 8,
  privacidad: { aplicada: true, rostros: 1, personas: 0, version: 'nube:prueba' },
  embedding: [0.6, 0.8],
};

describe('servidor HTTP', () => {
  let servidor: Server;
  let base: string;

  async function iniciar(
    opciones: { procesar?: (foto: Buffer) => Promise<FotoProtegida>; fotos?: number; correo?: string } = {},
  ) {
    const config = {
      ...leerConfiguracion({ CORREO_CONTACTO: opciones.correo }),
      fotosPorVentana: opciones.fotos ?? 30,
      bytesMaximos: 1000,
    };
    servidor = crearServidor({
      config,
      verificar: async (encabezado) => {
        if (encabezado !== 'Bearer bueno') throw new SesionInvalida('La sesión no es válida o venció.');
        return { uid: 'ana', correoVerificado: true };
      },
      procesar: opciones.procesar ?? (async () => RESULTADO),
      estado: () => ({ listo: true, rostros: true, similitud: false, backend: 'wasm', error: null }),
    });
    await new Promise<void>((listo) => servidor.listen(0, '127.0.0.1', listo));
    base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
  }

  const enviar = (cuerpo: BodyInit, encabezados: Record<string, string> = {}) =>
    fetch(`${base}/v1/proteger`, {
      method: 'POST',
      body: cuerpo,
      headers: { Authorization: 'Bearer bueno', 'Content-Type': 'image/jpeg', ...encabezados },
    });

  afterEach(() => new Promise<void>((listo) => servidor.close(() => listo())));

  it('/privacidad publica la política y los términos de la app, sin sesión', async () => {
    await iniciar();
    const respuesta = await fetch(`${base}/privacidad`);
    const html = await respuesta.text();

    expect(respuesta.status).toBe(200);
    expect(respuesta.headers.get('content-type')).toContain('text/html');
    expect(html).toContain('Política de privacidad');
    expect(html).toContain('Términos de uso');
    expect(html).toContain('Render');
    expect(html).toContain('href="/eliminar-cuenta"');
  });

  it('/eliminar-cuenta explica cómo y ofrece el correo si está configurado', async () => {
    await iniciar({ correo: 'equipo@ciudadalerta.cl' });
    const html = await (await fetch(`${base}/eliminar-cuenta`)).text();

    expect(html).toContain('Eliminar tu cuenta de Ciudad Alerta');
    expect(html).toContain('Mi perfil');
    expect(html).toContain('mailto:equipo@ciudadalerta.cl');
  });

  it('/eliminar-cuenta sin correo configurado indica la app', async () => {
    await iniciar();
    const html = await (await fetch(`${base}/eliminar-cuenta`)).text();

    expect(html).not.toContain('mailto:');
    expect(html).toContain('Instálala de nuevo');
  });

  it('/salud responde aunque no haya sesión (la app lo usa para despertarlo)', async () => {
    await iniciar();
    const respuesta = await fetch(`${base}/salud`);
    expect(respuesta.status).toBe(200);
    expect(await respuesta.json()).toMatchObject({ ok: true, listo: true, rostros: true });
  });

  it('devuelve la foto protegida como data URL, con privacidad y vector', async () => {
    await iniciar();
    const respuesta = await enviar(new Uint8Array([1, 2, 3]));
    expect(respuesta.status).toBe(200);
    expect(respuesta.headers.get('cache-control')).toBe('no-store');
    expect(await respuesta.json()).toMatchObject({
      imagen: 'data:image/jpeg;base64,/9j/2Q==',
      mimeType: 'image/jpeg',
      sizeBytes: 4,
      ancho: 10,
      alto: 8,
      privacidad: RESULTADO.privacidad,
      embedding: [0.6, 0.8],
    });
  });

  it('sin sesión válida responde 401 y no procesa', async () => {
    const procesar = vi.fn(async () => RESULTADO);
    await iniciar({ procesar });
    const respuesta = await enviar(new Uint8Array([1]), { Authorization: 'Bearer malo' });
    expect(respuesta.status).toBe(401);
    expect(await respuesta.json()).toEqual({ error: 'sin_sesion', mensaje: 'La sesión no es válida o venció.' });
    expect(procesar).not.toHaveBeenCalled();
  });

  it('rechaza formatos que no son imagen y fotos demasiado pesadas', async () => {
    await iniciar();
    expect((await enviar('hola', { 'Content-Type': 'text/plain' })).status).toBe(415);
    expect((await enviar(new Uint8Array(2000))).status).toBe(413);
  });

  it('una imagen ilegible responde 422 con el motivo', async () => {
    await iniciar({ procesar: async () => Promise.reject(new ImagenInvalida('El archivo no es una imagen.')) });
    const respuesta = await enviar(new Uint8Array([1]));
    expect(respuesta.status).toBe(422);
    expect((await respuesta.json()).error).toBe('imagen_invalida');
  });

  it('un error interno no expone detalles', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await iniciar({ procesar: async () => Promise.reject(new Error('detalle secreto')) });
    const respuesta = await enviar(new Uint8Array([1]));
    expect(respuesta.status).toBe(500);
    expect(JSON.stringify(await respuesta.json())).not.toContain('secreto');
  });

  it('limita las fotos por usuario (429 con Retry-After)', async () => {
    await iniciar({ fotos: 1 });
    expect((await enviar(new Uint8Array([1]))).status).toBe(200);
    const segunda = await enviar(new Uint8Array([1]));
    expect(segunda.status).toBe(429);
    expect(Number(segunda.headers.get('retry-after'))).toBeGreaterThan(0);
  });

  it('CORS solo para los orígenes permitidos (la app de Android es https://localhost)', async () => {
    await iniciar();
    const permitido = await fetch(`${base}/v1/proteger`, { method: 'OPTIONS', headers: { Origin: 'https://localhost' } });
    expect(permitido.status).toBe(204);
    expect(permitido.headers.get('access-control-allow-origin')).toBe('https://localhost');
    expect(permitido.headers.get('access-control-allow-headers')).toContain('Authorization');

    const ajeno = await fetch(`${base}/salud`, { headers: { Origin: 'https://sitio-ajeno.example' } });
    expect(ajeno.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('procesa una foto a la vez', async () => {
    let enCurso = 0;
    let maximo = 0;
    await iniciar({
      procesar: async () => {
        enCurso++;
        maximo = Math.max(maximo, enCurso);
        await new Promise((listo) => setTimeout(listo, 30));
        enCurso--;
        return RESULTADO;
      },
    });
    const respuestas = await Promise.all([1, 2, 3].map(() => enviar(new Uint8Array([1]))));
    expect(respuestas.map((r) => r.status)).toEqual([200, 200, 200]);
    expect(maximo).toBe(1);
  });
});
