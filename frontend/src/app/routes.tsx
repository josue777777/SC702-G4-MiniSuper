import { Navigate, Route, Routes } from 'react-router-dom';
import { SetupGate } from '../features/auth/SetupGate';
import { MainLayout } from '../layouts/MainLayout';
import { CustomersPage } from '../pages/CustomersPage';
import { DashboardPage } from '../pages/DashboardPage';
import { InventoryPage } from '../pages/InventoryPage';
import { KardexPage } from '../pages/KardexPage';
import { LoginPage } from '../pages/LoginPage';
import { NotFoundPage } from '../pages/NotFoundPage';
import { OrdersPage } from '../pages/OrdersPage';
import { ProfilePage } from '../pages/ProfilePage';
import { ReportsPage } from '../pages/ReportsPage';
import { SalesPage } from '../pages/SalesPage';
import { SetupPage } from '../pages/SetupPage';
import { SuppliersPage } from '../pages/SuppliersPage';

/**
 * Mapa de rutas de la aplicación.
 *
 * Las rutas dentro de <Route element={<MainLayout />}> comparten la barra de
 * navegación (React Router renderiza ahí el `<Outlet />` del layout).
 * `/login` y `/setup` quedan fuera: las pantallas de acceso no muestran el menú
 * (HU-11 … HU-15). <SetupGate /> manda a `/setup` mientras no exista la cuenta del
 * dueño y, una vez creada, impide volver a esa pantalla (HU-12).
 */
export function AppRoutes() {
  return (
    <SetupGate>
      <Routes>
        <Route path="/setup" element={<SetupPage />} />
        <Route path="/login" element={<LoginPage />} />

        <Route element={<MainLayout />}>
          <Route path="/" element={<DashboardPage />} />
          {/* Productos se muestra ahora dentro de Inventario. */}
          <Route path="/products" element={<Navigate to="/inventory" replace />} />
          <Route path="/inventory" element={<InventoryPage />} />
          <Route path="/kardex" element={<KardexPage />} />
          <Route path="/sales" element={<SalesPage />} />
          <Route path="/customers" element={<CustomersPage />} />
          <Route path="/suppliers" element={<SuppliersPage />} />
          <Route path="/orders" element={<OrdersPage />} />
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </SetupGate>
  );
}
