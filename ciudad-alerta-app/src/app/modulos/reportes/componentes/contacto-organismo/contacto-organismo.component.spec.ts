import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import { Report } from '../../../../models/report.model';
import { ContactoOrganismoService } from '../../datos/contacto-organismo.service';
import { ContactoOrganismoComponent } from './contacto-organismo.component';
import { usarEntornoDePrueba } from '../../../../../testing';

usarEntornoDePrueba();

const REPORTE = {
  id: 'abc123',
  descripcion: 'Bache profundo frente al paradero',
  categoria: 'calle_deteriorada',
  comuna: 'Maipú',
  operadorId: 'op_maipu',
  organismo: { id: 'muni_13119', nombre: 'Municipalidad de Maipú', tipo: 'municipio' },
} as Report;

describe('ContactoOrganismoComponent', () => {
  async function montar(contacto: unknown, reporte: Report = REPORTE): Promise<HTMLElement> {
    TestBed.configureTestingModule({
      providers: [{ provide: ContactoOrganismoService, useValue: { deOperador: vi.fn().mockResolvedValue(contacto) } }],
    });
    const fixture = TestBed.createComponent(ContactoOrganismoComponent);
    fixture.componentRef.setInput('reporte', reporte);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('ofrece llamar y escribir, con el código del reporte en el correo', async () => {
    const html = await montar({
      telefono: 'tel:+56226776000',
      telefonoVisible: '+56 2 2677 6000',
      correo: 'oirs@maipu.cl',
      direccion: 'Av. Cinco de Abril 0260',
    });
    const enlaces = [...html.querySelectorAll('a')].map((a) => a.getAttribute('href') ?? '');

    expect(enlaces[0]).toBe('tel:+56226776000');
    expect(enlaces[1]).toMatch(/^mailto:oirs@maipu\.cl\?subject=/);
    expect(decodeURIComponent(enlaces[1])).toContain('abc123');
    expect(html.textContent).toContain('Av. Cinco de Abril 0260');
  });

  it('si el organismo no publicó contacto, lo dice', async () => {
    const html = await montar({ telefono: null, telefonoVisible: null, correo: null, direccion: null });
    expect(html.textContent).toContain('Municipalidad de Maipú aún no publicó un teléfono ni un correo');
    expect(html.querySelectorAll('a').length).toBe(0);
  });

  it('sin operador asignado, explica que todavía no hay a quién contactar', async () => {
    const html = await montar(null, { ...REPORTE, operadorId: null });
    expect(html.textContent).toContain('todavía no tiene a alguien asignado');
  });
});
