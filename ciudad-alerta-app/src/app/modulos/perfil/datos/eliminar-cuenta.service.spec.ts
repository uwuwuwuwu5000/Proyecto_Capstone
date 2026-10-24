import { TestBed } from '@angular/core/testing';
import { FirebaseError } from 'firebase/app';

import { AuthService } from '../../../services/auth.service';
import { EliminarCuentaService } from './eliminar-cuenta.service';
import { usarEntornoDePrueba } from '../../../../testing';

usarEntornoDePrueba();

type Interno = { traducir: (error: unknown) => { code: string; message: string } };

describe('EliminarCuentaService', () => {
  it('sin sesión no intenta nada', async () => {
    TestBed.configureTestingModule({ providers: [{ provide: AuthService, useValue: { user: null } }] });
    await expect(TestBed.inject(EliminarCuentaService).eliminar('x')).rejects.toMatchObject({ code: 'sin_sesion' });
  });

  it('traduce los errores de Firebase a mensajes para la persona', () => {
    const servicio = TestBed.inject(EliminarCuentaService) as unknown as Interno;

    expect(servicio.traducir(new FirebaseError('auth/invalid-credential', 'x')).code).toBe('contrasena');
    expect(servicio.traducir(new FirebaseError('auth/wrong-password', 'x')).code).toBe('contrasena');
    expect(servicio.traducir(new FirebaseError('auth/too-many-requests', 'x')).code).toBe('demasiados');
    expect(servicio.traducir(new FirebaseError('auth/network-request-failed', 'x')).message).toContain('no se eliminó');
  });
});
