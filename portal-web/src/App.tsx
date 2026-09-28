import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import Landing from './pages/Landing/Landing'
import Login from './pages/Login/Login'
import Registro from './pages/Registro/Registro'
import Historial from './pages/Historial/Historial'
import Mapa from './pages/Mapa/Mapa'
import Admin from './pages/Admin/Admin'
import AdminOrganismos from './pages/Admin/AdminOrganismos'
import AdminOperadores from './pages/Admin/AdminOperadores'
import AdminCuentas from './pages/Admin/AdminCuentas'
import AdminReportes from './pages/Admin/AdminReportes'
import OperadorMapa from './pages/Operador/OperadorMapa'
import OperadorReportes from './pages/Operador/OperadorReportes'
import OperadorEstadisticas from './pages/Operador/OperadorEstadisticas'

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
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
          <Route path="/operador" element={<OperadorMapa />} />
          <Route path="/operador/reportes" element={<OperadorReportes />} />
          <Route path="/operador/estadisticas" element={<OperadorEstadisticas />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
