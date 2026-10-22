import { TestBed } from '@angular/core/testing';
import { serverTimestamp } from 'firebase/firestore';
import { vi } from 'vitest';

import { Report } from '../../../models/report.model';
import { AuthService } from '../../../services/auth.service';
import { VeredictoService, camposDeVeredicto } from './veredicto.service';
import { usarEntornoDePrueba } from '../../../../testing';

usarEntornoDePrueba();

const REPORTE = { id: 'r1', uid: 'vecina', operadorId: 'op1', estado: 'en_revision' } as Report;

describe('VeredictoService', () => {
  let servicio: VeredictoService;
  let auth: { user: { uid: string } | null; getUserProfile: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    auth = { user: null, getUserProfile: vi.fn().mockResolvedValue(null) };
    TestBed.configureTestingModule({ providers: [{ provide: AuthService, useValue: auth }] });
    servicio = TestBed.inject(VeredictoService);
  });

  function sesion(uid: string, perfil: { role: string; operadorId?: string } | null): void {
    auth.user = { uid };
    auth.getUserProfile.mockResolvedValue(perfil);
  }

  describe('permiso', () => {
    it('sin sesión, o un vecino, no ve el veredicto', async () => {
      expect(await servicio.permiso(REPORTE)).toEqual({ gestiona: false, puede: false, motivo: null });
      sesion('luis', { role: 'ciudadano' });
      expect((await servicio.permiso(REPORTE)).gestiona).toBe(false);
    });

    it('el operador asignado y un admin pueden darlo', async () => {
      sesion('op', { role: 'operador', operadorId: 'op1' });
      expect(await servicio.permiso(REPORTE)).toEqual({ gestiona: true, puede: true, motivo: null });
      sesion('jefa', { role: 'admin' });
      expect((await servicio.permiso(REPORTE)).puede).toBe(true);
    });

    it('otro operador no lo ve (Gestión ya le explica por qué)', async () => {
      sesion('op2', { role: 'operador', operadorId: 'op2' });
      expect((await servicio.permiso(REPORTE)).gestiona).toBe(false);
    });

    it('sobre un reporte propio, lo ve pero no puede', async () => {
      sesion('vecina', { role: 'admin' });
      const permiso = await servicio.permiso(REPORTE);
      expect(permiso.gestiona).toBe(true);
      expect(permiso.puede).toBe(false);
      expect(permiso.motivo).toContain('propio reporte');
    });

    it('con veredicto ya dado, lo ve pero no puede darlo otra vez', async () => {
      sesion('jefa', { role: 'admin' });
      const conVeredicto = { ...REPORTE, validacion: { veredicto: 'real' as const } };
      expect(await servicio.permiso(conVeredicto)).toEqual({ gestiona: true, puede: false, motivo: null });
    });

    it('si el perfil no se puede leer, no lo ve', async () => {
      auth.user = { uid: 'op' };
      auth.getUserProfile.mockRejectedValue(new Error('sin red'));
      expect((await servicio.permiso(REPORTE)).gestiona).toBe(false);
    });
  });

  describe('dar (lo que se rechaza antes de escribir)', () => {
    it('sin sesión', async () => {
      await expect(servicio.dar(REPORTE, 'real')).rejects.toMatchObject({ code: 'sin_sesion' });
    });

    it('sobre el propio reporte', async () => {
      auth.user = { uid: 'vecina' };
      await expect(servicio.dar(REPORTE, 'real')).rejects.toMatchObject({ code: 'propio' });
    });

    it('falso sin motivo', async () => {
      auth.user = { uid: 'op' };
      await expect(servicio.dar(REPORTE, 'falso', '   ')).rejects.toMatchObject({ code: 'motivo' });
    });
  });
});

describe('camposDeVeredicto', () => {
  it('real sobre un autor sin documento de confianza: +10 PC y un validado', () => {
    const campos = camposDeVeredicto({ reportId: 'r1', gestorUid: 'op', veredicto: 'real', motivo: null, previo: null });

    expect(campos.reporte).toEqual({
      'validacion.veredicto': 'real',
      'validacion.veredictoPor': 'op',
      'validacion.veredictoAt': serverTimestamp(),
      'validacion.veredictoPuntos': 10,
      updatedAt: serverTimestamp(),
    });
    expect(campos.confianza).toEqual({
      puntosConfianza: 10,
      trustLevel: 0,
      validatedReports: 1,
      reportesFalsos: 0,
      confirmacionesSuspendidas: false,
      ultimoReporteId: 'r1',
      updatedAt: serverTimestamp(),
    });
    expect(campos.espejo).toEqual({ trustLevel: 0, validatedReports: 1, updatedAt: serverTimestamp() });
  });

  it('falso: −15 PC, un falso más, el motivo y la suspensión intacta', () => {
    const campos = camposDeVeredicto({
      reportId: 'r2',
      gestorUid: 'op',
      veredicto: 'falso',
      motivo: 'No había ningún bache',
      previo: { puntosConfianza: 40, validatedReports: 4, reportesFalsos: 0, confirmacionesSuspendidas: true },
    });

    expect(campos.reporte['validacion.veredictoComentario']).toBe('No había ningún bache');
    expect(campos.reporte['validacion.veredictoPuntos']).toBe(-15);
    expect(campos.confianza).toMatchObject({
      puntosConfianza: 25,
      trustLevel: 0,
      validatedReports: 4,
      reportesFalsos: 1,
      confirmacionesSuspendidas: true,
    });
  });

  it('solo escribe los campos que aceptan las reglas', () => {
    const campos = camposDeVeredicto({ reportId: 'r1', gestorUid: 'op', veredicto: 'falso', motivo: 'x', previo: null });

    // veredictoValido: validacion.{veredicto, veredictoPor, veredictoAt, veredictoComentario, veredictoPuntos} y updatedAt.
    expect(Object.keys(campos.reporte).sort()).toEqual(
      [
        'updatedAt',
        'validacion.veredicto',
        'validacion.veredictoAt',
        'validacion.veredictoComentario',
        'validacion.veredictoPor',
        'validacion.veredictoPuntos',
      ].sort(),
    );
    // confianzaDeVeredictoValida: keys().hasOnly([...]).
    expect(Object.keys(campos.confianza).sort()).toEqual(
      [
        'confirmacionesSuspendidas',
        'puntosConfianza',
        'reportesFalsos',
        'trustLevel',
        'ultimoReporteId',
        'updatedAt',
        'validatedReports',
      ].sort(),
    );
    // espejoDeConfianzaValido: trustLevel, validatedReports y updatedAt.
    expect(Object.keys(campos.espejo).sort()).toEqual(['trustLevel', 'updatedAt', 'validatedReports']);
  });

  it('en el tope de 760, veredictoPuntos guarda 0 (lo que de verdad cambió)', () => {
    const campos = camposDeVeredicto({
      reportId: 'r1',
      gestorUid: 'op',
      veredicto: 'real',
      motivo: null,
      previo: { puntosConfianza: 760, validatedReports: 70 },
    });
    expect(campos.reporte['validacion.veredictoPuntos']).toBe(0);
    expect(campos.confianza).toMatchObject({ puntosConfianza: 760, trustLevel: 10, validatedReports: 71 });
  });
});
