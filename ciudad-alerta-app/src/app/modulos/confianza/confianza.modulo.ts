import { authGuard } from '../../guards/auth-guard';
import { ModuloApp } from '../../nucleo/modulos/modulo.model';
import { RANURAS } from '../../nucleo/modulos/ranuras';

/**
 * Sistema de confianza (sistema_confianza.md): niveles, confirmaciones con
 * peso, reportes validados por la comunidad y «Mi nivel».
 *
 * No agrega botones al inicio: aparece dentro de otras pantallas mediante
 * ranuras. Al desactivarlo, el detalle vuelve a la confirmación simple, las
 * tarjetas pierden la insignia, el inicio pierde la tarjeta de nivel y nadie
 * puede dar veredictos.
 *
 * El veredicto (sección 4.4) lo da quien gestiona el reporte, en el bloque
 * «Gestión» del detalle: componentes/veredicto-reporte y
 * datos/veredicto.service.ts.
 *
 * Los números del sistema están en `comun/src/confianza/parametros.ts` (paquete
 * compartido con el portal) y deben coincidir
 * con firestore.rules.
 */
export const MODULO_CONFIANZA: ModuloApp = {
  id: 'confianza',
  nombre: 'Sistema de confianza',
  descripcion: 'Niveles de usuario, confirmaciones con peso, validación comunitaria, veredicto del gestor y pantalla «Mi nivel».',
  // Confirma reportes y «Mi nivel» enlaza a ellos.
  requiere: ['reportes'],
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
      // Veredicto «Es real / Es falso», bajo el cambio de estado.
      ranura: RANURAS.detalleReporteGestion,
      orden: 10,
      cargar: () =>
        import('./componentes/veredicto-reporte/veredicto-reporte.component').then(
          (m) => m.VeredictoReporteComponent,
        ),
    },
    {
      ranura: RANURAS.tarjetaReporteInsignias,
      cargar: () =>
        import('./componentes/insignia-validacion.component').then((m) => m.InsigniaValidacionComponent),
    },
    {
      // Después de «Tus reportes» y «Por atender».
      ranura: RANURAS.inicioResumen,
      orden: 10,
      cargar: () =>
        import('./componentes/resumen-confianza.component').then((m) => m.ResumenConfianzaComponent),
    },
    {
      // La misma tarjeta en «Mi perfil», si ese módulo está activo.
      ranura: RANURAS.perfilResumen,
      cargar: () =>
        import('./componentes/resumen-confianza.component').then((m) => m.ResumenConfianzaComponent),
    },
  ],
};
