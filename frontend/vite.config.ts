import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/**
 * Configuración de Vite.
 *
 * El puerto 5173 se fija a propósito: el backend espera exactamente
 * http://localhost:5173 en su variable CORS_ORIGIN.
 */
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
  },
  preview: {
    port: 4173,
  },
});
