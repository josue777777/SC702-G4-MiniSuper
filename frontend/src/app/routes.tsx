import type { ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { RequirePermission } from '../features/auth/RequirePermission';
import { RequireSession } from '../features/auth/RequireSession';
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
import { SuppliersPage } from '../pages/SuppliersPage';
import { UsersPage } from '../pages/UsersPage';
import type { Permission } from '../types/auth';

/** Atajo para envolver una pantalla con el permiso que pide. */
function only(permission: Permission, page: ReactNode) {
  return <RequirePermission permission={permission}>{page}</RequirePermission>;
}

/**
 * Mapa de rutas de la aplicación.
 *
 * Las rutas dentro de <Route element={<MainLayout />}> comparten la barra de
 * navegación (React Router renderiza ahí el `<Outlet />` del layout). `/login`
 * queda fuera: la pantalla de acceso no muestra el menú (HU-11). No hay
 * registro público: los usuarios los crea el administrador.
 *
 * <RequireSession /> exige una sesión válida y, con contraseña temporal, solo
 * deja entrar a «Mi perfil». Cada pantalla pide el permiso de su sección (el
 * mismo que exige la API); sin él se muestra «Acceso no permitido».
 */
export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route
        element={
          <RequireSession>
            <MainLayout />
          </RequireSession>
        }
      >
        <Route path="/" element={<DashboardPage />} />
        {/* Productos se muestra ahora dentro de Inventario. */}
        <Route path="/products" element={<Navigate to="/inventory" replace />} />
        <Route path="/inventory" element={only('inventory.read', <InventoryPage />)} />
        <Route path="/kardex" element={only('kardex', <KardexPage />)} />
        <Route path="/sales" element={only('sales', <SalesPage />)} />
        <Route path="/customers" element={only('customers', <CustomersPage />)} />
        <Route path="/suppliers" element={only('purchasing', <SuppliersPage />)} />
        <Route path="/orders" element={only('purchasing', <OrdersPage />)} />
        <Route path="/reports" element={only('reports.inventory', <ReportsPage />)} />
        <Route path="/settings/users" element={only('settings', <UsersPage />)} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
