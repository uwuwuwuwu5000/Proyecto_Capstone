import { useAuth } from '../context/AuthContext'

/**
 * Guard compartido por las pantallas del panel de administración.
 * `cargando`: todavía no se puede decidir (sesión o perfil sin resolver).
 * `autorizado`: ya se resolvió y la cuenta logueada es admin.
 */
export function useRequiereAdmin() {
  const { user, perfil, loading, perfilCargando } = useAuth()
  return {
    cargando: loading || perfilCargando,
    autorizado: !!user && perfil?.role === 'admin',
  }
}
