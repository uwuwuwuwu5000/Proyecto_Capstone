import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AvisosPage } from './avisos.page';
import { AvisosService } from '../../datos/avisos.service';
import { Aviso, AvisoVeredicto } from '../../modelo/aviso.model';
import { usarEntornoDePrueba } from '../../../../../testing';

usarEntornoDePrueba();

const VEREDICTO: AvisoVeredicto = {
  tipo: 'veredicto',
  id: 'r1_veredicto',
  reportId: 'r1',
  reporte: 'Microbasural en la plaza',
  veredicto: 'falso',
  puntos: -15,
  autor: 'Revisado por quien gestiona el reporte',
  comentario: 'La foto es de otro lugar',
  fecha: new Date(Date.UTC(2026, 9, 3, 15)),
  visto: false,
};

describe('AvisosPage', () => {
  let component: AvisosPage;
  let fixture: ComponentFixture<AvisosPage>;
  let avisos: ReturnType<typeof signal<Aviso[]>>;

  beforeEach(() => {
    avisos = signal<Aviso[]>([]);
    TestBed.configureTestingModule({
      providers: [
        {
          provide: AvisosService,
          useValue: {
            avisos,
            noVistos: () => avisos().filter((a) => !a.visto).length,
            cargando: signal(false),
            error: signal(null),
            marcarVisto: async () => undefined,
            marcarTodos: async () => undefined,
          },
        },
      ],
    });

    fixture = TestBed.createComponent(AvisosPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  const texto = () => ((fixture.nativeElement as HTMLElement).textContent ?? '').replace(/\s+/g, ' ');

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('muestra el veredicto con los puntos y el motivo', () => {
    avisos.set([VEREDICTO]);
    fixture.detectChanges();

    expect(texto()).toContain('Marcado como falso · −15 puntos de confianza');
    expect(texto()).toContain('Motivo: La foto es de otro lugar');
  });

  it('muestra un cambio de estado como antes', () => {
    avisos.set([
      {
        tipo: 'estado',
        id: 'r1_c1',
        reportId: 'r1',
        reporte: 'Microbasural en la plaza',
        desde: 'reportado',
        hacia: 'en_revision',
        autor: 'Municipalidad de Maipú',
        comentario: null,
        fecha: null,
        visto: true,
      },
    ]);
    fixture.detectChanges();

    expect(texto()).toContain('→');
    expect(texto()).toContain('Municipalidad de Maipú');
  });

  it('explica cuando el veredicto no movió los puntos', () => {
    expect(component.textoPuntos({ ...VEREDICTO, veredicto: 'real', puntos: 10 })).toBe('+10 puntos de confianza');
    expect(component.textoPuntos({ ...VEREDICTO, veredicto: 'real', puntos: 0 })).toContain('máximo');
    expect(component.textoPuntos({ ...VEREDICTO, puntos: 0 })).toContain('ya estaban en 0');
  });
});
