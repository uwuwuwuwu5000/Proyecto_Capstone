import { MODULO_REPORTES } from './reportes.modulo';
import { RUTAS_REPORTES } from './rutas';

describe('RUTAS_REPORTES', () => {
  const rutas = (MODULO_REPORTES.rutas ?? []).map((r) => `/${r.path}`);

  it('coinciden con las rutas que declara el manifiesto', () => {
    expect(rutas).toContain(RUTAS_REPORTES.crear);
    expect(rutas).toContain(RUTAS_REPORTES.mios);
    expect(rutas).toContain(RUTAS_REPORTES.detalle(':id').join('/'));
  });

  it('el detalle se arma como arreglo para router.navigate', () => {
    expect(RUTAS_REPORTES.detalle('abc')).toEqual(['/report', 'abc']);
  });

  it('los botones del inicio usan las mismas rutas', () => {
    const accesos = (MODULO_REPORTES.accesos ?? []).map((a) => a.ruta);
    expect(accesos).toEqual([RUTAS_REPORTES.crear, RUTAS_REPORTES.mios]);
  });
});
