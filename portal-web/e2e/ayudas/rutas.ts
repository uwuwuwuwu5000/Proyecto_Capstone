// Mapa de rutas del portal por tipo de usuario. Una sola lista para no repetir URLs.
export const RUTAS = {
  publicas: { inicio: '/', login: '/login', registro: '/registro' },
  vecino: { mapa: '/mapa', historial: '/historial', miNivel: '/mi-nivel', miPerfil: '/mi-perfil' },
  admin: {
    resumen: '/admin', organismos: '/admin/organismos', operadores: '/admin/operadores', cuentas: '/admin/cuentas',
    reportes: '/admin/reportes', crearReporte: '/admin/reportes/nuevo', categorias: '/admin/categorias',
    mapaCalor: '/admin/mapa-calor', estadisticas: '/admin/estadisticas', soporte: '/admin/soporte',
  },
  operador: { mapa: '/operador', reportes: '/operador/reportes', estadisticas: '/operador/estadisticas' },
} as const
