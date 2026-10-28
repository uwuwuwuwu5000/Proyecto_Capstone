import { Page } from '@playwright/test';

import { Apertura, Cuenta, abrir, esperarPantalla, expect, revisarTodaLaPantalla, test, vista } from './ayudas';
import { controlesSinNombre } from './accesibilidad';
import { describir } from './legibilidad';

/**
 * Cada pantalla de la app, con la cuenta que la usa: abre sin errores en la
 * consola, muestra contenido y se lee bien en el tema oscuro y en el claro
 * (contraste y nada que se salga de la pantalla), también con el texto en
 * «Muy grande». Además, cada botón, enlace o campo tiene un nombre que un
 * lector de pantalla pueda decir (TalkBack, VoiceOver).
 */

interface Pantalla {
  nombre: string;
  ruta: string;
  como: Cuenta;
  /** Un texto que la pantalla debe mostrar. */
  muestra: RegExp;
  /** Algo que hacer antes de revisar (abrir una pestaña, por ejemplo). */
  antes?: (page: Page) => Promise<void>;
  /** Datos de prueba adicionales (ver e2e/maqueta/escenario.ts). */
  escenario?: Apertura['escenario'];
}

export const PANTALLAS: Pantalla[] = [
  { nombre: 'Iniciar sesión', ruta: '/login', como: null, muestra: /Entrar/ },
  {
    nombre: 'Crear cuenta',
    ruta: '/login',
    como: null,
    muestra: /Acepto los términos/,
    antes: async (page) => {
      await page.locator('ion-segment-button[value="registro"]').click();
    },
  },
  { nombre: 'Términos y privacidad', ruta: '/terminos', como: null, muestra: /privacidad/i },
  { nombre: 'Bienvenida', ruta: '/bienvenida', como: 'ana', muestra: /Reporta lo que ves/ },
  { nombre: 'Inicio de una vecina', ruta: '/home', como: 'ana', muestra: /Hola, Ana/ },
  { nombre: 'Crear un reporte', ruta: '/report-new', como: 'ana', muestra: /Evidencia/ },
  {
    nombre: 'Elegir el punto del reporte en el mapa',
    ruta: '/report-new',
    como: 'ana',
    muestra: /Punto elegido/,
    antes: async (page) => {
      await vista(page).getByRole('button', { name: 'Elegir en el mapa' }).click();
    },
  },
  { nombre: 'Crear un reporte con una cuenta nueva', ruta: '/report-new', como: 'nueva', muestra: /te faltan 5 días/ },
  { nombre: 'Mis reportes', ruta: '/my-reports', como: 'ana', muestra: /Luminaria apagada/ },
  { nombre: 'Detalle de un reporte propio', ruta: '/report/r_ana_nuevo', como: 'ana', muestra: /Tu reporte/ },
  { nombre: 'Detalle con seguimiento', ruta: '/report/r_ana_proceso', como: 'ana', muestra: /Cuadrilla programada/ },
  { nombre: 'Detalle de un reporte ajeno', ruta: '/report/r_luis', como: 'ana', muestra: /Fuga de agua/ },
  { nombre: 'Mapa de incidencias', ruta: '/map', como: 'ana', muestra: /Metropolitana/ },
  { nombre: 'Cerca de mí', ruta: '/nearby', como: 'ana', muestra: /Fuga de agua/ },
  { nombre: 'Avisos', ruta: '/avisos', como: 'ana', muestra: /Cuadrilla programada/ },
  { nombre: 'Mi nivel', ruta: '/mi-nivel', como: 'ana', muestra: /Nivel 2/ },
  { nombre: 'Mi perfil', ruta: '/perfil', como: 'ana', muestra: /Eliminar mi cuenta/ },
  { nombre: 'Configuración', ruta: '/configuracion', como: 'ana', muestra: /Tamaño del texto/ },
  { nombre: 'Quejas y sugerencias', ruta: '/support', como: 'ana', muestra: /La foto tarda mucho/ },
  { nombre: 'Nueva queja', ruta: '/support-new', como: 'ana', muestra: /Asunto/ },
  { nombre: 'Conversación de soporte', ruta: '/support/t_ana', como: 'ana', muestra: /lo estamos revisando/ },
  { nombre: 'Inicio de una operadora', ruta: '/home', como: 'op', muestra: /Por atender/ },
  { nombre: 'Bandeja de la operadora', ruta: '/admin-reports', como: 'op', muestra: /Fuga de agua/ },
  { nombre: 'Detalle con gestión', ruta: '/report/r_luis', como: 'op', muestra: /Gestión|En revisión/ },
  { nombre: 'Inicio de un administrador', ruta: '/home', como: 'admin', muestra: /Gestión/ },
  { nombre: 'Municipalidades', ruta: '/admin-organismos', como: 'admin', muestra: /Municipalidades|municipalidades/ },
  { nombre: 'Bandeja de soporte', ruta: '/support-inbox', como: 'admin', muestra: /La foto tarda mucho/ },
  { nombre: 'Configuración del equipo', ruta: '/configuracion', como: 'admin', muestra: /Módulos de esta versión/ },
  { nombre: 'Inicio de un organismo', ruta: '/home', como: 'orgmaipu', muestra: /Reportes validados/ },
  {
    nombre: 'Reportes validados del organismo',
    ruta: '/validados',
    como: 'orgmaipu',
    muestra: /2 reportes validados/,
    escenario: { conValidados: true },
  },
  {
    nombre: 'Detalle de un reporte validado, visto por el organismo',
    ruta: '/report/r_val_luminaria',
    como: 'orgmaipu',
    muestra: /llegó a tu organismo/,
    escenario: { conValidados: true },
  },
];

for (const pantalla of PANTALLAS) {
  test.describe(pantalla.nombre, () => {
    for (const tema of ['oscuro', 'claro'] as const) {
      test(`se lee bien en tema ${tema}`, async ({ page }) => {
        await abrir(page, pantalla.ruta, { como: pantalla.como, tema, escenario: pantalla.escenario });
        if (pantalla.antes) {
          await pantalla.antes(page);
          await esperarPantalla(page);
        }
        // Visible: las opciones de un selector cerrado también tienen texto.
        await expect(vista(page).getByText(pantalla.muestra).filter({ visible: true }).first()).toBeVisible();

        const problemas = await revisarTodaLaPantalla(page);
        expect(problemas, `Problemas de legibilidad en «${pantalla.nombre}» (tema ${tema}):\n${describir(problemas)}`).toEqual([]);

        if (tema === 'oscuro') {
          expect(await controlesSinNombre(vista(page)), `Controles sin nombre para el lector de pantalla en «${pantalla.nombre}»`).toEqual([]);
        }
      });
    }

    test('con el texto «Muy grande» nada se sale de la pantalla', async ({ page }) => {
      await abrir(page, pantalla.ruta, { como: pantalla.como, texto: 'muy-grande', escenario: pantalla.escenario });
      if (pantalla.antes) {
        await pantalla.antes(page);
        await esperarPantalla(page);
      }
      const desbordes = (await revisarTodaLaPantalla(page)).filter((p) => p.tipo === 'desborde');
      expect(desbordes, `Se sale de la pantalla en «${pantalla.nombre}» con texto muy grande:\n${describir(desbordes)}`).toEqual([]);
    });
  });
}
