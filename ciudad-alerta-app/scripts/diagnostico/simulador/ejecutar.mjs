#!/usr/bin/env node
/**
 * Ejecuta un script de reglas (reglas.mjs, reglas-ataques.mjs) contra el
 * simulador, sin Java ni Firebase CLI:
 *
 *   node scripts/diagnostico/simulador/ejecutar.mjs scripts/diagnostico/reglas.mjs
 *
 * Funciona igual en Windows, Linux y macOS. El resultado es una aproximación
 * (ver interprete.mjs): lo que encuentre conviene confirmarlo en el emulador.
 */
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const [script, ...resto] = process.argv.slice(2);
if (!script) {
  console.error('Uso: node scripts/diagnostico/simulador/ejecutar.mjs <script de reglas> [opciones]');
  process.exit(2);
}

const r = spawnSync(process.execPath, ['--import', pathToFileURL(join(AQUI, 'registrar.mjs')).href, resolve(script), ...resto], {
  stdio: 'inherit',
  env: { ...process.env, FIRESTORE_EMULATOR_HOST: 'simulador:0', CA_SIMULADOR: '1' },
});
process.exit(r.status ?? 1);
