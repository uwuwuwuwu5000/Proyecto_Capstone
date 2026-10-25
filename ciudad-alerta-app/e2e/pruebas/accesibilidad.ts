import { Locator } from '@playwright/test';

/** Roles que se tocan o se llenan: todos necesitan un nombre que se pueda decir. */
const CONTROLES = 'button|link|textbox|checkbox|combobox|switch|radio|slider|tab|searchbox|spinbutton';
const SIN_NOMBRE = new RegExp(`^\\s*- (${CONTROLES})(\\s*\\[[^\\]]*\\])*\\s*:?\\s*$`);

/**
 * Botones, enlaces y campos sin nombre accesible dentro de `raiz`: lo que un
 * lector de pantalla (TalkBack, VoiceOver) anunciaría solo como «botón». Se
 * lee del árbol de accesibilidad del navegador, el mismo que usan ellos; un
 * ícono con `aria-label` o un campo con su etiqueta cuentan como nombre.
 */
export async function controlesSinNombre(raiz: Locator): Promise<string[]> {
  const arbol = await raiz.ariaSnapshot();
  return arbol
    .split('\n')
    .filter((linea) => SIN_NOMBRE.test(linea))
    .map((linea) => linea.trim());
}
