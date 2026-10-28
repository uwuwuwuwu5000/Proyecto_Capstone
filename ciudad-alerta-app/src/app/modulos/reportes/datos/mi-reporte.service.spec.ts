import { TestBed } from '@angular/core/testing';
import { FirebaseError } from 'firebase/app';
import type { Transaction } from 'firebase/firestore';
import { vi } from 'vitest';

import { FIREBASE_AUTH } from '../../../core/firebase.providers';
import { Report } from '../../../models/report.model';
import { FIRMA_DEL_AUTOR, MiReporteError, MiReporteService } from './mi-reporte.service';
import { usarEntornoDePrueba } from '../../../../testing';
import { authDePrueba } from '../../../../testing/firebase-de-prueba';

usarEntornoDePrueba({ uid: 'ana' });

const REPORTE = {
  id: 'r1',
  uid: 'ana',
  estado: 'reportado',
  descripcion: 'Bache grande en la esquina',
} as Report;

type Interno = { correr: (fn: (t: Transaction) => Promise<void>) => Promise<void> };

/** Transacción falsa: lee el reporte con `estado` (y `extra`) y anota lo que se escribe. */
function transaccionFalsa(estado: string | null, extra: Record<string, unknown> = {}) {
  const escrito = { set: [] as unknown[][], update: [] as unknown[][] };
  const transaccion = {
    get: async () => ({ exists: () => estado !== null, data: () => ({ estado, ...extra }) }),
    set: (...args: unknown[]) => escrito.set.push(args),
    update: (...args: unknown[]) => escrito.update.push(args),
  } as unknown as Transaction;
  return { transaccion, escrito };
}

async function fallo(promesa: Promise<unknown>): Promise<MiReporteError> {
  try {
    await promesa;
  } catch (error) {
    expect(error).toBeInstanceOf(MiReporteError);
    return error as MiReporteError;
  }
  throw new Error('Se esperaba un MiReporteError');
}

describe('MiReporteService', () => {
  let servicio: MiReporteService;

  function conTransaccion(estado: string | null, extra: Record<string, unknown> = {}) {
    const falsa = transaccionFalsa(estado, extra);
    vi.spyOn(servicio as unknown as Interno, 'correr').mockImplementation(async (fn) => fn(falsa.transaccion));
    return falsa.escrito;
  }

  beforeEach(() => {
    servicio = TestBed.inject(MiReporteService);
  });

  it('solo el autor puede modificarlo, y solo mientras siga «reportado»', () => {
    expect(servicio.puedeModificar(REPORTE)).toBe(true);
    expect(servicio.puedeModificar({ ...REPORTE, uid: 'luis' })).toBe(false);
    expect(servicio.puedeModificar({ ...REPORTE, estado: 'en_revision' })).toBe(false);
  });

  it('corrige la descripción con la hora del servidor y la marca de editado', async () => {
    const escrito = conTransaccion('reportado');

    const actualizado = await servicio.editarDescripcion(REPORTE, '  El bache está frente al paradero 3  ');

    expect(escrito.set).toEqual([]);
    expect(escrito.update).toHaveLength(1);
    const campos = escrito.update[0][1] as Record<string, unknown>;
    expect(Object.keys(campos).sort()).toEqual(['descripcion', 'editadoAt', 'updatedAt']);
    expect(campos['descripcion']).toBe('El bache está frente al paradero 3');
    expect(actualizado.descripcion).toBe('El bache está frente al paradero 3');
    expect(actualizado.editadoAt).toBeDefined();
  });

  it('no deja corregir la descripción si ya hay confirmaciones con peso (retirar, sí)', () => {
    const confirmado: Report = { ...REPORTE, validacion: { puntos: 30, votos: 3 } };
    expect(servicio.puedeCorregir(REPORTE)).toBe(true);
    expect(servicio.puedeCorregir({ ...REPORTE, validacion: { puntos: 0, votos: 0 } })).toBe(true);
    expect(servicio.puedeCorregir(confirmado)).toBe(false);
    expect(servicio.puedeCorregir({ ...REPORTE, validacion: { puntos: 10 } })).toBe(false);
    expect(servicio.puedeModificar(confirmado)).toBe(true);
  });

  it('si alguien lo confirmó mientras tanto, no escribe la corrección', async () => {
    const escrito = conTransaccion('reportado', { validacion: { puntos: 10, votos: 1 } });

    const error = await fallo(servicio.editarDescripcion(REPORTE, 'El bache está frente al paradero 3'));

    expect(error.code).toBe('ya_confirmado');
    expect(escrito.update).toEqual([]);
  });

  it('no envía una descripción demasiado corta', async () => {
    const correr = vi.spyOn(servicio as unknown as Interno, 'correr');

    const error = await fallo(servicio.editarDescripcion(REPORTE, 'corto'));

    expect(error.code).toBe('descripcion');
    expect(correr).not.toHaveBeenCalled();
  });

  it('retira el reporte: entrada en el historial sin el nombre de la persona, y el reporte cerrado', async () => {
    const escrito = conTransaccion('reportado');

    const actualizado = await servicio.retirar(REPORTE, '  Ya lo arreglaron  ');

    expect(escrito.set).toHaveLength(1);
    expect(escrito.set[0][1]).toMatchObject({
      reportId: 'r1',
      desde: 'reportado',
      hacia: 'cerrado',
      autorUid: 'ana',
      autorNombre: FIRMA_DEL_AUTOR,
      comentario: 'Retirado por quien lo reportó: Ya lo arreglaron',
    });
    expect(escrito.set[0][1]).not.toHaveProperty('autorRol');
    const campos = escrito.update[0][1] as Record<string, unknown>;
    expect(Object.keys(campos).sort()).toEqual(['cerradoSinResolverAt', 'estado', 'retiradoPorAutor', 'updatedAt']);
    expect(campos['estado']).toBe('cerrado');
    expect(campos['retiradoPorAutor']).toBe(true);
    expect(actualizado).toMatchObject({ estado: 'cerrado', retiradoPorAutor: true });
  });

  it('sin motivo, el historial dice solo que lo retiró', async () => {
    const escrito = conTransaccion('reportado');

    await servicio.retirar(REPORTE);

    expect((escrito.set[0][1] as { comentario: string }).comentario).toBe('Retirado por quien lo reportó.');
  });

  it('si alguien lo empezó a revisar mientras tanto, no escribe nada', async () => {
    const escrito = conTransaccion('en_revision');

    const error = await fallo(servicio.retirar(REPORTE));

    expect(error.code).toBe('ya_revisado');
    expect(escrito.set).toEqual([]);
    expect(escrito.update).toEqual([]);
  });

  it('no deja modificar el reporte de otra persona', async () => {
    const correr = vi.spyOn(servicio as unknown as Interno, 'correr');

    const error = await fallo(servicio.retirar({ ...REPORTE, uid: 'luis' }));

    expect(error.code).toBe('no_es_tuyo');
    expect(correr).not.toHaveBeenCalled();
  });

  it('traduce la falta de red a un mensaje para reintentar', async () => {
    vi.spyOn(servicio as unknown as Interno, 'correr').mockRejectedValue(new FirebaseError('unavailable', 'offline'));

    const error = await fallo(servicio.editarDescripcion(REPORTE, 'El bache está frente al paradero 3'));

    expect(error.code).toBe('red');
    expect(error.message).toContain('Sin conexión');
  });
});

describe('MiReporteService sin sesión', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [{ provide: FIREBASE_AUTH, useFactory: () => authDePrueba(null) }],
    });
  });

  it('pide volver a iniciar sesión', async () => {
    const error = await fallo(TestBed.inject(MiReporteService).retirar(REPORTE));
    expect(error.code).toBe('sin_sesion');
  });
});
