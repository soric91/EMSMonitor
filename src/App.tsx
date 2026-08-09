import { Navigate, Route, Routes } from 'react-router-dom';
import { ProtectedRoute } from './components/layout/ProtectedRoute';
import { Proyectos } from './pages/Proyectos';
import { AppLayout } from './components/layout/AppLayout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import History from './pages/History';
import ConsumptionExport from './pages/ConsumptionExport';
import Analytics from './pages/Analytics';
import Reports from './pages/Reports';
import ChangePassword from './pages/ChangePassword';

const App = () => {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      {/* Fuera de ProtectedRoute: se llega acá justamente cuando la sesión
          todavía no puede entrar a ningún lado. */}
      <Route path="/cambiar-password" element={<ChangePassword />} />
      <Route element={<ProtectedRoute />}>
        {/* Fuera de AppLayout: ese layout monta los contextos que consultan a
            ApiEMS, y un administrador que todavía no eligió empresa no tiene
            ninguna que consultar — cada uno de esos pedidos daría 403. */}
        <Route path="/proyectos" element={<Proyectos />} />
        <Route element={<AppLayout />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/history" element={<History />} />
          <Route path="/consumption-export" element={<ConsumptionExport />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/reports" element={<Reports />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
};

export default App;
