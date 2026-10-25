/**
 * Servidor estático de la maqueta para Playwright (sin dependencias).
 *
 * Sirve e2e/.compilado y, en /assets, la carpeta src/assets de la app (los
 * límites comunales, el catálogo y las imágenes), como en el APK. Cualquier
 * otra ruta devuelve index.html, como hace Ionic con el enrutador.
 *
 *   node e2e/servidor.mjs            (puerto 4300, o PUERTO=…)
 */
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const COMPILADO = resolve(AQUI, '.compilado');
const ASSETS = resolve(AQUI, '..', 'src', 'assets');
const PUERTO = Number(process.env.PUERTO ?? 4300);

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.geojson': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.map': 'application/json',
  '.webmanifest': 'application/manifest+json',
};

if (!existsSync(join(COMPILADO, 'index.html'))) {
  console.error('Falta la maqueta compilada. Corre antes: npm run e2e:compilar');
  process.exit(1);
}

/** Ruta del archivo dentro de una carpeta, o null si sale de ella o no existe. */
function archivo(carpeta, ruta) {
  const destino = normalize(join(carpeta, ruta));
  if (!destino.startsWith(carpeta)) return null;
  return existsSync(destino) && statSync(destino).isFile() ? destino : null;
}

createServer((pedido, respuesta) => {
  const ruta = decodeURIComponent(new URL(pedido.url ?? '/', 'http://x').pathname);
  const encontrado = ruta.startsWith('/assets/')
    ? archivo(ASSETS, ruta.slice('/assets/'.length))
    : (archivo(COMPILADO, ruta.slice(1)) ?? (extname(ruta) ? null : join(COMPILADO, 'index.html')));

  if (!encontrado) {
    respuesta.writeHead(404).end('No encontrado');
    return;
  }
  respuesta.writeHead(200, { 'Content-Type': TIPOS[extname(encontrado)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
  createReadStream(encontrado).pipe(respuesta);
}).listen(PUERTO, '127.0.0.1', () => console.log(`Maqueta en http://127.0.0.1:${PUERTO}`));
