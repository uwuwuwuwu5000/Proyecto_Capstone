import { CONFIG_MODULOS } from '../../modulos.config';
import { cargarPieza, entrada, moduloDePrueba } from '../../../testing/modulos-de-prueba';
import { RANURAS } from './ranuras';
import {
  accesosParaRol,
  aportesDeRanura,
  gruposDeInicio,
  iconosDeModulos,
  modulosActivos,
  problemasDeConfiguracion,
  rutasDeModulos,
  seccionDeAcceso,
  textoDeAcceso,
} from './registro';
import { usarEntornoDePrueba } from '../../../testing';

const icono = { 'icono-a': 'data:a' };

usarEntornoDePrueba();

describe('registro de módulos', () => {
  it('solo cuenta los módulos activos', () => {
    const config = [entrada(moduloDePrueba('a')), entrada(moduloDePrueba('b'), false)];
    expect(modulosActivos(config).map((m) => m.id)).toEqual(['a']);
  });

  describe('problemasDeConfiguracion', () => {
    it('sin problemas en una configuración correcta', () => {
      expect(problemasDeConfiguracion([entrada(moduloDePrueba('a')), entrada(moduloDePrueba('b', { requiere: ['a'] }))])).toEqual([]);
    });

    it('detecta una dependencia desactivada o inexistente', () => {
      const problemas = problemasDeConfiguracion([
        entrada(moduloDePrueba('a'), false),
        entrada(moduloDePrueba('b', { requiere: ['a', 'fantasma'] })),
      ]);
      expect(problemas).toEqual([
        "'b' requiere 'a', que está desactivado.",
        "'b' requiere 'fantasma', que no existe en modulos.config.ts.",
      ]);
    });

    it('un módulo desactivado no exige sus dependencias', () => {
      expect(problemasDeConfiguracion([entrada(moduloDePrueba('b', { requiere: ['a'] }), false)])).toEqual([]);
    });

    it('detecta ids, rutas y accesos repetidos', () => {
      const acceso = { id: 'boton', texto: 'X', icono: 'icono-a', ruta: '/x', orden: 1 };
      const problemas = problemasDeConfiguracion([
        entrada(moduloDePrueba('a', { rutas: [{ path: 'x' }], accesos: [acceso], iconos: icono })),
        entrada(moduloDePrueba('b', { rutas: [{ path: 'x' }], accesos: [acceso], iconos: icono })),
        entrada(moduloDePrueba('a')),
      ]);
      expect(problemas).toContain("El módulo 'a' aparece dos veces en modulos.config.ts.");
      expect(problemas).toContain("La ruta '/x' está en 'a' y en 'b'.");
      expect(problemas).toContain("El acceso 'boton' está en 'a' y en 'b'.");
    });

    it('detecta un ícono sin registrar y una ranura que no existe', () => {
      const problemas = problemasDeConfiguracion([
        entrada(
          moduloDePrueba('a', {
            accesos: [{ id: 'boton', texto: 'X', icono: 'sin-registrar', ruta: '/x', orden: 1 }],
            ranuras: [{ ranura: 'no.existe' as never, cargar: cargarPieza() }],
          }),
        ),
      ]);
      expect(problemas).toEqual([
        "El acceso 'boton' usa el ícono 'sin-registrar', que no está en 'iconos' de 'a'.",
        "'a' aporta a la ranura 'no.existe', que no existe en ranuras.ts.",
      ]);
    });
  });

  it('accesos: filtrados por rol y ordenados', () => {
    const config = [
      entrada(
        moduloDePrueba('a', {
          accesos: [
            { id: 'staff', texto: 'Gestión', icono: 'i', ruta: '/g', orden: 100, roles: ['admin', 'operador'] },
            { id: 'todos', texto: 'Mapa', icono: 'i', ruta: '/m', orden: 20 },
          ],
        }),
      ),
      entrada(moduloDePrueba('b', { accesos: [{ id: 'primero', texto: 'Crear', icono: 'i', ruta: '/c', orden: 10 }] })),
    ];

    expect(accesosParaRol(config, 'ciudadano').map((a) => a.id)).toEqual(['primero', 'todos']);
    expect(accesosParaRol(config, 'operador').map((a) => a.id)).toEqual(['primero', 'todos', 'staff']);
    // Sin perfil todavía (cargando o sin red) no se muestran los de staff.
    expect(accesosParaRol(config, null).map((a) => a.id)).toEqual(['primero', 'todos']);
  });

  it('accesos: la cuenta de organismo solo ve los que la incluyen (por defecto, ninguno)', () => {
    const config = [
      entrada(
        moduloDePrueba('a', {
          accesos: [
            { id: 'crear', texto: 'Crear', icono: 'i', ruta: '/c', orden: 10 },
            { id: 'validados', texto: 'Reportes validados', icono: 'i', ruta: '/v', orden: 5, roles: ['organismo'] },
            { id: 'perfil', texto: 'Mi perfil', icono: 'i', ruta: '/p', orden: 90, paraOrganismo: true },
            { id: 'staff', texto: 'Gestión', icono: 'i', ruta: '/g', orden: 100, roles: ['admin', 'operador'] },
          ],
        }),
      ),
    ];

    expect(accesosParaRol(config, 'organismo').map((a) => a.id)).toEqual(['validados', 'perfil']);
    // Para los demás roles, paraOrganismo no cambia nada y el botón del organismo no aparece.
    expect(accesosParaRol(config, 'ciudadano').map((a) => a.id)).toEqual(['crear', 'perfil']);
    expect(accesosParaRol(config, 'operador').map((a) => a.id)).toEqual(['crear', 'perfil', 'staff']);
  });

  it('texto del acceso según el rol', () => {
    const acceso = { id: 'g', texto: 'Todas las incidencias', textoSegunRol: { operador: 'Reportes asignados' }, icono: 'i', ruta: '/g', orden: 1 };
    expect(textoDeAcceso(acceso, 'operador')).toBe('Reportes asignados');
    expect(textoDeAcceso(acceso, 'admin')).toBe('Todas las incidencias');
    expect(textoDeAcceso(acceso, null)).toBe('Todas las incidencias');
  });

  it('aportes a una ranura: solo de módulos activos y por orden', () => {
    const tarde = { ranura: RANURAS.inicioResumen, orden: 5, cargar: cargarPieza() };
    const pronto = { ranura: RANURAS.inicioResumen, orden: -10, cargar: cargarPieza() };
    const otra = { ranura: RANURAS.cabeceraAcciones, cargar: cargarPieza() };
    const apagado = { ranura: RANURAS.inicioResumen, orden: -100, cargar: cargarPieza() };
    const config = [
      entrada(moduloDePrueba('a', { ranuras: [tarde, otra] })),
      entrada(moduloDePrueba('b', { ranuras: [pronto] })),
      entrada(moduloDePrueba('c', { ranuras: [apagado] }), false),
    ];
    expect(aportesDeRanura(config, RANURAS.inicioResumen)).toEqual([pronto, tarde]);
  });

  it('rutas e íconos de los módulos activos', () => {
    const config = [
      entrada(moduloDePrueba('a', { rutas: [{ path: 'a' }], iconos: { x: '1' } })),
      entrada(moduloDePrueba('b', { rutas: [{ path: 'b' }], iconos: { y: '2' } }), false),
    ];
    expect(rutasDeModulos(config).map((r) => r.path)).toEqual(['a']);
    expect(iconosDeModulos(config)).toEqual({ x: '1' });
  });
});

describe('modulos.config.ts (la configuración real)', () => {
  it('no tiene problemas', () => {
    expect(problemasDeConfiguracion(CONFIG_MODULOS)).toEqual([]);
  });

  it('cada módulo se puede desactivar: solo se quejan los que lo requieren', () => {
    for (const { modulo } of CONFIG_MODULOS) {
      const sinEste = CONFIG_MODULOS.map((e) => (e.modulo.id === modulo.id ? { ...e, activo: false } : e));
      const dependientes = CONFIG_MODULOS.filter((e) => e.activo && e.modulo.requiere?.includes(modulo.id)).map(
        (e) => e.modulo.id,
      );

      const problemas = problemasDeConfiguracion(sinEste);

      expect(problemas.length, `al desactivar '${modulo.id}'`).toBe(dependientes.length);
      for (const id of dependientes) {
        expect(problemas).toContain(`'${id}' requiere '${modulo.id}', que está desactivado.`);
      }
    }
  });

  it('las rutas de los módulos no chocan con las del esqueleto', () => {
    const rutas = rutasDeModulos(CONFIG_MODULOS).map((r) => r.path);
    for (const propia of ['', 'login', 'home', '**']) {
      expect(rutas).not.toContain(propia);
    }
  });

  it('toda ranura con aportes existe y todo aporte se puede descargar', async () => {
    const aportes = CONFIG_MODULOS.flatMap((e) => e.modulo.ranuras ?? []);
    const componentes = await Promise.all(aportes.map((a) => a.cargar()));
    expect(componentes.every((c) => typeof c === 'function')).toBe(true);
  });
});

describe('grupos del inicio', () => {
  const config = [
    entrada(
      moduloDePrueba('a', {
        accesos: [
          { id: 'crear', texto: 'Crear', icono: 'i', ruta: '/c', orden: 10, estilo: 'principal' },
          { id: 'mapa', texto: 'Mapa', icono: 'i', ruta: '/m', orden: 20, seccion: 'explorar' },
          { id: 'mios', texto: 'Mis reportes', icono: 'i', ruta: '/r', orden: 40 },
          { id: 'bandeja', texto: 'Bandeja', icono: 'i', ruta: '/b', orden: 100, estilo: 'gestion', roles: ['admin'] },
        ],
      }),
    ),
  ];

  it('reparte los botones en principal, explorar, cuenta y gestión', () => {
    expect(gruposDeInicio(config, 'admin').map((g) => [g.id, g.titulo, g.accesos.map((a) => a.id)])).toEqual([
      ['principal', null, ['crear']],
      ['explorar', 'Explorar', ['mapa']],
      ['cuenta', 'Tu cuenta', ['mios']],
      ['gestion', 'Gestión', ['bandeja']],
    ]);
  });

  it('no deja grupos vacíos (un ciudadano no ve «Gestión»)', () => {
    expect(gruposDeInicio(config, 'ciudadano').map((g) => g.id)).toEqual(['principal', 'explorar', 'cuenta']);
  });

  it('sin sección declarada, la deduce del estilo', () => {
    expect(seccionDeAcceso({ id: 'x', texto: 'X', icono: 'i', ruta: '/x', orden: 1, estilo: 'gestion' })).toBe('gestion');
    expect(seccionDeAcceso({ id: 'x', texto: 'X', icono: 'i', ruta: '/x', orden: 1 })).toBe('cuenta');
  });

  it('en la configuración real, mapa y cerca de mí van en «Explorar»', () => {
    const explorar = gruposDeInicio(CONFIG_MODULOS, 'ciudadano').find((g) => g.id === 'explorar');
    expect(explorar?.accesos.map((a) => a.id)).toEqual(['mapa-incidencias', 'cercanos']);
  });
});
