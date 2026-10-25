import { TestBed } from '@angular/core/testing';
import { Timestamp } from 'firebase/firestore';

import { AuthService } from '../../../services/auth.service';
import { SupportTicket } from '../modelo/support.model';
import { SupportError, SupportService } from './support.service';
import { usarEntornoDePrueba } from '../../../../testing';

usarEntornoDePrueba();

describe('SupportService', () => {
  let servicio: SupportService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [{ provide: AuthService, useValue: { user: { uid: 'ana', email: 'ana@prueba.cl', displayName: 'Ana' } } }],
    });
    servicio = TestBed.inject(SupportService);
  });

  it.each([
    ['un asunto muy corto', 'Hola', 'Un mensaje con detalle', 'asunto'],
    ['un asunto demasiado largo', 'x'.repeat(121), 'Un mensaje con detalle', 'asunto'],
    ['un mensaje vacío (solo espacios)', 'La app se cierra', '    ', 'mensaje'],
    ['un mensaje demasiado largo', 'La app se cierra', 'x'.repeat(1001), 'mensaje'],
  ])('no abre un ticket con %s', async (_caso, asunto, mensaje, campo) => {
    const error = await servicio.crearTicket('queja', asunto, mensaje).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SupportError);
    expect((error as SupportError).code).toBe('validacion');
    expect((error as SupportError).message).toContain(`El ${campo}`);
  });


  it('las transiciones del ticket: abierto → en atención o cerrado; cerrado se puede reabrir', () => {
    expect(servicio.transicionesDisponibles('abierto')).toEqual(expect.arrayContaining(['en_atencion', 'cerrado']));
    expect(servicio.transicionesDisponibles('en_atencion')).toContain('cerrado');
    expect(servicio.transicionesDisponibles('cerrado')).toContain('en_atencion');
  });

  it('no cambia a un estado no permitido, sin tocar Firestore', async () => {
    const ticket = { id: 't1', estado: 'cerrado' } as SupportTicket;
    await expect(servicio.cambiarEstado(ticket, 'abierto')).rejects.toMatchObject({ code: 'validacion' });
  });

  it('la fecha de un mensaje recién escrito (aún sin hora del servidor) dice «Ahora»', () => {
    expect(servicio.formatearFecha(undefined as never)).toBe('Ahora');
    expect(servicio.formatearFecha(Timestamp.fromDate(new Date(2026, 9, 25, 14, 5)))).toMatch(/25.10.*(14|02):05/);
  });
});

describe('SupportService sin sesión', () => {
  it('pide iniciarla antes de abrir un ticket', async () => {
    TestBed.configureTestingModule({ providers: [{ provide: AuthService, useValue: { user: null } }] });
    const error = await TestBed.inject(SupportService).crearTicket('queja', 'La app se cierra', 'Al abrir el mapa').catch((e) => e);
    expect(error).toMatchObject({ code: 'sin_permiso' });
  });
});
