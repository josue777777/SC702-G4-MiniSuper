import { BrowserRouter } from 'react-router-dom';
import { AppRoutes } from './routes';

/**
 * El enrutador vive en el componente raíz: así cualquier componente puede usar
 * `useNavigate`/`Link` sin pasar el router por props.
 */
export function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}
