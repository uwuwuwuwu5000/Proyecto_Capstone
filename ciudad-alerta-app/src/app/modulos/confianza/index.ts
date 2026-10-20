/**
 * API pública del sistema de confianza. Otro módulo que lo use debe
 * declararlo en `requiere` u `opcionales` de su manifiesto e importar solo
 * desde aquí.
 */
export { MODULO_CONFIANZA } from './confianza.modulo';
export { LIMITES_DIARIOS, NIVELES, PARAMETROS_CONFIANZA } from './dominio/parametros';
export type { DefinicionNivel } from './dominio/parametros';
export {
  cuentaEsAntigua,
  inicioDeDia,
  limiteDiario,
  nivelDePuntos,
  nombreDeNivel,
  numeroDeDia,
  pesoDeNivel,
  pesoDeVoto,
  porcentajeDeValidacion,
  progresoDeNivel,
  puntosTrasVeredicto,
  sumarConfirmacion,
  validacionCompleta,
} from './dominio/calculos';
export type { MotivoSinPeso, ProgresoNivel } from './dominio/calculos';
