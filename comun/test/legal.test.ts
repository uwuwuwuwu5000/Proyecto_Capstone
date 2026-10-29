import { describe, expect, it } from 'vitest';

import {
  AUTOR_CUENTA_ELIMINADA,
  DOCUMENTOS_LEGALES,
  ELIMINAR_CUENTA,
  POLITICA_DE_PRIVACIDAD,
  VERSION_TERMINOS,
  terminosAceptados,
} from '../src';

describe('términos y privacidad', () => {
  it('solo la versión vigente cuenta como aceptada', () => {
    expect(terminosAceptados(VERSION_TERMINOS)).toBe(true);
    expect(terminosAceptados('2025-01')).toBe(false);
    expect(terminosAceptados(undefined)).toBe(false);
  });

  it('cada sección tiene título y al menos un párrafo', () => {
    for (const documento of [...DOCUMENTOS_LEGALES, ELIMINAR_CUENTA]) {
      expect(documento.secciones.length).toBeGreaterThan(0);
      for (const seccion of documento.secciones) {
        expect(seccion.titulo.trim()).not.toBe('');
        expect(seccion.parrafos.length).toBeGreaterThan(0);
      }
    }
  });

  it('la privacidad dice dónde se procesan las fotos y cómo se eliminan los datos', () => {
    const texto = POLITICA_DE_PRIVACIDAD.secciones.flatMap((s) => s.parrafos).join(' ');
    expect(texto).toContain('Render');
    expect(texto).toContain('Estados Unidos');
    expect(texto).toContain('Eliminar mi cuenta');
    expect(texto).toContain(AUTOR_CUENTA_ELIMINADA);
  });
});
