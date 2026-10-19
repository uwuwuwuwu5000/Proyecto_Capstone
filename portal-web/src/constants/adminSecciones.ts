// Secciones del panel de administración. Una sola lista para el inicio del
// panel (tarjetas) y el menú desplegable del navbar.

export interface SeccionAdmin {
  ruta: string
  titulo: string
  texto: string
}

export interface GrupoAdmin {
  titulo: string
  descripcion?: string
  secciones: SeccionAdmin[]
}

export const GRUPOS_ADMIN: GrupoAdmin[] = [
  {
    titulo: 'Reportes',
    secciones: [
      {
        ruta: '/admin/reportes',
        titulo: 'Administrar reportes',
        texto: 'Revisa, edita o elimina reportes y vincúlalos con su operador.',
      },
      {
        ruta: '/admin/reportes/nuevo',
        titulo: 'Crear reporte',
        texto: 'Registra una incidencia en cualquier punto del mapa, con su organismo asignado.',
      },
      {
        ruta: '/admin/mapa-calor',
        titulo: 'Mapa de calor',
        texto: 'Reportes sin resolver por comuna, con detalle de tiempos y categorías.',
      },
      {
        ruta: '/admin/estadisticas',
        titulo: 'Estadísticas globales',
        texto: 'Volumen, tiempos de atención por operador y comunas con más reportes.',
      },
    ],
  },
  {
    titulo: 'Organismos y operadores',
    descripcion:
      'Para que un municipio gestione sus reportes: se activa, se le crea un operador y luego la cuenta con que ese operador entra al portal.',
    secciones: [
      {
        ruta: '/admin/organismos',
        titulo: 'Organismos activos',
        texto: 'Activa o desactiva municipalidades y revisa su límite comunal y su actividad.',
      },
      {
        ruta: '/admin/operadores',
        titulo: 'Operadores',
        texto: 'Da de alta operadores, revisa sus cuentas y actívalos o desactívalos.',
      },
      {
        ruta: '/admin/cuentas',
        titulo: 'Crear cuenta de organismo',
        texto: 'Da de alta el acceso de un operador ya activado.',
      },
    ],
  },
  {
    titulo: 'Atención a vecinos',
    secciones: [
      {
        ruta: '/admin/soporte',
        titulo: 'Soporte',
        texto: 'Quejas y sugerencias de los vecinos: responde, toma el caso y ciérralo.',
      },
    ],
  },
  {
    titulo: 'Configuración',
    secciones: [
      {
        ruta: '/admin/categorias',
        titulo: 'Categorías',
        texto: 'Crea, edita, ordena y activa o desactiva las categorías de los reportes.',
      },
    ],
  },
]
