import { EnvironmentProviders, makeEnvironmentProviders } from '@angular/core';

import { environment } from '../../environments/environment';
import {
  CloudStoragePhotoService,
  FirestorePhotoService,
  PHOTO_STORAGE,
} from '../services/photo-storage.service';

/**
 * Punto único de decisión sobre dónde se guardan las fotografías.
 *
 * Cambiar `photoStorage` en `environment.ts` basta para migrar entre Firestore
 * y Cloud Storage: ni la página de reporte ni el servicio de reportes conocen
 * la implementación concreta.
 */
export function providePhotoStorage(): EnvironmentProviders {
  const usarCloudStorage = environment.photoStorage === 'cloud-storage';

  return makeEnvironmentProviders([
    {
      provide: PHOTO_STORAGE,
      useExisting: usarCloudStorage ? CloudStoragePhotoService : FirestorePhotoService,
    },
  ]);
}
