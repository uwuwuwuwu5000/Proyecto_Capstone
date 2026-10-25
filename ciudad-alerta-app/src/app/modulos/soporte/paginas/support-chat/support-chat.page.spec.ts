import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Timestamp } from 'firebase/firestore';
import { Observable } from 'rxjs';
import { vi } from 'vitest';

import { AuthService } from '../../../../services/auth.service';
import { SupportService } from '../../datos/support.service';
import { SupportMessage, SupportTicket } from '../../modelo/support.model';
import { SupportChatPage } from './support-chat.page';
import { usarEntornoDePrueba } from '../../../../../testing';

usarEntornoDePrueba();

const ahora = Timestamp.now();

function ticket(id: string, asunto: string): SupportTicket {
  return {
    id,
    uid: 'ana',
    autorNombre: 'Ana',
    autorEmail: 'ana@prueba.cl',
    tipo: 'queja',
    asunto,
    estado: 'abierto',
    asignadoA: null,
    lastMessageAt: ahora,
    lastMessagePreview: '',
    createdAt: ahora,
    updatedAt: ahora,
  };
}

function mensaje(ticketId: string, texto: string): SupportMessage {
  return { id: `${ticketId}-m`, ticketId, autorUid: 'ana', autorNombre: 'Ana', autorRol: 'ciudadano', texto, createdAt: ahora } as SupportMessage;
}

describe('SupportChatPage', () => {
  let fixture: ComponentFixture<SupportChatPage>;
  /** Lecturas de ticket pendientes: la prueba decide cuándo responden. */
  let pendientes: Map<string, (t: SupportTicket | null) => void>;
  /** Escuchas en tiempo real abiertas ahora, por ticket. */
  let abiertas: string[];

  beforeEach(() => {
    pendientes = new Map();
    abiertas = [];
    const servicio: Partial<Record<keyof SupportService, unknown>> = {
      obtenerTicket: (id: string) => new Promise((resolver) => pendientes.set(id, resolver)),
      escucharMensajes: (id: string) =>
        new Observable<SupportMessage[]>((suscriptor) => {
          abiertas.push(id);
          suscriptor.next([mensaje(id, `Hola desde ${id}`)]);
          return () => abiertas.splice(abiertas.indexOf(id), 1);
        }),
      transicionesDisponibles: () => [],
      formatearFecha: () => 'hoy',
    };
    TestBed.configureTestingModule({
      providers: [
        { provide: SupportService, useValue: servicio },
        // El perfil decide si es staff; sin esto la página iría a Firestore.
        { provide: AuthService, useValue: { user: { uid: 'ana' }, getUserProfile: async () => ({ role: 'ciudadano' }) } },
      ],
    });
    fixture = TestBed.createComponent(SupportChatPage);
  });

  /** Espera a que el efecto pida el ticket. */
  async function abrir(id: string): Promise<void> {
    fixture.componentRef.setInput('id', id);
    fixture.detectChanges();
    await vi.waitFor(() => expect(pendientes.has(id)).toBe(true));
  }

  it('muestra el ticket y sus mensajes en tiempo real', async () => {
    await abrir('t1');
    pendientes.get('t1')!(ticket('t1', 'Luminaria apagada'));
    await vi.waitFor(() => expect(abiertas).toEqual(['t1']));
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Luminaria apagada');
    expect(fixture.componentInstance.mensajes()[0].texto).toBe('Hola desde t1');
  });

  it('si sale de la pantalla antes de que llegue el ticket, no queda una escucha abierta', async () => {
    await abrir('t1');
    fixture.destroy();

    pendientes.get('t1')!(ticket('t1', 'Luminaria apagada'));
    await new Promise((resolver) => setTimeout(resolver, 0));

    expect(abiertas).toEqual([]);
  });

  it('al salir de la pantalla corta la escucha', async () => {
    await abrir('t1');
    pendientes.get('t1')!(ticket('t1', 'Luminaria apagada'));
    await vi.waitFor(() => expect(abiertas).toEqual(['t1']));

    fixture.destroy();

    expect(abiertas).toEqual([]);
  });

  it('si pide otro ticket mientras carga el primero, el primero no pisa al segundo', async () => {
    await abrir('t1');
    await abrir('t2');

    pendientes.get('t2')!(ticket('t2', 'Microbasural'));
    await vi.waitFor(() => expect(abiertas).toEqual(['t2']));
    pendientes.get('t1')!(ticket('t1', 'Luminaria apagada'));
    await new Promise((resolver) => setTimeout(resolver, 0));

    expect(abiertas).toEqual(['t2']);
    expect(fixture.componentInstance.ticket()?.asunto).toBe('Microbasural');
  });

  it('un ticket que no existe lo dice', async () => {
    await abrir('t9');
    pendientes.get('t9')!(null);
    await vi.waitFor(() => expect(fixture.componentInstance.estado()).toBe('no_encontrado'));
    expect(abiertas).toEqual([]);
  });
});
