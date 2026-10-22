/**
 * Compila el servicio en un solo archivo, dist/servidor.mjs, con el paquete
 * compartido `comun/` incluido. Las dependencias de npm quedan afuera (se
 * instalan con npm ci en el servidor).
 */
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

const raiz = fileURLToPath(new URL('..', import.meta.url));

await build({
  entryPoints: [`${raiz}src/principal.ts`],
  outfile: `${raiz}dist/servidor.mjs`,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  packages: 'external',
  alias: { '@ciudad-alerta/comun': fileURLToPath(new URL('../../comun/src/index.ts', import.meta.url)) },
  sourcemap: true,
  logLevel: 'info',
});
