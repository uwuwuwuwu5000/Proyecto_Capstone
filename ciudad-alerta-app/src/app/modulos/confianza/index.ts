/**
 * API pública del sistema de confianza. Otro módulo que lo use debe
 * declararlo en `requiere` u `opcionales` de su manifiesto e importar solo
 * desde aquí.
 *
 * Los cálculos y parámetros viven en el paquete compartido `comun/` (los
 * puede usar también el portal web); se reexportan para no cambiar los
 * imports de quien ya los usaba desde aquí.
 */
export { MODULO_CONFIANZA } from './confianza.modulo';
export {
  LIMITES_DIARIOS,
  NIVELES,
  PARAMETROS_CONFIANZA,
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
} from '@ciudad-alerta/comun';
export type { DefinicionNivel, MotivoSinPeso, ProgresoNivel } from '@ciudad-alerta/comun';
