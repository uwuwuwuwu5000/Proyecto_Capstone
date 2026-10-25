import { bootstrapApplication } from '@angular/platform-browser';
import { enableProdMode } from '@angular/core';
import { provideRouter, RouteReuseStrategy } from '@angular/router';
import { IonicRouteStrategy, provideIonicAngular } from '@ionic/angular';

import { routes } from './app/app.routes';
import { AppComponent } from './app/app.component';
import { OPCIONES_DEL_ENRUTADOR } from './app/core/enrutador';
import { provideFirebase } from './app/core/firebase.providers';
import { provideModulos } from './app/nucleo/modulos';
import { environment } from './environments/environment';

if (environment.production) {
  enableProdMode();
}

bootstrapApplication(AppComponent, {
  providers: [
    { provide: RouteReuseStrategy, useClass: IonicRouteStrategy },
    provideIonicAngular({ mode: 'md' }),
    // Sin precarga, con los parámetros como inputs y avisando si una pantalla
    // no se pudo abrir (core/enrutador.ts).
    provideRouter(routes, ...OPCIONES_DEL_ENRUTADOR),

    // CA-45 / CA-78 · App, Auth y Firestore del SDK modular de Firebase.
    provideFirebase(),

    // Servicios de arranque e íconos de los módulos activos (modulos.config.ts).
    // El almacenamiento de fotografías lo registra el módulo de reportes.
    provideModulos(),
  ],
}).catch((err) => console.error(err));
