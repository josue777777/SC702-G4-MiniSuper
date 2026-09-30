import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import './styles/global.css';

/**
 * Punto de entrada de la SPA. `createRoot` es la API de React 18+; el resto del
 * proyecto cuelga de aquí: enrutador → layout → páginas.
 */
createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
