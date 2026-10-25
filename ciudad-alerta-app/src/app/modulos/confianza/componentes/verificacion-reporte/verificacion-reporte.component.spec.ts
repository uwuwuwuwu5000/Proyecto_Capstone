import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import { Report } from '../../../../models/report.model';
import { ConfianzaService, Disponibilidad, MotivoBloqueo } from '../../datos/confianza.service';
import { VerificacionReporteComponent } from './verificacion-reporte.component';
import { usarEntornoDePrueba } from '../../../../../testing';

usarEntornoDePrueba();

const REPORTE = { id: 'r1', uid: 'vecina', estado: 'en_revision', validacion: { puntos: 40, votos: 2 } } as Report;

function disponibilidad(bloqueo: MotivoBloqueo | null, cambios: Partial<Disponibilidad> = {}): Disponibilidad {
  return {
    bloqueo,
    nivel: 1,
    peso: 15,
    motivoSinPeso: null,
    cupo: { usadas: 1, limite: 8, restantes: 7, ultimaMs: null, reinicioMs: Date.now() + 3_600_000 },
    pausaRestanteMs: 0,
    pesoAportado: null,
    ...cambios,
  } as Disponibilidad;
}

describe('VerificacionReporteComponent (ranura detalle-reporte.verificacion)', () => {
  let fixture: ComponentFixture<VerificacionReporteComponent>;
  let servicio: { disponibilidad: ReturnType<typeof vi.fn> };

  async function montar(d: Disponibilidad, reporte: Report = REPORTE, esAutor = false): Promise<string> {
    servicio.disponibilidad.mockResolvedValue(d);
    fixture = TestBed.createComponent(VerificacionReporteComponent);
    fixture.componentRef.setInput('reporte', reporte);
    fixture.componentRef.setInput('esAutor', esAutor);
    fixture.detectChanges();
    if (!esAutor) await vi.waitFor(() => expect(servicio.disponibilidad).toHaveBeenCalled());
    await fixture.whenStable();
    fixture.detectChanges();
    return (fixture.nativeElement.textContent as string).replace(/\s+/g, ' ');
  }

  beforeEach(() => {
    servicio = { disponibilidad: vi.fn() };
    TestBed.configureTestingModule({ providers: [{ provide: ConfianzaService, useValue: servicio }] });
  });

  it('muestra el avance y el botón con lo que vale el voto', async () => {
    const texto = await montar(disponibilidad(null));
    expect(texto).toContain('2 personas confirmaron');
    expect(texto).toContain('Confirmar que existe');
    expect(texto).toContain('Tu voto vale 15 puntos');
  });

  it('en un reporte cerrado no ofrece confirmar', async () => {
    const texto = await montar(disponibilidad('cerrado'), { ...REPORTE, estado: 'cerrado' });
    expect(texto).toContain('ya está cerrado');
    expect(texto).not.toContain('Confirmar que existe');
  });

  it('si quien lo reportó lo retiró, lo dice así', async () => {
    const texto = await montar(disponibilidad('cerrado'), { ...REPORTE, estado: 'cerrado', retiradoPorAutor: true });
    expect(texto).toContain('Quien lo reportó lo retiró');
  });

  it('el autor no ve el botón ni se consulta su disponibilidad', async () => {
    const texto = await montar(disponibilidad(null), REPORTE, true);
    expect(texto).toContain('Este es tu reporte');
    expect(texto).not.toContain('Confirmar que existe');
    expect(servicio.disponibilidad).not.toHaveBeenCalled();
  });

  it('en el límite del día dice cuántas tenía', async () => {
    const texto = await montar(disponibilidad('limite'));
    expect(texto).toContain('Llegaste a tus 8 confirmaciones de hoy');
  });

  it('sin red ofrece reintentar', async () => {
    servicio.disponibilidad.mockRejectedValue(new Error('sin red'));
    fixture = TestBed.createComponent(VerificacionReporteComponent);
    fixture.componentRef.setInput('reporte', REPORTE);
    fixture.detectChanges();
    await vi.waitFor(() => expect(servicio.disponibilidad).toHaveBeenCalled());
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Reintentar');
  });
});
