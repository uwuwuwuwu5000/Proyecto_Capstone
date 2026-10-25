import { TestBed } from '@angular/core/testing';
import { FirebaseError } from 'firebase/app';
import { vi } from 'vitest';

import { AuthService } from '../../../services/auth.service';
import { PreferenciasService } from '../../../services/preferencias.service';
import { EliminarCuentaService } from './eliminar-cuenta.service';
import { usarEntornoDePrueba } from '../../../../testing';

usarEntornoDePrueba();

type Interno = {
  traducir: (error: unknown) => { code: string; message: string };
  reautenticar: (...a: unknown[]) => Promise<unknown>;
  propios: (coleccion: string, uid: string) => Promise<{ ref: string; datos: Record<string, unknown> }[]>;
  actualizarEnLotes: (refs: unknown[], cambios: Record<string, string>) => Promise<void>;
  vaciarPerfil: (uid: string) => Promise<void>;
  borrarCuenta: (usuario: unknown) => Promise<void>;
};

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

describe('EliminarCuentaService · el orden de los pasos', () => {
  let servicio: EliminarCuentaService;
  let interno: Interno;
  let pasos: string[];
  let borrarLocal: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    pasos = [];
    borrarLocal = vi.fn(() => pasos.push('teléfono'));
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: { user: { uid: 'ana', email: 'ana@prueba.cl' } } },
        { provide: PreferenciasService, useValue: { borrarDatosLocales: borrarLocal } },
      ],
    });
    servicio = TestBed.inject(EliminarCuentaService);
    interno = servicio as unknown as Interno;

    vi.spyOn(interno, 'reautenticar').mockImplementation(async () => pasos.push('contraseña'));
    vi.spyOn(interno, 'propios').mockImplementation(async (coleccion) =>
      coleccion === 'reports'
        ? [
            { ref: 'r1', datos: { autorNombre: 'Ana' } },
            { ref: 'r2', datos: { autorNombre: 'Cuenta eliminada' } },
          ]
        : [
            { ref: 't1', datos: { autorNombre: 'Ana', autorEmail: 'ana@prueba.cl' } },
            { ref: 't2', datos: { autorNombre: 'Cuenta eliminada', autorEmail: '' } },
          ],
    );
    vi.spyOn(interno, 'actualizarEnLotes').mockImplementation(async (refs, cambios) => {
      pasos.push(`${refs.join(',')} → ${JSON.stringify(cambios)}`);
    });
    vi.spyOn(interno, 'vaciarPerfil').mockImplementation(async () => void pasos.push('perfil'));
    vi.spyOn(interno, 'borrarCuenta').mockImplementation(async () => void pasos.push('cuenta'));
  });

  it('pide la contraseña, deja anónimos reportes y tickets, vacía el perfil y recién entonces borra la cuenta', async () => {
    const resultado = await servicio.eliminar('secreta1');

    expect(resultado).toEqual({ reportesAnonimos: 1 });
    expect(pasos).toEqual([
      'contraseña',
      'r1 → {"autorNombre":"Cuenta eliminada"}',
      't1 → {"autorNombre":"Cuenta eliminada","autorEmail":""}',
      'perfil',
      'cuenta',
      'teléfono',
    ]);
  });

  it('con la contraseña equivocada no toca nada', async () => {
    vi.spyOn(interno, 'reautenticar').mockRejectedValue(new FirebaseError('auth/invalid-credential', 'x'));

    await expect(servicio.eliminar('mala')).rejects.toMatchObject({ code: 'contrasena' });
    expect(pasos).toEqual([]);
  });

  it('si falla a mitad (sin red), no borra la cuenta: se puede reintentar', async () => {
    vi.spyOn(interno, 'vaciarPerfil').mockRejectedValue(new FirebaseError('unavailable', 'offline'));

    await expect(servicio.eliminar('secreta1')).rejects.toMatchObject({ code: 'red' });
    expect(pasos).not.toContain('cuenta');
    expect(borrarLocal).not.toHaveBeenCalled();
  });
});
