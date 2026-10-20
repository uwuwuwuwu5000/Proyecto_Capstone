import { TestBed } from '@angular/core/testing';

import { Report } from '../../../models/report.model';
import { AuthService } from '../../../services/auth.service';
import { CambioEstadoError, CambioEstadoService } from './cambio-estado.service';

describe('CambioEstadoService', () => {
  let servicio: CambioEstadoService;
  let auth: { user: { uid: string } | null; getUserProfile: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    auth = { user: null, getUserProfile: vi.fn().mockResolvedValue(null) };
    TestBed.configureTestingModule({ providers: [{ provide: AuthService, useValue: auth }] });
    servicio = TestBed.inject(CambioEstadoService);
  });

  it('ofrece las transiciones de las reglas', () => {
    expect(servicio.transiciones('reportado')).toEqual(['en_revision', 'derivado', 'cerrado']);
    expect(servicio.transiciones('cerrado')).toEqual([]);
  });

  it('un estado desconocido (dato antiguo) no ofrece transiciones', () => {
    expect(servicio.transiciones('archivado' as Report['estado'])).toEqual([]);
  });

  it('sin sesión no intenta escribir', async () => {
    await expect(servicio.cambiar({ id: 'r1', estado: 'reportado' } as Report, 'en_revision')).rejects.toMatchObject({
      code: 'sin_permiso',
    });
  });

  it('rechaza una transición inválida antes de escribir', async () => {
    auth.user = { uid: 'u1' };
    const intento = servicio.cambiar({ id: 'r1', estado: 'reportado' } as Report, 'resuelto');
    await expect(intento).rejects.toBeInstanceOf(CambioEstadoError);
    await expect(intento).rejects.toMatchObject({ code: 'transicion_invalida' });
    expect(auth.getUserProfile).not.toHaveBeenCalled();
  });

  it('el permiso sale del perfil de la sesión', async () => {
    auth.user = { uid: 'u1' };
    auth.getUserProfile.mockResolvedValue({ role: 'operador', operadorId: 'op1' });

    expect((await servicio.permiso({ operadorId: 'op1' } as Report)).puede).toBe(true);
    expect((await servicio.permiso({ operadorId: 'op2' } as Report)).puede).toBe(false);
  });

  it('si el perfil no se puede leer, no es gestor', async () => {
    auth.user = { uid: 'u1' };
    auth.getUserProfile.mockRejectedValue(new Error('sin red'));
    expect(await servicio.permiso({ operadorId: 'op1' } as Report)).toEqual({
      esGestor: false,
      puede: false,
      motivo: null,
    });
  });
});
