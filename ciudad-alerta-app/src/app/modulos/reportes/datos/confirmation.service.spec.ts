import { TestBed } from '@angular/core/testing';
import { FirebaseError } from 'firebase/app';
import { vi } from 'vitest';

import { AuthService } from '../../../services/auth.service';
import { ConfirmationError, ConfirmationService } from './confirmation.service';
import { usarEntornoDePrueba } from '../../../../testing';

usarEntornoDePrueba();

type Interno = { traducir: (error: unknown) => ConfirmationError };

describe('ConfirmationService (confirmación simple, sin el módulo de confianza)', () => {
  it('sin sesión no confirma', async () => {
    TestBed.configureTestingModule({ providers: [{ provide: AuthService, useValue: { user: null } }] });
    await expect(TestBed.inject(ConfirmationService).confirm('r1')).rejects.toMatchObject({ code: 'no_autenticado' });
  });

  it('sin sesión, «¿ya confirmaste?» es no', async () => {
    TestBed.configureTestingModule({ providers: [{ provide: AuthService, useValue: { user: null } }] });
    expect(await TestBed.inject(ConfirmationService).hasConfirmed('r1')).toBe(false);
  });

  it('si no se puede consultar, dice «no sé» (null), no «no»', async () => {
    TestBed.configureTestingModule({ providers: [{ provide: AuthService, useValue: { user: { uid: 'ana' } } }] });
    // Firestore de prueba no tiene red: la lectura falla.
    expect(await TestBed.inject(ConfirmationService).hasConfirmed('r1')).toBeNull();
  });

  it('countMany deja fuera los que no se pudieron contar', async () => {
    const servicio = TestBed.inject(ConfirmationService);
    vi.spyOn(servicio, 'countConfirmations').mockImplementation(async (id) => (id === 'r2' ? null : id.length));

    const totales = await servicio.countMany(['r1', 'r2', 'r33']);

    expect([...totales.entries()]).toEqual([
      ['r1', 2],
      ['r33', 3],
    ]);
  });

  it('traduce los errores de Firestore', () => {
    const servicio = TestBed.inject(ConfirmationService) as unknown as Interno;
    expect(servicio.traducir(new FirebaseError('permission-denied', 'x')).code).toBe('duplicada');
    expect(servicio.traducir(new FirebaseError('unavailable', 'x')).code).toBe('red');
    expect(servicio.traducir(new Error('x')).code).toBe('desconocido');
  });
});
