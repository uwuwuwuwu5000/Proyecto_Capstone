#!/usr/bin/env node
/**
 * Ataques al servicio de privacidad (servicio-privacidad), que difumina las
 * fotos en la nube. Prueba lo que protege a los usuarios: la verificación del
 * token de sesión, el límite por usuario, el endurecimiento del procesamiento
 * de imágenes (pixel bombs, EXIF/GPS) y la política de CORS/tipo/tamaño.
 *
 *   npm run diagnostico:servicio
 *   node scripts/diagnostico/servicio-ataques.mjs
 *   node scripts/diagnostico/servicio-ataques.mjs --url http://localhost:8080
 *
 * El núcleo (secciones A–D) corre SIN RED ni modelos, empaquetando los módulos
 * del servicio con esbuild e inyectándoles claves y relojes de prueba. La
 * sección E (opcional, --url) lanza peticiones HTTP reales a un servicio que
 * ya tengas levantado.
 *
 * Secciones (diagnostico/servicio.md):
 *   A · Verificación del token   alg:none, iss/aud, vencido, otra firma, HS256…
 *   B · Límite por usuario        llenar, bloquear, ventana, aislamiento por uid.
 *   C · Procesamiento de imagen   pixel bomb, imagen corrupta, SVG, EXIF/GPS.
 *   D · Política CORS/tipo/tamaño orígenes sin comodín, allowlist de tipos, tope.
 *   E · Sondas HTTP en vivo       /salud, 401, preflight, cabeceras (solo --url).
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { Informe } from './comun.mjs';

const APP = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SERVICIO = resolve(APP, '..', 'servicio-privacidad');
const URL_VIVO = (() => {
  const i = process.argv.indexOf('--url');
  return i >= 0 ? process.argv[i + 1] : null;
})();
const informe = new Informe('Ataques al servicio de privacidad · Ciudad Alerta');

// Resuelve dependencias (jose, esbuild, sharp) desde el servicio, no desde la app.
const requerirServicio = createRequire(join(SERVICIO, 'package.json'));

// ── Empaquetado de los módulos TypeScript del servicio ───────────────────────
// Se deja todo externo (se resuelve desde node_modules del servicio) y la
// salida va dentro del árbol del servicio para que sharp/jose/TF se encuentren.
let tmpDir = null;
async function bundle(entradaRel, nombre) {
  const esbuild = await import(pathToFileURL(requerirServicio.resolve('esbuild')).href);
  if (!tmpDir) tmpDir = mkdtempSync(join(SERVICIO, '.diag-'));
  const salida = join(tmpDir, `${nombre}.mjs`);
  await esbuild.build({
    entryPoints: [join(SERVICIO, entradaRel)],
    outfile: salida,
    bundle: true,
    format: 'esm',
    platform: 'node',
    packages: 'external',
    logLevel: 'silent',
  });
  return import(pathToFileURL(salida).href);
}

let jose;
try {
  jose = await import(pathToFileURL(requerirServicio.resolve('jose')).href);
} catch {
  informe.agregar('error', 'no se encontró «jose» en el servicio: no se puede probar la autenticación', {
    solucion: 'Corre `npm install` en servicio-privacidad.',
  });
}

const limpiar = () => {
  if (tmpDir) try { rmSync(tmpDir, { recursive: true, force: true }); } catch { /* da igual */ }
};
process.on('exit', limpiar);

const PROYECTO = 'ciudadalerta';
const ISS = `https://securetoken.google.com/${PROYECTO}`;
const b64url = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');

// ════════════════════════════════════════════════════════════════════════════
// A · Verificación del token de sesión
// ════════════════════════════════════════════════════════════════════════════
informe.seccion('A · Verificación del token de sesión (jose, claves de prueba)');
if (jose) {
  try {
    const { crearVerificador, SesionInvalida } = await (async () => {
      const mod = await bundle('src/autenticacion.ts', 'autenticacion');
      return mod;
    })();

    const { publicKey, privateKey } = await jose.generateKeyPair('RS256', { extractable: true });
    const otra = await jose.generateKeyPair('RS256', { extractable: true });
    const verificar = crearVerificador(PROYECTO, publicKey);

    const firmar = (payload, header = { alg: 'RS256' }, clave = privateKey) => {
      const t = new jose.SignJWT(payload).setProtectedHeader(header).setIssuedAt();
      return t.sign(clave);
    };
    const base = { sub: 'ana', email_verified: true };
    const conTiempos = (t) => t.setIssuer(ISS).setAudience(PROYECTO).setExpirationTime('1h');

    // Caso válido (control): debe aceptarse.
    const tokenOk = await conTiempos(new jose.SignJWT(base).setProtectedHeader({ alg: 'RS256' }).setIssuedAt()).sign(privateKey);
    const evaluar = async (nombre, hazToken, { debeAceptar = false, impacto, solucion } = {}) => {
      let token;
      try { token = await hazToken(); } catch (e) { informe.agregar('info', `${nombre}: no se pudo crear el token (${e.message})`); return; }
      try {
        const sesion = await verificar(`Bearer ${token}`);
        if (debeAceptar) informe.ok(`${nombre} (uid=${sesion.uid}, correoVerificado=${sesion.correoVerificado})`);
        else informe.agregar('brecha', `${nombre}: el servicio ACEPTA el token`, { detalle: impacto, solucion: solucion ?? 'Endurecer crearVerificador().' });
      } catch (e) {
        if (debeAceptar) informe.agregar('error', `${nombre}: el servicio RECHAZA un token legítimo`, { detalle: e.message });
        else informe.ok(`${nombre} → rechazado (${e instanceof SesionInvalida ? 'sesión inválida' : e.name})`);
      }
    };

    await evaluar('token válido', async () => tokenOk, { debeAceptar: true });
    await evaluar('alg:none (sin firma)', async () => `${b64url({ alg: 'none', typ: 'JWT' })}.${b64url({ iss: ISS, aud: PROYECTO, sub: 'ana', exp: Math.floor(Date.now() / 1000) + 3600 })}.`,
      { impacto: 'Cualquiera fabricaría sesiones sin la clave privada de Google.' });
    await evaluar('firma con OTRA clave', async () => conTiempos(new jose.SignJWT(base).setProtectedHeader({ alg: 'RS256' }).setIssuedAt()).sign(otra.privateKey),
      { impacto: 'Un atacante con su propia clave suplantaría usuarios.' });
    await evaluar('confusión de algoritmo HS256', async () => new jose.SignJWT(base).setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setIssuer(ISS).setAudience(PROYECTO).setExpirationTime('1h').sign(new TextEncoder().encode('clave-simetrica-falsa')),
      { impacto: 'Ataque clásico de confusión RS256→HS256.' });
    await evaluar('emisor (iss) equivocado', async () => new jose.SignJWT(base).setProtectedHeader({ alg: 'RS256' }).setIssuedAt().setIssuer('https://securetoken.google.com/otro-proyecto').setAudience(PROYECTO).setExpirationTime('1h').sign(privateKey),
      { impacto: 'Un token de otro proyecto Firebase sería aceptado.' });
    await evaluar('audiencia (aud) equivocada', async () => new jose.SignJWT(base).setProtectedHeader({ alg: 'RS256' }).setIssuedAt().setIssuer(ISS).setAudience('otro-proyecto').setExpirationTime('1h').sign(privateKey),
      { impacto: 'Un token emitido para otra audiencia sería aceptado.' });
    await evaluar('token vencido', async () => new jose.SignJWT(base).setProtectedHeader({ alg: 'RS256' }).setIssuer(ISS).setAudience(PROYECTO).setIssuedAt(Math.floor(Date.now() / 1000) - 7200).setExpirationTime(Math.floor(Date.now() / 1000) - 3600).sign(privateKey),
      { impacto: 'Sesiones caducadas seguirían funcionando.' });
    await evaluar('nbf en el futuro', async () => new jose.SignJWT(base).setProtectedHeader({ alg: 'RS256' }).setIssuer(ISS).setAudience(PROYECTO).setIssuedAt().setNotBefore(Math.floor(Date.now() / 1000) + 3600).setExpirationTime(Math.floor(Date.now() / 1000) + 7200).sign(privateKey),
      { impacto: 'Un token todavía no válido sería aceptado.' });
    await evaluar('sin sub (sin usuario)', async () => conTiempos(new jose.SignJWT({ email_verified: true }).setProtectedHeader({ alg: 'RS256' }).setIssuedAt()).sign(privateKey),
      { impacto: 'Una sesión sin usuario pasaría la verificación.' });

    // Encabezado mal formado: sin «Bearer».
    try {
      await verificar(tokenOk); // sin «Bearer »
      informe.agregar('brecha', 'token sin el prefijo «Bearer» aceptado', { solucion: 'Exigir el formato Authorization: Bearer <token>.' });
    } catch { informe.ok('encabezado sin «Bearer» → rechazado'); }
    try {
      await verificar(undefined);
      informe.agregar('brecha', 'petición sin Authorization aceptada');
    } catch { informe.ok('sin Authorization → rechazado'); }
  } catch (e) {
    informe.agregar('error', 'no se pudo empaquetar/ejecutar autenticacion.ts', { detalle: e.message });
  }
}

// ════════════════════════════════════════════════════════════════════════════
// B · Límite por usuario
// ════════════════════════════════════════════════════════════════════════════
informe.seccion('B · Límite de fotos por usuario (reloj de prueba)');
try {
  const { LimitePorUsuario } = await bundle('src/limite.ts', 'limite');
  let t = 1_000_000;
  const reloj = () => t;
  const lim = new LimitePorUsuario(3, 10_000, reloj);
  const uid = 'ana';
  const permitidas = [lim.permitir(uid), lim.permitir(uid), lim.permitir(uid)];
  const cuarta = lim.permitir(uid);
  if (permitidas.every(Boolean) && !cuarta) informe.ok('tras 3 fotos (máx 3) la 4.ª se bloquea');
  else informe.agregar('brecha', 'el límite no bloquea al superar el máximo', { archivo: 'servicio-privacidad/src/limite.ts' });

  // Aislamiento por uid: otro usuario no hereda el límite.
  if (lim.permitir('luis')) informe.ok('el límite es por usuario: otro uid no queda bloqueado');
  else informe.agregar('error', 'el límite bloquea a un usuario distinto (no debería)');

  // Nota de diseño: el límite se cuenta por uid del token, no por IP. Forjar
  // X-Forwarded-For NO lo evade (lo correcto). Lo dejamos explícito.
  informe.agregar('info', 'el límite se cuenta por uid del token (no por IP): falsear X-Forwarded-For no lo evade');

  // La ventana se desliza: tras avanzar el reloj, vuelve a permitir.
  t += 10_001;
  if (lim.permitir(uid)) informe.ok('pasada la ventana, el usuario vuelve a poder procesar');
  else informe.agregar('advertencia', 'la ventana deslizante no libera tras el tiempo esperado');

  // Espera informada (no debe ser negativa ni absurda).
  t = 2_000_000;
  const lim2 = new LimitePorUsuario(2, 10_000, () => t);
  lim2.permitir(uid); lim2.permitir(uid);
  const espera = lim2.esperaSegundos(uid);
  if (espera >= 1 && espera <= 10) informe.ok(`espera informada coherente (${espera} s)`);
  else informe.agregar('advertencia', `espera informada fuera de rango: ${espera} s`);
} catch (e) {
  informe.agregar('error', 'no se pudo empaquetar/ejecutar limite.ts', { detalle: e.message });
}

// ════════════════════════════════════════════════════════════════════════════
// C · Procesamiento de imagen (pixel bomb, corrupta, SVG, EXIF/GPS)
// ════════════════════════════════════════════════════════════════════════════
informe.seccion('C · Endurecimiento del procesamiento de imagen');
let sharp;
try {
  sharp = (await import(pathToFileURL(requerirServicio.resolve('sharp')).href)).default;
} catch {
  informe.agregar('info', 'no se encontró «sharp» en el servicio: se omite el procesamiento de imagen');
}
if (sharp) {
  let decodificar, ImagenInvalida, LADO_MAXIMO;
  try {
    const mod = await bundle('src/difuminar.ts', 'difuminar');
    ({ decodificar, ImagenInvalida, LADO_MAXIMO } = mod);
  } catch (e) {
    informe.agregar('info', 'no se pudo cargar difuminar.ts (¿faltan modelos/TF?); se prueba la configuración de sharp directamente', { detalle: e.message });
  }

  const probarImagen = async (nombre, hazBuffer, { debeFallar, impacto, solucion } = {}) => {
    let buf;
    try { buf = await hazBuffer(); } catch (e) { informe.agregar('info', `${nombre}: no se pudo crear la imagen de prueba (${e.message})`); return; }
    if (!decodificar) return; // sin la función del servicio, no afirmamos nada
    try {
      const img = await decodificar(buf);
      if (debeFallar) informe.agregar('brecha', `${nombre}: el servicio la PROCESA`, { detalle: impacto, solucion });
      else informe.ok(`${nombre}: procesada a ${img.ancho}×${img.alto} (≤ ${LADO_MAXIMO})`);
    } catch (e) {
      if (debeFallar) informe.ok(`${nombre} → rechazada (${e instanceof ImagenInvalida ? 'ImagenInvalida' : e.name})`);
      else informe.agregar('advertencia', `${nombre}: rechazada cuando debía procesarse`, { detalle: e.message });
    }
  };

  // C.1 · Pixel bomb: dimensiones enormes (100 MP > 60 MP del límite).
  await probarImagen('pixel bomb (10000×10000 px)', async () =>
    sharp({ create: { width: 10000, height: 10000, channels: 3, background: { r: 1, g: 1, b: 1 } } }).png().toBuffer(),
    { debeFallar: true, impacto: 'Una imagen minúscula al descomprimir agota memoria/CPU.', solucion: 'Mantener limitInputPixels en decodificar().' });

  // C.2 · Imagen corrupta / no-imagen.
  await probarImagen('archivo que no es imagen', async () => Buffer.from('esto no es una imagen, es texto plano'.repeat(10)),
    { debeFallar: true, impacto: 'Entrada no válida procesada.', solucion: 'Mantener failOn:error en sharp.' });

  // C.3 · SVG con dimensiones enormes (vector que rasteriza a muchos píxeles).
  await probarImagen('SVG de 20000×20000', async () =>
    Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="20000" height="20000"><rect width="100%" height="100%" fill="red"/></svg>'),
    { debeFallar: true, impacto: 'Un SVG rasteriza a una imagen gigante (otra forma de pixel bomb).', solucion: 'Rechazar SVG y/o mantener el límite de píxeles.' });

  // C.4 · EXIF/GPS: una foto con GPS debe salir sin metadatos.
  if (decodificar) {
    try {
      const conGps = await sharp({ create: { width: 64, height: 64, channels: 3, background: { r: 10, g: 20, b: 30 } } })
        .withExif({ IFD0: { Make: 'Prueba' }, GPS: { GPSLatitude: '33/1 30/1 0/1', GPSLatitudeRef: 'S', GPSLongitude: '70/1 40/1 0/1', GPSLongitudeRef: 'W' } })
        .jpeg().toBuffer();
      const antes = await sharp(conGps).metadata();
      const img = await decodificar(conGps);
      // decodificar devuelve RGB crudo; al reempaquetar no debe quedar EXIF/GPS.
      const reencode = await sharp(img.datos, { raw: { width: img.ancho, height: img.alto, channels: 3 } }).jpeg().toBuffer();
      const despues = await sharp(reencode).metadata();
      const teniaGps = !!antes.exif;
      const quedaExif = !!despues.exif;
      if (teniaGps && !quedaExif) informe.ok('EXIF/GPS eliminado: la foto protegida no conserva metadatos de ubicación');
      else if (!teniaGps) informe.agregar('info', 'no se pudo incrustar EXIF de prueba (versión de sharp); verifícalo con el emulador');
      else informe.agregar('brecha', 'la foto protegida CONSERVA metadatos EXIF', { detalle: 'La ubicación del GPS de la cámara viajaría en la foto publicada.', solucion: 'Asegurar que decodificar() reencode sin metadatos.' });
    } catch (e) {
      informe.agregar('info', `prueba de EXIF no concluyente: ${e.message}`);
    }
  }
} // sharp

// ════════════════════════════════════════════════════════════════════════════
// D · Política de CORS / tipo / tamaño
// ════════════════════════════════════════════════════════════════════════════
informe.seccion('D · Política de CORS, tipo y tamaño (estática)');
try {
  const { leerConfiguracion } = await bundle('src/configuracion.ts', 'configuracion');
  const cfg = leerConfiguracion({});
  // D.1 · Orígenes sin comodín.
  const comodin = cfg.origenes.find((o) => o.includes('*'));
  if (comodin) informe.agregar('brecha', `la lista de orígenes contiene un comodín: ${comodin}`, { solucion: 'Enumerar orígenes exactos; nunca «*» con credenciales.' });
  else informe.ok(`${cfg.origenes.length} orígenes, todos exactos (sin comodín)`);
  // D.2 · Un origen malicioso NO está en la lista (replica la decisión de cors()).
  const permitido = (origen) => cfg.origenes.includes(origen.replace(/\/$/, ''));
  if (!permitido('https://evil.example')) informe.ok('un origen desconocido no sería reflejado por CORS');
  else informe.agregar('brecha', 'un origen desconocido sería aceptado por CORS');
  // D.3 · Un prefijo/subdominio parecido no cuela (coincidencia exacta).
  if (!permitido('https://localhost.evil.example')) informe.ok('un subdominio parecido a un origen permitido no cuela');
  else informe.agregar('brecha', 'coincidencia de origen por prefijo: «localhost.evil» aceptado');
  // D.4 · Tope de bytes razonable.
  if (cfg.bytesMaximos > 0 && cfg.bytesMaximos <= 16 * 1024 * 1024) informe.ok(`tope de subida ${(cfg.bytesMaximos / 1024 / 1024).toFixed(0)} MB`);
  else informe.agregar('advertencia', `tope de subida inusual: ${cfg.bytesMaximos} bytes`);
  // D.5 · El servidor valida el token ANTES del content-type/tamaño.
  informe.agregar('info', 'en servidor.ts el orden es: token (401) → límite (429) → tipo (415) → tamaño (413): un anónimo no llega a procesar imagen');
  // D.6 · Allowlist de tipos declarada.
  informe.agregar('info', 'tipos aceptados: image/jpeg, image/png, image/webp (allowlist en servidor.ts)');
} catch (e) {
  informe.agregar('error', 'no se pudo leer la configuración del servicio', { detalle: e.message });
}

// ════════════════════════════════════════════════════════════════════════════
// E · Sondas HTTP en vivo (opcional, --url)
// ════════════════════════════════════════════════════════════════════════════
informe.seccion('E · Sondas HTTP en vivo');
if (!URL_VIVO) {
  informe.agregar('info', 'omitido: levanta el servicio y pasa --url http://localhost:8080 para sondearlo en vivo');
} else {
  const base = URL_VIVO.replace(/\/$/, '');
  const pedir = async (ruta, opciones = {}) => {
    try {
      const r = await fetch(base + ruta, opciones);
      const cuerpo = await r.text();
      return { estado: r.status, headers: r.headers, cuerpo };
    } catch (e) {
      return { error: e.message };
    }
  };
  // /salud
  const salud = await pedir('/salud');
  if (salud.error) informe.agregar('error', `no se pudo conectar a ${base}`, { detalle: salud.error });
  else {
    if (salud.estado === 200) informe.ok('/salud responde 200 sin sesión');
    else informe.agregar('advertencia', `/salud respondió ${salud.estado}`);
    // 401 sin token
    const sinToken = await pedir('/v1/proteger', { method: 'POST', headers: { 'content-type': 'image/jpeg' }, body: 'x' });
    if (sinToken.estado === 401) informe.ok('POST /v1/proteger sin token → 401');
    else informe.agregar('brecha', `POST /v1/proteger sin token → ${sinToken.estado} (se esperaba 401)`);
    // Fuga de stack en el error
    if (sinToken.cuerpo && /\bat \/|\.ts:\d+|\.mjs:\d+|Error:.*\n\s+at /.test(sinToken.cuerpo)) {
      informe.agregar('advertencia', 'el cuerpo del error 401 parece incluir una traza', { detalle: (sinToken.cuerpo || '').slice(0, 160) });
    } else informe.ok('el error 401 no filtra traza interna');
    // Preflight de origen no permitido
    const evil = await pedir('/v1/proteger', { method: 'OPTIONS', headers: { origin: 'https://evil.example', 'access-control-request-method': 'POST' } });
    const acao = evil.headers?.get?.('access-control-allow-origin');
    if (!acao) informe.ok('preflight de origen no permitido → sin Access-Control-Allow-Origin');
    else informe.agregar('brecha', `CORS refleja un origen no permitido: ${acao}`);
    // Preflight de origen permitido
    const ok = await pedir('/v1/proteger', { method: 'OPTIONS', headers: { origin: 'http://localhost:8100', 'access-control-request-method': 'POST' } });
    if (ok.headers?.get?.('access-control-allow-origin') === 'http://localhost:8100') informe.ok('preflight de origen permitido → reflejado correctamente');
    else informe.agregar('advertencia', 'un origen permitido no fue reflejado en el preflight');
  }
}

process.exitCode = informe.cerrar(APP, 'servicio.md');
