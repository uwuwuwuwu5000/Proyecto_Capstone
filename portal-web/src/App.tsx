import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { CategoriasProvider } from './context/CategoriasContext'
import CargandoPagina from './components/Carga/CargandoPagina'
import ErrorDeCarga from './components/Carga/ErrorDeCarga'

// Cada página se descarga recién cuando se visita: quien solo entra a la
// Landing no baja el código del panel de admin, ni el del operador.
const Landing = lazy(() => import('./pages/Landing/Landing'))
const Login = lazy(() => import('./pages/Login/Login'))
const Registro = lazy(() => import('./pages/Registro/Registro'))
const Historial = lazy(() => import('./pages/Historial/Historial'))
const Mapa = lazy(() => import('./pages/Mapa/Mapa'))
const Admin = lazy(() => import('./pages/Admin/Admin'))
const AdminOrganismos = lazy(() => import('./pages/Admin/AdminOrganismos'))
const AdminOperadores = lazy(() => import('./pages/Admin/AdminOperadores'))
const AdminCuentas = lazy(() => import('./pages/Admin/AdminCuentas'))
const AdminReportes = lazy(() => import('./pages/Admin/AdminReportes'))
const AdminCategorias = lazy(() => import('./pages/Admin/AdminCategorias'))
const OperadorMapa = lazy(() => import('./pages/Operador/OperadorMapa'))
const OperadorReportes = lazy(() => import('./pages/Operador/OperadorReportes'))
const OperadorEstadisticas = lazy(() => import('./pages/Operador/OperadorEstadisticas'))

function Rutas() {
  const { pathname } = useLocation()

  return (
    // key: al navegar a otra ruta se reinicia el aviso de error, para que una
    // página que no cargó no deje bloqueado el resto del portal.
    <ErrorDeCarga key={pathname}>
      <Suspense fallback={<CargandoPagina />}>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/registro" element={<Registro />} />
          <Route path="/historial" element={<Historial />} />
          <Route path="/mapa" element={<Mapa />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="/admin/organismos" element={<AdminOrganismos />} />
          <Route path="/admin/operadores" element={<AdminOperadores />} />
          <Route path="/admin/cuentas" element={<AdminCuentas />} />
          <Route path="/admin/reportes" element={<AdminReportes />} />
          <Route path="/admin/categorias" element={<AdminCategorias />} />
          <Route path="/operador" element={<OperadorMapa />} />
          <Route path="/operador/reportes" element={<OperadorReportes />} />
          <Route path="/operador/estadisticas" element={<OperadorEstadisticas />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </ErrorDeCarga>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <CategoriasProvider>
        <BrowserRouter>
          <Rutas />
        </BrowserRouter>
      </CategoriasProvider>
    </AuthProvider>
  )
}
