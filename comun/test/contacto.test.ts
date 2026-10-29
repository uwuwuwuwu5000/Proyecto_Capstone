import { describe, expect, it } from 'vitest';

import {
  NUMEROS_DE_EMERGENCIA,
  correoValido,
  enlaceCorreo,
  enlaceTelefono,
  etiquetaCategoria,
  riesgoDeCategoria,
} from '../src';

describe('contacto y emergencias', () => {
  it('los números de emergencia de Chile', () => {
    expect(NUMEROS_DE_EMERGENCIA.map((n) => n.numero)).toEqual(['133', '132', '131']);
  });

  it('solo las categorías que pueden ser un peligro inmediato tienen aviso', () => {
    expect(riesgoDeCategoria('arbol_peligroso')).toContain('árbol');
    expect(riesgoDeCategoria('luminaria')).toContain('cables');
    expect(riesgoDeCategoria('microbasural')).toBeNull();
    expect(riesgoDeCategoria('accesibilidad')).toBeNull();
    expect(riesgoDeCategoria(null)).toBeNull();
  });

  it('el enlace de teléfono deja solo lo que se marca', () => {
    expect(enlaceTelefono('+56 2 2677 6000')).toBe('tel:+56226776000');
    expect(enlaceTelefono('(2) 2677-6000 anexo')).toBe('tel:226776000');
    expect(enlaceTelefono('1+2')).toBeNull();
    expect(enlaceTelefono('')).toBeNull();
    expect(enlaceTelefono(null)).toBeNull();
  });

  it('el correo debe tener forma de correo', () => {
    expect(correoValido(' oirs@maipu.cl ')).toBe('oirs@maipu.cl');
    expect(correoValido('oirs@maipu')).toBeNull();
    expect(correoValido(undefined)).toBeNull();
  });

  it('el correo trae el asunto y el código del reporte', () => {
    const enlace = enlaceCorreo(
      'oirs@maipu.cl',
      { id: 'abc123', descripcion: 'Bache profundo frente al paradero', categoria: 'calle_deteriorada', comuna: 'Maipú' },
      etiquetaCategoria,
    );
    const [destino, consulta] = enlace.split('?');
    const partes = Object.fromEntries(consulta.split('&').map((p) => p.split('=').map(decodeURIComponent)));
    expect(destino).toBe('mailto:oirs@maipu.cl');
    expect(partes['subject']).toBe('Reporte Calle deteriorada en Maipú · Ciudad Alerta');
    expect(partes['body']).toContain('Código del reporte: abc123');
  });
});
