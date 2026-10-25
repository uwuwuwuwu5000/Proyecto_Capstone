import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { LoadingController, ToastController } from '@ionic/angular';
import { vi } from 'vitest';

import { SupportError, SupportService } from '../../datos/support.service';
import { SupportNewPage } from './support-new.page';
import { usarEntornoDePrueba } from '../../../../../testing';

usarEntornoDePrueba();

describe('SupportNewPage · nueva queja o sugerencia', () => {
  let fixture: ComponentFixture<SupportNewPage>;
  let pagina: SupportNewPage;
  let crear: ReturnType<typeof vi.fn>;
  let toasts: string[];
  let navegar: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    crear = vi.fn(async () => 't1');
    toasts = [];
    const presentable = { present: async () => undefined, dismiss: async () => undefined };
    TestBed.configureTestingModule({
      providers: [
        { provide: SupportService, useValue: { crearTicket: crear } },
        { provide: LoadingController, useValue: { create: async () => presentable } },
        { provide: ToastController, useValue: { create: async ({ message }: { message: string }) => (toasts.push(message), presentable) } },
      ],
    });
    fixture = TestBed.createComponent(SupportNewPage);
    pagina = fixture.componentInstance;
    navegar = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    fixture.detectChanges();
  });

  it('con el formulario incompleto no envía nada', async () => {
    pagina.formulario.setValue({ asunto: 'Hola', mensaje: '' });
    await pagina.enviar();
    expect(crear).not.toHaveBeenCalled();
  });

  it('abre la conversación con el tipo elegido y lleva a ella', async () => {
    pagina.cambiarTipo('sugerencia');
    pagina.formulario.setValue({ asunto: 'Modo sin conexión', mensaje: 'Sería útil guardar borradores.' });

    await pagina.enviar();

    expect(crear).toHaveBeenCalledWith('sugerencia', 'Modo sin conexión', 'Sería útil guardar borradores.');
    expect(navegar).toHaveBeenCalledWith(['/support', 't1'], { replaceUrl: true });
    expect(toasts[0]).toContain('Conversación abierta');
  });

  it('dos toques seguidos abren una sola conversación', async () => {
    pagina.formulario.setValue({ asunto: 'La app se cierra', mensaje: 'Al abrir el mapa.' });
    await Promise.all([pagina.enviar(), pagina.enviar()]);
    expect(crear).toHaveBeenCalledTimes(1);
  });

  it('si falla, explica por qué y deja el texto escrito', async () => {
    crear.mockRejectedValue(new SupportError('Sin conexión con el servidor. Intenta nuevamente.', 'red'));
    pagina.formulario.setValue({ asunto: 'La app se cierra', mensaje: 'Al abrir el mapa.' });

    await pagina.enviar();

    expect(toasts[0]).toContain('Sin conexión');
    expect(pagina.formulario.getRawValue().asunto).toBe('La app se cierra');
    expect(navegar).not.toHaveBeenCalled();
  });

  it('la ayuda cambia según sea queja o sugerencia', () => {
    expect(pagina.textoAyuda()).toContain('qué no está funcionando');
    pagina.cambiarTipo('sugerencia');
    expect(pagina.textoAyuda()).toContain('tu idea');
    pagina.cambiarTipo('otra cosa');
    expect(pagina.tipo()).toBe('sugerencia');
  });
});
