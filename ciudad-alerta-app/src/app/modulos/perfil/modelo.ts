import { UserRole } from '../../models/user-profile.model';

/** Cómo se muestra cada rol en «Mi perfil». */
export const ETIQUETAS_ROL: Readonly<Record<UserRole, string>> = {
  ciudadano: 'Vecino o vecina',
  operador: 'Operador municipal',
  admin: 'Administración Ciudad Alerta',
  organismo: 'Organismo (recibe los reportes validados)',
};
