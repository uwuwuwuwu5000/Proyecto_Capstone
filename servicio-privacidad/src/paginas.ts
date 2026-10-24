import {
  DocumentoLegal,
  ELIMINAR_CUENTA,
  FECHA_TERMINOS,
  POLITICA_DE_PRIVACIDAD,
  TERMINOS_DE_USO,
} from '@ciudad-alerta/comun';

/**
 * Páginas públicas que pide Google Play: la política de privacidad y cómo
 * eliminar la cuenta. El texto es el mismo de la app (comun/src/legal), así
 * que las dos dicen siempre lo mismo. Sin JavaScript ni recursos externos.
 */

function escapar(texto: string): string {
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function documento(d: DocumentoLegal): string {
  const secciones = d.secciones
    .map((s) => `<h2>${escapar(s.titulo)}</h2>\n${s.parrafos.map((p) => `<p>${escapar(p)}</p>`).join('\n')}`)
    .join('\n');
  return `<section id="${d.id}"><h1>${escapar(d.titulo)}</h1>\n${secciones}</section>`;
}

function pagina(titulo: string, cuerpo: string): string {
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapar(titulo)} · Ciudad Alerta</title>
<style>
  :root { color-scheme: light dark; --fondo: #f8fafc; --texto: #111827; --suave: #5c677d; --senal: #0e7490; }
  @media (prefers-color-scheme: dark) { :root { --fondo: #111827; --texto: #f8fafc; --suave: #a5b4c3; --senal: #1ca9c9; } }
  body { margin: 0; background: var(--fondo); color: var(--texto);
    font: 16px/1.6 system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; }
  main { max-width: 640px; margin: 0 auto; padding: 24px 16px 48px; }
  header { display: flex; align-items: center; gap: 10px; font-weight: 700; color: var(--senal); }
  h1 { font-size: 1.5rem; margin: 32px 0 8px; color: var(--texto); }
  h2 { font-size: 1.05rem; margin: 24px 0 6px; }
  p { margin: 0 0 12px; }
  .nota { color: var(--suave); font-size: 0.9rem; }
  a { color: var(--senal); }
</style>
</head>
<body><main>
<header><svg width="28" height="28" viewBox="0 0 64 64" aria-hidden="true"><path fill="currentColor" d="M32 59s19-17.8 19-33a19 19 0 1 0-38 0c0 15.2 19 33 19 33z"/><rect x="29" y="13.5" width="6" height="15.5" rx="3" fill="#fff"/><circle cx="32" cy="36" r="3.4" fill="#fff"/></svg>Ciudad Alerta</header>
${cuerpo}
<p class="nota">Vigente desde ${escapar(FECHA_TERMINOS)}.</p>
</main></body>
</html>`;
}

/** /privacidad: términos de uso y política de privacidad. */
export function paginaPrivacidad(): string {
  return pagina(
    'Privacidad y términos',
    `${documento(POLITICA_DE_PRIVACIDAD)}\n${documento(TERMINOS_DE_USO)}\n<p><a href="/eliminar-cuenta">Cómo eliminar tu cuenta</a></p>`,
  );
}

/**
 * /eliminar-cuenta: cómo eliminarla desde la app y, si ya no se tiene, a
 * quién pedirlo (CORREO_CONTACTO en Render; sin él, se indica la app).
 */
export function paginaEliminarCuenta(correoContacto: string | null): string {
  const pedir = correoContacto
    ? `<h2>Si ya no tienes la app</h2><p>Escribe a <a href="mailto:${escapar(correoContacto)}?subject=${encodeURIComponent('Eliminar mi cuenta de Ciudad Alerta')}">${escapar(correoContacto)}</a> desde el correo con que te registraste, con el asunto «Eliminar mi cuenta». La eliminamos en un plazo de 30 días y te avisamos.</p>`
    : `<h2>Si ya no tienes la app</h2><p>Instálala de nuevo, entra con tu cuenta y elimínala desde «Mi perfil».</p>`;
  return pagina('Eliminar tu cuenta', `${documento(ELIMINAR_CUENTA)}\n${pedir}\n<p><a href="/privacidad">Política de privacidad</a></p>`);
}
