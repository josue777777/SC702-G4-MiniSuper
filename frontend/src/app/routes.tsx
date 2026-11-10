import type { ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { RequirePermission } from '../features/auth/RequirePermission';
import { RequireSession } from '../features/auth/RequireSession';
import { useSession } from '../features/auth/session-context';
import { MainLayout } from '../layouts/MainLayout';
import { BusinessesPage } from '../pages/BusinessesPage';
import { CustomersPage } from '../pages/CustomersPage';
import { DashboardPage } from '../pages/DashboardPage';
import { ForgotPasswordPage } from '../pages/ForgotPasswordPage';
import { InventoryPage } from '../pages/InventoryPage';
import { KardexPage } from '../pages/KardexPage';
import { LoginPage } from '../pages/LoginPage';
import { NotFoundPage } from '../pages/NotFoundPage';
import { OrdersPage } from '../pages/OrdersPage';
import { PlanRequestsPage } from '../pages/PlanRequestsPage';
import { ProfilePage } from '../pages/ProfilePage';
import { ReportsPage } from '../pages/ReportsPage';
import { ResetPasswordPage } from '../pages/ResetPasswordPage';
import { SalesPage } from '../pages/SalesPage';
import type { Permission } from '../types/auth';

/** Atajo para envolver una pantalla con el permiso que pide. */
function only(permission: Permission, page: ReactNode) {
  return <RequirePermission permission={permission}>{page}</RequirePermission>;
}

/**
 * La sección se llamaba «Kardex» y ahora es «Movimientos». Los enlaces viejos
 * (`/kardex?productId=…`) siguen funcionando: llevan a la dirección nueva con
 * el mismo producto.
 */
function OldKardexRedirect() {
  const { search } = useLocation();

  return <Navigate to={{ pathname: '/movimientos', search }} replace />;
}

/**
 * Inicio según quién entra: el Administrador de la plataforma no tiene panel
 * de negocio (no ve datos de ninguno), así que va a sus negocios.
 */
function HomePage() {
  const { can } = useSession();

  return can('platform.manage') ? (
    <Navigate to="/platform/businesses" replace />
  ) : (
    <DashboardPage />
  );
}

/**
 * Mapa de rutas de la aplicación.
 *
 * Las rutas dentro de <Route element={<MainLayout />}> comparten la barra de
 * navegación (React Router renderiza ahí el `<Outlet />` del layout). `/login`
 * queda fuera: la pantalla de acceso no muestra el menú (HU-11). No hay
 * registro público: los negocios y sus Encargados los crea la plataforma, y
 * cada Encargado crea a su personal.
 *
 * <RequireSession /> exige una sesión válida y, con contraseña temporal, solo
 * deja entrar a «Mi perfil». Cada pantalla pide el permiso de su sección (el
 * mismo que exige la API); sin él se muestra «Acceso no permitido». La
 * Configuración no es una ruta sino una ventana: la abre `?config=…`.
 */
export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      {/* HU-13: recuperar la contraseña por correo (públicas, sin menú). */}
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />

      <Route
        element={
          <RequireSession>
            <MainLayout />
          </RequireSession>
        }
      >
        <Route path="/" element={<HomePage />} />
        <Route path="/platform/businesses" element={only('platform.manage', <BusinessesPage />)} />
        <Route path="/platform/requests" element={only('platform.manage', <PlanRequestsPage />)} />
        {/* Productos se muestra ahora dentro de Inventario. */}
        <Route path="/products" element={<Navigate to="/inventory" replace />} />
        <Route path="/inventory" element={only('inventory.read', <InventoryPage />)} />
        <Route path="/movimientos" element={only('kardex', <KardexPage />)} />
        <Route path="/kardex" element={<OldKardexRedirect />} />
        <Route path="/sales" element={only('sales', <SalesPage />)} />
        <Route path="/customers" element={only('customers', <CustomersPage />)} />
        {/* Proveedores es una pestaña de Pedidos; la dirección vieja lleva a ella. */}
        <Route path="/suppliers" element={<Navigate to="/orders?seccion=proveedores" replace />} />
        <Route path="/orders" element={only('purchasing', <OrdersPage />)} />
        <Route path="/reports" element={only('reports.inventory', <ReportsPage />)} />
        {/* Configuración es una ventana (MainLayout); estas direcciones la abren. */}
        <Route path="/settings" element={<Navigate to="/?config=general" replace />} />
        <Route path="/settings/users" element={<Navigate to="/?config=usuarios" replace />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
