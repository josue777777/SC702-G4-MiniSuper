/**
 * Variables de entorno del frontend.
 *
 * En Vite solo se exponen al navegador las variables con prefijo `VITE_`
 * (ver `frontend/.env.example`). Se leen una sola vez, aquí, para que el resto
 * del código importe una constante tipada y no `import.meta.env` disperso.
 */

/** URL base de la API Express (backend). Coincide con el puerto de desarrollo. */
export const API_BASE_URL: string =
  (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:4000';
