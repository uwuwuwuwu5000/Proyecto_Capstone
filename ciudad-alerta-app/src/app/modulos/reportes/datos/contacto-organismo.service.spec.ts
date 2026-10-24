import { TestBed } from '@angular/core/testing';

import { ContactoOrganismoService, contactoDeOperador } from './contacto-organismo.service';
import { usarEntornoDePrueba } from '../../../../testing';

usarEntornoDePrueba();

describe('ContactoOrganismoService', () => {
  it('sin operador asignado no consulta nada', async () => {
    expect(await TestBed.inject(ContactoOrganismoService).deOperador(null)).toBeNull();
  });

  it('arma el contacto con lo que publicó el organismo', () => {
    expect(
      contactoDeOperador({
        activo: true,
        telefonoContacto: ' +56 2 2677 6000 ',
        correoContacto: 'oirs@maipu.cl',
        direccionContacto: ' Av. Cinco de Abril 0260 ',
      }),
    ).toEqual({
      telefono: 'tel:+56226776000',
      telefonoVisible: '+56 2 2677 6000',
      correo: 'oirs@maipu.cl',
      direccion: 'Av. Cinco de Abril 0260',
    });
  });

  it('descarta lo que no sirve y no muestra operadores inactivos', () => {
    expect(contactoDeOperador({ activo: true, telefonoContacto: 'sin número', correoContacto: 'no-es-correo' })).toEqual({
      telefono: null,
      telefonoVisible: null,
      correo: null,
      direccion: null,
    });
    expect(contactoDeOperador({ activo: false, telefonoContacto: '226776000' })).toBeNull();
  });
});
