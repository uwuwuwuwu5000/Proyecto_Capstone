import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair } from 'jose';
import { beforeAll, describe, expect, it } from 'vitest';

import { SesionInvalida, VerificadorSesion, crearVerificador } from '../src/autenticacion';

const PROYECTO = 'demo-ciudad-alerta';

describe('verificación del token de Firebase', () => {
  let firmar: (datos: Record<string, unknown>, opciones?: { aud?: string; iss?: string; vence?: string }) => Promise<string>;
  let verificar: VerificadorSesion;

  beforeAll(async () => {
    const { privateKey, publicKey } = await generateKeyPair('RS256');
    const jwk = { ...(await exportJWK(publicKey)), kid: 'clave-prueba', alg: 'RS256' };
    verificar = crearVerificador(PROYECTO, createLocalJWKSet({ keys: [jwk] }));
    firmar = (datos, opciones = {}) =>
      new SignJWT(datos)
        .setProtectedHeader({ alg: 'RS256', kid: 'clave-prueba' })
        .setIssuer(opciones.iss ?? `https://securetoken.google.com/${PROYECTO}`)
        .setAudience(opciones.aud ?? PROYECTO)
        .setSubject(String(datos['sub'] ?? 'uid-ana'))
        .setIssuedAt()
        .setExpirationTime(opciones.vence ?? '1h')
        .sign(privateKey);
  });

  it('acepta un token válido y devuelve el uid', async () => {
    const token = await firmar({ email_verified: true });
    expect(await verificar(`Bearer ${token}`)).toEqual({ uid: 'uid-ana', correoVerificado: true });
  });

  it('rechaza un token de otro proyecto', async () => {
    const token = await firmar({}, { aud: 'otro-proyecto' });
    await expect(verificar(`Bearer ${token}`)).rejects.toBeInstanceOf(SesionInvalida);
  });

  it('rechaza un emisor que no es Firebase', async () => {
    const token = await firmar({}, { iss: 'https://otro.example' });
    await expect(verificar(`Bearer ${token}`)).rejects.toBeInstanceOf(SesionInvalida);
  });

  it('rechaza un token vencido', async () => {
    const token = await firmar({}, { vence: '-1m' });
    await expect(verificar(`Bearer ${token}`)).rejects.toThrow(/venció|no es válida/);
  });

  it('sin encabezado o mal formado, pide sesión', async () => {
    await expect(verificar(undefined)).rejects.toThrow('Falta el token de sesión.');
    await expect(verificar('Basic abc')).rejects.toThrow('Falta el token de sesión.');
  });
});
