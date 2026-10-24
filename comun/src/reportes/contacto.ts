import type { CategoriaReporte } from './categorias';

/**
 * Contacto con quien atiende un reporte, y números de emergencia.
 *
 * Ciudad Alerta no atiende emergencias: si hay peligro inmediato, la app lo
 * dice y ofrece llamar. Los números son los nacionales de Chile.
 */
export interface NumeroDeEmergencia {
  numero: string;
  nombre: string;
}

export const NUMEROS_DE_EMERGENCIA: readonly NumeroDeEmergencia[] = [
  { numero: '133', nombre: 'Carabineros' },
  { numero: '132', nombre: 'Bomberos' },
  { numero: '131', nombre: 'Ambulancia (SAMU)' },
];

/** Cuándo una categoría puede ser un peligro inmediato, dicho para el vecino. */
const RIESGOS: Partial<Record<CategoriaReporte, string>> = {
  arbol_peligroso: 'Si el árbol cayó o puede caer sobre personas, casas o cables',
  luminaria: 'Si hay cables cortados, chispas o un poste caído',
  fuga_agua: 'Si el agua inunda una casa o abrió un hoyo en la calle',
  calle_deteriorada: 'Si hay un socavón que pone en riesgo a autos o peatones',
};

/** El aviso de peligro de la categoría, o null si no corresponde. */
export function riesgoDeCategoria(categoria: string | null | undefined): string | null {
  return categoria ? (RIESGOS[categoria as CategoriaReporte] ?? null) : null;
}

/**
 * `tel:` listo para un enlace: solo dígitos y un + inicial. null si no queda
 * un número que marcar (menos de 3 dígitos).
 */
export function enlaceTelefono(telefono: string | null | undefined): string | null {
  const limpio = (telefono ?? '').trim().replace(/[^\d+]/g, '').replace(/(?!^)\+/g, '');
  return limpio.replace('+', '').length >= 3 ? `tel:${limpio}` : null;
}

/** Correo con forma de correo, o null. */
export function correoValido(correo: string | null | undefined): string | null {
  const limpio = (correo ?? '').trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(limpio) ? limpio : null;
}

/**
 * `mailto:` con el asunto y el cuerpo ya escritos, para que el vecino solo
 * agregue lo suyo. Incluye el código del reporte para que el organismo lo
 * encuentre.
 */
export function enlaceCorreo(
  correo: string,
  reporte: { id: string; descripcion: string; categoria: string; comuna?: string | null },
  etiquetaCategoria: (id: string) => string,
): string {
  const resumen = reporte.descripcion.length > 80 ? `${reporte.descripcion.slice(0, 77)}…` : reporte.descripcion;
  const asunto = `Reporte ${etiquetaCategoria(reporte.categoria)}${reporte.comuna ? ` en ${reporte.comuna}` : ''} · Ciudad Alerta`;
  const cuerpo = [
    'Hola:',
    '',
    `Les escribo por el reporte «${resumen}», que hice con Ciudad Alerta.`,
    `Código del reporte: ${reporte.id}`,
    '',
    '',
  ].join('\n');
  return `mailto:${correo}?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(cuerpo)}`;
}
