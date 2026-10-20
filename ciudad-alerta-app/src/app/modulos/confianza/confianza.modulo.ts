import { authGuard } from '../../guards/auth-guard';
import { ModuloApp } from '../../nucleo/modulos/modulo.model';
import { RANURAS } from '../../nucleo/modulos/ranuras';

/**
 * Sistema de confianza (sistema_confianza.md): niveles, confirmaciones con
 * peso, reportes validados por la comunidad y «Mi nivel».
 *
 * No agrega botones al inicio: aparece dentro de otras pantallas mediante
 * ranuras. Al desactivarlo, el detalle vuelve a la confirmación simple, las
 * tarjetas pierden la insignia y el inicio pierde la tarjeta de nivel.
 *
 * Los números del sistema están en `comun/src/confianza/parametros.ts` (paquete
 * compartido con el portal) y deben coincidir
 * con firestore.rules.
 */
export const MODULO_CONFIANZA: ModuloApp = {
  id: 'confianza',
  nombre: 'Sistema de confianza',
  descripcion: 'Niveles de usuario, confirmaciones con peso, validación comunitaria y pantalla «Mi nivel».',
  rutas: [
    {
      path: 'mi-nivel',
      canActivate: [authGuard],
      loadComponent: () => import('./paginas/mi-nivel/mi-nivel.page').then((m) => m.MiNivelPage),
    },
  ],
  ranuras: [
    {
      ranura: RANURAS.detalleReporteVerificacion,
      cargar: () =>
        import('./componentes/verificacion-reporte/verificacion-reporte.component').then(
          (m) => m.VerificacionReporteComponent,
        ),
    },
    {
      ranura: RANURAS.tarjetaReporteInsignias,
      cargar: () =>
        import('./componentes/insignia-validacion.component').then((m) => m.InsigniaValidacionComponent),
    },
    {
      ranura: RANURAS.inicioResumen,
      cargar: () =>
        import('./componentes/resumen-confianza.component').then((m) => m.ResumenConfianzaComponent),
    },
  ],
};
