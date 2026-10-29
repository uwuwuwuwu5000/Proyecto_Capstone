/**
 * Términos de uso, política de privacidad y cómo eliminar la cuenta.
 *
 * Una sola copia del texto para la app (pantalla «Términos y privacidad»),
 * el servicio de Render (páginas públicas /privacidad y /eliminar-cuenta,
 * que pide Google Play) y, cuando quiera, el portal.
 *
 * Si el texto cambia de forma que la persona deba volver a aceptarlo, sube
 * VERSION_TERMINOS: la app se lo pedirá a cada cuenta al entrar.
 */

export const VERSION_TERMINOS = '2026-11';
export const FECHA_TERMINOS = 'noviembre de 2026';

/** Nombre con el que quedan los reportes de una cuenta eliminada. */
export const AUTOR_CUENTA_ELIMINADA = 'Cuenta eliminada';

export interface SeccionLegal {
  titulo: string;
  parrafos: readonly string[];
}

export interface DocumentoLegal {
  id: 'terminos' | 'privacidad' | 'eliminar-cuenta';
  titulo: string;
  secciones: readonly SeccionLegal[];
}

export const TERMINOS_DE_USO: DocumentoLegal = {
  id: 'terminos',
  titulo: 'Términos de uso',
  secciones: [
    {
      titulo: 'Qué es Ciudad Alerta',
      parrafos: [
        'Ciudad Alerta es una aplicación para reportar problemas de la ciudad (microbasurales, luminarias, fugas de agua, árboles, calles, accesibilidad) con foto y ubicación, y seguir lo que hace el organismo responsable.',
        'La desarrolla un equipo de estudiantes como proyecto de título (Capstone 2026, Duoc UC). Solo los organismos que participan en el proyecto reciben los reportes.',
      ],
    },
    {
      titulo: 'No es un servicio de emergencias',
      parrafos: [
        'Si hay peligro para personas o bienes, llama: 133 Carabineros, 132 Bomberos o 131 Ambulancia (SAMU). Un reporte no garantiza una respuesta inmediata.',
      ],
    },
    {
      titulo: 'Cómo usarla bien',
      parrafos: [
        'Reporta problemas reales, en el lugar donde están, con fotos del problema. No subas datos de otras personas, contenido ofensivo ni publicidad.',
        'Quien gestiona un reporte puede marcarlo como real o falso: eso cambia tu nivel de confianza. El equipo puede suspender confirmaciones o retirar contenido que no cumpla estos términos.',
      ],
    },
    {
      titulo: 'Lo que publicas',
      parrafos: [
        'La descripción, la foto (con caras y personas difuminadas) y la ubicación de tus reportes las ven el organismo que los atiende y las demás personas con cuenta, para confirmar y seguir el problema. Al publicarlos, autorizas que se muestren con ese fin.',
        'Mientras nadie revise tu reporte, puedes corregir la descripción o retirarlo.',
      ],
    },
    {
      titulo: 'Cambios',
      parrafos: [
        'Si estos términos o la política de privacidad cambian, la app te pedirá aceptarlos de nuevo antes de seguir.',
      ],
    },
  ],
};

export const POLITICA_DE_PRIVACIDAD: DocumentoLegal = {
  id: 'privacidad',
  titulo: 'Política de privacidad',
  secciones: [
    {
      titulo: 'Quién es responsable',
      parrafos: [
        'El equipo del proyecto Ciudad Alerta (Capstone 2026, Duoc UC). Puedes escribirnos desde «Quejas y sugerencias» en la app.',
      ],
    },
    {
      titulo: 'Qué datos guardamos',
      parrafos: [
        'De tu cuenta: correo y nombre. La contraseña la guarda Firebase Authentication; el equipo no puede verla.',
        'De cada reporte: descripción, categoría, ubicación exacta, comuna, fecha y la foto ya difuminada.',
        'De tu actividad: las confirmaciones que das, tu nivel de confianza, los avisos que viste y tus mensajes a soporte.',
        'En tu teléfono, y solo ahí: tus preferencias de Configuración y algunas copias para que la app cargue rápido.',
      ],
    },
    {
      titulo: 'Para qué los usamos',
      parrafos: [
        'Para identificarte, enviar cada reporte al organismo de su comuna, mostrar el mapa, avisar de reportes parecidos, calcular el nivel de confianza y responder a soporte. No los vendemos ni los usamos para publicidad.',
      ],
    },
    {
      titulo: 'Ubicación y fotos',
      parrafos: [
        'La ubicación se pide solo al crear un reporte, y se guarda la del reporte: la app no sigue dónde estás.',
        'Antes de publicarse, cada foto pasa por un servicio del proyecto alojado en Render (servidores en Estados Unidos) que difumina caras y personas. Ese servicio no guarda la foto: la devuelve difuminada y se publica solo esa.',
      ],
    },
    {
      titulo: 'Quién los ve',
      parrafos: [
        'Las demás personas con cuenta ven tus reportes, pero no tu correo. El organismo que atiende el reporte y los administradores ven además tu nombre.',
        'Los datos se guardan en Google Firebase (Authentication y Firestore). Las fotos se procesan en Render. Ninguno de los dos los usa para fines propios.',
      ],
    },
    {
      titulo: 'Cuánto tiempo',
      parrafos: [
        'Mientras tengas tu cuenta. Si la eliminas, se borran tu correo y tu nombre, y tus reportes quedan anónimos («Cuenta eliminada»): siguen siendo parte del historial de problemas del barrio.',
      ],
    },
    {
      titulo: 'Tus derechos',
      parrafos: [
        'Según la ley chilena de protección de datos personales (Ley 19.628, y la Ley 21.719 desde el 1 de diciembre de 2026), puedes pedir acceder a tus datos, corregirlos, suprimirlos, oponerte a su uso, llevártelos o bloquearlos temporalmente.',
        'Tu nombre lo corriges en «Mi perfil»; tu cuenta la eliminas en «Mi perfil» → «Eliminar mi cuenta». Para lo demás, escríbenos desde «Quejas y sugerencias».',
      ],
    },
    {
      titulo: 'Menores de edad',
      parrafos: [
        'Si tienes menos de 14 años, necesitas la autorización de tu madre, padre o tutor para usar la app.',
      ],
    },
  ],
};

export const ELIMINAR_CUENTA: DocumentoLegal = {
  id: 'eliminar-cuenta',
  titulo: 'Eliminar tu cuenta de Ciudad Alerta',
  secciones: [
    {
      titulo: 'Desde la app',
      parrafos: [
        'Abre Ciudad Alerta, entra a «Mi perfil» y toca «Eliminar mi cuenta». Te pedirá tu contraseña para confirmar.',
      ],
    },
    {
      titulo: 'Qué se borra',
      parrafos: [
        'Tu correo, tu nombre y tu acceso. Tu sesión se cierra en ese momento y no puedes volver a entrar con esa cuenta.',
      ],
    },
    {
      titulo: 'Qué se conserva',
      parrafos: [
        'Tus reportes, sin tu nombre: aparecen como «Cuenta eliminada», porque son parte del historial de problemas del barrio y del trabajo de la municipalidad. Tus mensajes a soporte quedan sin datos de contacto.',
      ],
    },
  ],
};

export const DOCUMENTOS_LEGALES: readonly DocumentoLegal[] = [TERMINOS_DE_USO, POLITICA_DE_PRIVACIDAD];

/** La cuenta aceptó la versión vigente. */
export function terminosAceptados(version: string | null | undefined): boolean {
  return version === VERSION_TERMINOS;
}
