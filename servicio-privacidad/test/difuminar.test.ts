import { readFile } from 'node:fs/promises';
import sharp from 'sharp';
import { beforeAll, describe, expect, it } from 'vitest';

import { leerConfiguracion } from '../src/configuracion';
import { ImagenInvalida, LADO_MAXIMO, decodificar, proteger } from '../src/difuminar';
import { Modelos, cargarModelos, normalizarVector } from '../src/modelos';

/**
 * Prueba con los modelos reales y una foto de dominio público (Eileen Collins,
 * NASA, incluida en scikit-image). MobileNet se desactiva: se descarga de
 * internet y aquí no hace falta.
 */
const FOTO = new URL('./fixtures/astronauta.jpg', import.meta.url);

/** Detalle de una zona: diferencia media entre píxeles vecinos. Difuminar la baja mucho. */
async function detalle(jpeg: Buffer, zona: { left: number; top: number; width: number; height: number }): Promise<number> {
  const { data, info } = await sharp(jpeg).extract(zona).greyscale().raw().toBuffer({ resolveWithObject: true });
  let suma = 0;
  for (let y = 0; y < info.height; y++) {
    for (let x = 1; x < info.width; x++) suma += Math.abs(data[y * info.width + x] - data[y * info.width + x - 1]);
  }
  return suma / (info.height * (info.width - 1));
}

describe('protección de la foto en el servidor', () => {
  let modelos: Modelos;

  beforeAll(async () => {
    modelos = await cargarModelos(leerConfiguracion({}).carpetaModelos, 'no');
  });

  it('carga los detectores con el backend WASM', () => {
    expect(modelos.backend).toBe('wasm');
    expect(modelos.conRostros).toBe(true);
    expect(modelos.conSimilitud).toBe(false);
  });

  it('encuentra el rostro y lo difumina', async () => {
    const original = await readFile(FOTO);
    const resultado = await proteger(original, modelos);

    expect(resultado.privacidad).toEqual({
      aplicada: true,
      rostros: 1,
      personas: 0,
      version: 'nube:mediapipe-face-full+coco-ssd-lite-v2',
    });
    expect([resultado.ancho, resultado.alto]).toEqual([512, 512]);
    expect(resultado.embedding).toBeNull();

    // La cara de la foto (aprox. x 170–280, y 40–170) pierde casi todo el detalle.
    const cara = { left: 180, top: 60, width: 90, height: 90 };
    expect(await detalle(resultado.jpeg, cara)).toBeLessThan((await detalle(original, cara)) * 0.4);
    // El resto de la foto conserva su detalle (solo cambia por la compresión).
    const fondo = { left: 380, top: 30, width: 100, height: 100 };
    expect(await detalle(resultado.jpeg, fondo)).toBeGreaterThan((await detalle(original, fondo)) * 0.7);
  });

  it('una foto sin personas sale igual, con aplicada: true', async () => {
    const vacia = await sharp({ create: { width: 300, height: 200, channels: 3, background: '#88aa66' } }).jpeg().toBuffer();
    const resultado = await proteger(vacia, modelos);
    expect(resultado.privacidad).toMatchObject({ aplicada: true, rostros: 0, personas: 0 });
  });

  it('achica las fotos grandes a 1024 px y respeta la proporción', async () => {
    const grande = await sharp({ create: { width: 4000, height: 3000, channels: 3, background: '#ffffff' } }).jpeg().toBuffer();
    const imagen = await decodificar(grande);
    expect([imagen.ancho, imagen.alto]).toEqual([LADO_MAXIMO, 768]);
  });

  it('rechaza lo que no es una imagen', async () => {
    await expect(decodificar(Buffer.from('no soy una foto'))).rejects.toBeInstanceOf(ImagenInvalida);
  });

  it('el vector se normaliza igual que en la app (longitud 1, 4 decimales)', () => {
    expect(normalizarVector([3, 4])).toEqual([0.6, 0.8]);
    expect(normalizarVector([0, 0])).toEqual([0, 0]);
  });
});
