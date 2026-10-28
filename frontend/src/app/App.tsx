import { BrowserRouter } from 'react-router-dom';
import { PlatformProvider } from '../features/platform/PlatformProvider';
import { AppRoutes } from './routes';

/**
 * El enrutador vive en el componente raíz: así cualquier componente puede usar
 * `useNavigate`/`Link` sin pasar el router por props. El nombre del sistema
 * se lee una vez para toda la aplicación (también lo usa el login).
 */
export function App() {
  return (
    <BrowserRouter>
      <PlatformProvider>
        <AppRoutes />
      </PlatformProvider>
    </BrowserRouter>
  );
}
