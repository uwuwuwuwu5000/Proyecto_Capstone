/**
 * Maqueta de las pruebas de punta a punta: la app de verdad (rutas, módulos,
 * pantallas, guards, estilos, index.html), con Firebase y la nube reemplazados
 * por servicios simulados sobre una base en memoria (base.ts, servicios.ts).
 *
 * Se compila con `npm run e2e:compilar` (e2e/angular.json) y la abren las
 * pruebas de e2e/pruebas con Playwright. No forma parte de la app.
 */
import { bootstrapApplication } from '@angular/platform-browser';
import { NoPreloading, RouteReuseStrategy, provideRouter, withComponentInputBinding, withPreloading } from '@angular/router';
import { IonicRouteStrategy, provideIonicAngular } from '@ionic/angular';
import { initializeApp } from 'firebase/app';
import { disableNetwork, initializeFirestore } from 'firebase/firestore';

import { routes } from '../../src/app/app.routes';
import { AppComponent } from '../../src/app/app.component';
import { FIREBASE_APP, FIREBASE_AUTH, FIREBASE_STORAGE, FIRESTORE } from '../../src/app/core/firebase.providers';
import { provideModulos } from '../../src/app/nucleo/modulos';
import { AuthService } from '../../src/app/services/auth.service';
import { ReportQueryService } from '../../src/app/services/report-query.service';
import { RoutingService } from '../../src/app/services/routing.service';
import { TerminosService } from '../../src/app/services/terminos.service';
import { ReportService } from '../../src/app/modulos/reportes/datos/report.service';
import { ConfirmationService } from '../../src/app/modulos/reportes/datos/confirmation.service';
import { ContactoOrganismoService } from '../../src/app/modulos/reportes/datos/contacto-organismo.service';
import { CameraService } from '../../src/app/modulos/reportes/datos/camera.service';
import { PrivacidadService } from '../../src/app/modulos/reportes/datos/privacidad.service';
import { MiReporteService } from '../../src/app/modulos/reportes/datos/mi-reporte.service';
import { BorradorService } from '../../src/app/modulos/reportes/datos/borrador.service';
import { DuplicateDetectionService } from '../../src/app/modulos/reportes/datos/duplicate-detection.service';
import { AvisosService } from '../../src/app/modulos/avisos/datos/avisos.service';
import { ConfianzaService } from '../../src/app/modulos/confianza/datos/confianza.service';
import { VeredictoService } from '../../src/app/modulos/confianza/datos/veredicto.service';
import { CambioEstadoService } from '../../src/app/modulos/gestion-reportes/datos/cambio-estado.service';
import { ResumenGestionService } from '../../src/app/modulos/gestion-reportes/datos/resumen-gestion.service';
import { SupportService } from '../../src/app/modulos/soporte/datos/support.service';
import { PerfilService } from '../../src/app/modulos/perfil/datos/perfil.service';
import { EliminarCuentaService } from '../../src/app/modulos/perfil/datos/eliminar-cuenta.service';
import { OrganismosService } from '../../src/app/modulos/municipalidades/datos/organismos.service';
import {
  AuthFalso,
  AvisosFalsos,
  BorradorE2E,
  CamaraFalsa,
  ConfianzaFalsa,
  ConfirmacionesFalsas,
  ConsultasFalsas,
  ContactoFalso,
  EliminarCuentaE2E,
  GestionFalsa,
  MiReporteE2E,
  OrganismosFalso,
  PerfilFalso,
  PrivacidadFalsa,
  ReportesFalsos,
  ResumenGestionFalso,
  RuteoFalso,
  SoporteFalso,
  TerminosFalso,
  VeredictoFalso,
  deteccionE2E,
} from './servicios';

const app = initializeApp({ apiKey: 'e2e', projectId: 'demo-ciudad-alerta', appId: '1:000000000000:web:e2e' });

bootstrapApplication(AppComponent, {
  providers: [
    { provide: RouteReuseStrategy, useClass: IonicRouteStrategy },
    provideIonicAngular({ mode: 'md' }),
    provideRouter(routes, withPreloading(NoPreloading), withComponentInputBinding()),

    // Firebase sin red: lo usan solo para armar referencias (ids de documentos).
    { provide: FIREBASE_APP, useValue: app },
    { provide: FIREBASE_AUTH, useValue: null },
    { provide: FIREBASE_STORAGE, useValue: null },
    {
      provide: FIRESTORE,
      useFactory: () => {
        const firestore = initializeFirestore(app, {});
        void disableNetwork(firestore);
        return firestore;
      },
    },

    provideModulos(),

    // Lo que habla con Firebase o con la nube, contra la base en memoria.
    { provide: AuthService, useClass: AuthFalso },
    { provide: TerminosService, useClass: TerminosFalso },
    { provide: ReportQueryService, useClass: ConsultasFalsas },
    { provide: RoutingService, useClass: RuteoFalso },
    { provide: ReportService, useClass: ReportesFalsos },
    { provide: ConfirmationService, useClass: ConfirmacionesFalsas },
    { provide: ContactoOrganismoService, useClass: ContactoFalso },
    { provide: CameraService, useClass: CamaraFalsa },
    { provide: PrivacidadService, useClass: PrivacidadFalsa },
    { provide: MiReporteService, useClass: MiReporteE2E },
    { provide: BorradorService, useClass: BorradorE2E },
    { provide: DuplicateDetectionService, useFactory: deteccionE2E },
    { provide: AvisosService, useClass: AvisosFalsos },
    { provide: ConfianzaService, useClass: ConfianzaFalsa },
    { provide: VeredictoService, useClass: VeredictoFalso },
    { provide: CambioEstadoService, useClass: GestionFalsa },
    { provide: ResumenGestionService, useClass: ResumenGestionFalso },
    { provide: SupportService, useClass: SoporteFalso },
    { provide: PerfilService, useClass: PerfilFalso },
    { provide: EliminarCuentaService, useClass: EliminarCuentaE2E },
    { provide: OrganismosService, useClass: OrganismosFalso },
  ],
}).catch((error) => console.error(error));
