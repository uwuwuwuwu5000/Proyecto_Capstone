import sharp from 'sharp';
import {
  CALIDAD_SALIDA,
  Caja,
  InfoPrivacidad,
  tamanoReducido,
  versionDeModelos,
  zonasADifuminar,
} from '@ciudad-alerta/comun';

import { ImagenRgb, Modelos } from './modelos';

/** Lado mayor de la foto procesada: el mismo que usa la cámara de la app. */
export const LADO_MAXIMO = 1024;

export class ImagenInvalida extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImagenInvalida';
  }
}

export interface FotoProtegida {
  jpeg: Buffer;
  ancho: number;
  alto: number;
  privacidad: InfoPrivacidad;
  /** Vector para comparar fotos (duplicados); null si MobileNet no está. */
  embedding: number[] | null;
}

/** Decodifica, endereza según EXIF y achica a 1024 px como máximo. */
export async function decodificar(entrada: Buffer): Promise<ImagenRgb> {
  try {
    const { data, info } = await sharp(entrada, { failOn: 'error', limitInputPixels: 60_000_000 })
      .rotate()
      .resize({ width: LADO_MAXIMO, height: LADO_MAXIMO, fit: 'inside', withoutEnlargement: true })
      .removeAlpha()
      .toColourspace('srgb')
      .raw()
      .toBuffer({ resolveWithObject: true });
    return { datos: new Uint8Array(data.buffer, data.byteOffset, data.byteLength), ancho: info.width, alto: info.height };
  } catch {
    throw new ImagenInvalida('El archivo no es una imagen que se pueda leer (JPEG, PNG o WebP).');
  }
}

/** Una caja con coordenadas enteras dentro de la imagen; null si es muy chica. */
function enPixeles(caja: Caja, imagen: ImagenRgb): { left: number; top: number; width: number; height: number } | null {
  const left = Math.max(0, Math.floor(caja.x));
  const top = Math.max(0, Math.floor(caja.y));
  const width = Math.min(imagen.ancho - left, Math.ceil(caja.ancho));
  const height = Math.min(imagen.alto - top, Math.ceil(caja.alto));
  return width >= 2 && height >= 2 ? { left, top, width, height } : null;
}

/**
 * Pixela una zona: la reduce a unos 6 bloques de ancho y la vuelve a ampliar
 * con suavizado, igual que hacía la app con el lienzo. Lo descartado al
 * reducir no se puede recuperar. Los rostros van en elipse.
 */
async function pixelar(imagen: ImagenRgb, caja: Caja, eliptica: boolean): Promise<sharp.OverlayOptions | null> {
  const zona = enPixeles(caja, imagen);
  if (!zona) return null;

  const reducido = tamanoReducido({ x: 0, y: 0, ancho: zona.width, alto: zona.height });
  const pequena = await sharp(imagen.datos, { raw: { width: imagen.ancho, height: imagen.alto, channels: 3 } })
    .extract(zona)
    .resize(reducido.ancho, reducido.alto, { fit: 'fill' })
    .png()
    .toBuffer();
  let ampliada = sharp(pequena).resize(zona.width, zona.height, { fit: 'fill', kernel: 'cubic' });

  if (eliptica) {
    const mascara = Buffer.from(
      `<svg width="${zona.width}" height="${zona.height}"><ellipse cx="${zona.width / 2}" cy="${zona.height / 2}" rx="${zona.width / 2}" ry="${zona.height / 2}" fill="#fff"/></svg>`,
    );
    ampliada = sharp(await ampliada.ensureAlpha().png().toBuffer()).composite([{ input: mascara, blend: 'dest-in' }]);
  }

  return { input: await ampliada.png().toBuffer(), left: zona.left, top: zona.top };
}

/** Difumina rostros y cabezas de personas, y calcula el vector de la foto protegida. */
export async function proteger(entrada: Buffer, modelos: Modelos): Promise<FotoProtegida> {
  const imagen = await decodificar(entrada);
  const { rostros, personas } = await modelos.detectar(imagen);
  const zonas = zonasADifuminar(rostros, personas, { width: imagen.ancho, height: imagen.alto });

  const capas = (
    await Promise.all([
      ...zonas.rostros.map((zona) => pixelar(imagen, zona, true)),
      ...zonas.cabezas.map((zona) => pixelar(imagen, zona, false)),
    ])
  ).filter((capa): capa is sharp.OverlayOptions => capa !== null);

  const jpeg = await sharp(imagen.datos, { raw: { width: imagen.ancho, height: imagen.alto, channels: 3 } })
    .composite(capas)
    .jpeg({ quality: Math.round(CALIDAD_SALIDA * 100) })
    .toBuffer();

  // El vector se calcula sobre la foto ya protegida, como hacía la app.
  const embedding = modelos.conSimilitud ? await modelos.vector(await decodificar(jpeg)) : null;

  return {
    jpeg,
    ancho: imagen.ancho,
    alto: imagen.alto,
    privacidad: {
      aplicada: true,
      rostros: rostros.length,
      personas: zonas.cabezas.length,
      version: `nube:${versionDeModelos(modelos.conRostros)}`,
    },
    embedding,
  };
}
