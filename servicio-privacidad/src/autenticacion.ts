import { JWTVerifyGetKey, createRemoteJWKSet, jwtVerify } from 'jose';

/**
 * Verificación del token de sesión de Firebase (ID token) que manda la app en
 * `Authorization: Bearer …`.
 *
 * No necesita la clave de cuenta de servicio: los tokens se firman con claves
 * públicas de Google y basta con comprobar la firma, el emisor
 * (securetoken.google.com/<proyecto>), la audiencia (<proyecto>) y que no
 * haya vencido. Así el servicio no guarda ningún secreto.
 */
const CLAVES_GOOGLE = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';

export class SesionInvalida extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SesionInvalida';
  }
}

export interface Sesion {
  uid: string;
  correoVerificado: boolean;
}

export function crearVerificador(proyecto: string, claves: JWTVerifyGetKey = createRemoteJWKSet(new URL(CLAVES_GOOGLE))) {
  return async function verificar(encabezado: string | undefined): Promise<Sesion> {
    const token = /^Bearer\s+(\S+)$/i.exec(encabezado ?? '')?.[1];
    if (!token) throw new SesionInvalida('Falta el token de sesión.');

    try {
      const { payload } = await jwtVerify(token, claves, {
        issuer: `https://securetoken.google.com/${proyecto}`,
        audience: proyecto,
        algorithms: ['RS256'],
      });
      if (typeof payload.sub !== 'string' || payload.sub.length === 0) {
        throw new SesionInvalida('El token no identifica a un usuario.');
      }
      return { uid: payload.sub, correoVerificado: payload['email_verified'] === true };
    } catch (error) {
      if (error instanceof SesionInvalida) throw error;
      throw new SesionInvalida('La sesión no es válida o venció.');
    }
  };
}

export type VerificadorSesion = ReturnType<typeof crearVerificador>;
