import { bootstrapApplication } from '@angular/platform-browser';
import { enableProdMode } from '@angular/core';
import {
  NoPreloading,
  provideRouter,
  RouteReuseStrategy,
  withComponentInputBinding,
  withPreloading,
} from '@angular/router';
import { IonicRouteStrategy, provideIonicAngular } from '@ionic/angular';

import { routes } from './app/app.routes';
import { AppComponent } from './app/app.component';
import { provideFirebase } from './app/core/firebase.providers';
import { providePhotoStorage } from './app/core/photo-storage.providers';
import { environment } from './environments/environment';

if (environment.production) {
  enableProdMode();
}

bootstrapApplication(AppComponent, {
  providers: [
    { provide: RouteReuseStrategy, useClass: IonicRouteStrategy },
    provideIonicAngular({ mode: 'md' }),
    /**
     * BUG 69 · NoPreloading en lugar de PreloadAllModules: con la precarga, el
     * arranque descargaba también los paquetes de TensorFlow y Leaflet aunque
     * el usuario solo fuera a iniciar sesión. Cada pantalla carga su código al
     * visitarse por primera vez.
     *
     * withComponentInputBinding permite que `report/:id` llegue al input `id`
     * del componente de detalle sin inyectar ActivatedRoute.
     */
    provideRouter(routes, withPreloading(NoPreloading), withComponentInputBinding()),

    // CA-45 / CA-78 · App, Auth y Firestore del SDK modular de Firebase.
    provideFirebase(),

    // Selecciona la implementación de almacenamiento de fotografías.
    providePhotoStorage(),
  ],
}).catch((err) => console.error(err));
