import { Provider } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideIonicAngular } from '@ionic/angular';

import { PHOTO_STORAGE, FirestorePhotoService } from '../app/modulos/reportes/datos/photo-storage.service';
import { UsuarioDePrueba, proveedoresFirebaseDePrueba } from './firebase-de-prueba';

/**
 * Lo mismo que registra `main.ts`, pero sin red: Ionic, un router vacío,
 * Firebase de prueba y el almacenamiento de fotos. `test-setup.ts` lo agrega a
 * todas las pruebas; una prueba puede sobrescribir cualquiera de estos
 * proveedores en su propio `TestBed.configureTestingModule`.
 */
export function proveedoresDePrueba(usuario: UsuarioDePrueba | null = null): (Provider | ReturnType<typeof provideRouter>)[] {
  return [
    provideIonicAngular({ mode: 'md' }),
    provideRouter([]),
    ...proveedoresFirebaseDePrueba(usuario),
    { provide: PHOTO_STORAGE, useExisting: FirestorePhotoService },
  ];
}
