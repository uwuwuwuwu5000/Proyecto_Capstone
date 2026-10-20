import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ToastController } from '@ionic/angular';

import { MatchCandidate, Report } from '../../../../models/report.model';
import { ConfirmationError, ConfirmationService } from '../../datos/confirmation.service';
import { SimilarReportsComponent } from './similar-reports.component';

function candidato(id: string, distanciaMetros: number): MatchCandidate {
  return {
    report: { id, estado: 'en_revision', descripcion: `Bache ${id}` } as Report,
    distanciaMetros,
    horasTranscurridas: 3,
    similitudImagen: null,
    puntaje: 0.82,
    motivos: ['Está muy cerca'],
  };
}

describe('SimilarReportsComponent', () => {
  let fixture: ComponentFixture<SimilarReportsComponent>;
  let componente: SimilarReportsComponent;
  let confirmaciones: { confirm: ReturnType<typeof vi.fn>; hasConfirmed: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    confirmaciones = {
      confirm: vi.fn().mockResolvedValue(undefined),
      hasConfirmed: vi.fn().mockResolvedValue(false),
    };

    TestBed.configureTestingModule({
      providers: [
        { provide: ConfirmationService, useValue: confirmaciones },
        { provide: ToastController, useValue: { create: async () => ({ present: async () => undefined }) } },
      ],
    });

    fixture = TestBed.createComponent(SimilarReportsComponent);
    componente = fixture.componentInstance;
  });

  it('sin candidatos no muestra nada', () => {
    fixture.componentRef.setInput('candidatos', []);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent.trim()).toBe('');
  });

  it('mientras analiza muestra el aviso de búsqueda', () => {
    fixture.componentRef.setInput('candidatos', []);
    fixture.componentRef.setInput('analizando', true);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Buscando reportes cercanos');
  });

  it('muestra estado legible y distancia aproximada de cada candidato', () => {
    fixture.componentRef.setInput('candidatos', [candidato('a', 147), candidato('b', 1260)]);
    fixture.detectChanges();

    const texto: string = fixture.nativeElement.textContent;
    expect(texto).toContain('Ya hay reportes cerca');
    expect(texto).toContain('En revisión');
    expect(texto).toContain('a 150 m aprox. de tu ubicación');
    expect(texto).toContain('a 1,3 km aprox. de tu ubicación');
  });

  it('marca como confirmados los que el usuario ya confirmó antes (v2-D4)', async () => {
    confirmaciones.hasConfirmed.mockImplementation(async (id: string) => id === 'b');
    fixture.componentRef.setInput('candidatos', [candidato('a', 50), candidato('b', 80)]);
    fixture.detectChanges();

    await vi.waitFor(() => expect(componente.yaConfirmo('b')).toBe(true));
    expect(componente.yaConfirmo('a')).toBe(false);
    expect(confirmaciones.hasConfirmed).toHaveBeenCalledTimes(2);
  });

  it('al confirmar avisa a la página y no admite dos confirmaciones a la vez (v2-D5)', async () => {
    const emitidos: string[] = [];
    componente.confirmado.subscribe((id) => emitidos.push(id));
    fixture.componentRef.setInput('candidatos', [candidato('a', 50), candidato('b', 80)]);
    fixture.detectChanges();

    const primera = componente.confirmar(candidato('a', 50));
    await componente.confirmar(candidato('b', 80));
    await primera;

    expect(confirmaciones.confirm).toHaveBeenCalledTimes(1);
    expect(emitidos).toEqual(['a']);
    expect(componente.yaConfirmo('a')).toBe(true);
  });

  it('una confirmación duplicada queda marcada como hecha', async () => {
    confirmaciones.confirm.mockRejectedValue(new ConfirmationError('Ya lo confirmaste.', 'duplicada'));
    fixture.componentRef.setInput('candidatos', [candidato('a', 50)]);
    fixture.detectChanges();

    await componente.confirmar(candidato('a', 50));

    expect(componente.yaConfirmo('a')).toBe(true);
    expect(componente.confirmando()).toBeNull();
  });
});
