# Frontend — SPA del MiniSuper

Interfaz web del sistema de gestión (React 19 + Vite 8 + TypeScript + React Router).
Todo el detalle está en [`../docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md) §3.

## Arrancar

```bash
# desde la raíz del repositorio
npm install
cp frontend/.env.example frontend/.env   # opcional: hay un valor por defecto
npm run dev -w frontend                  # http://localhost:5173
```

Necesita el backend corriendo (`npm run dev -w backend`) para que la tarjeta
**Estado del sistema** del panel muestre la API y la base en línea.

## Scripts

| Comando             | Qué hace                                                  |
| ------------------- | --------------------------------------------------------- |
| `npm run dev`       | Servidor de desarrollo de Vite en el puerto 5173          |
| `npm run build`     | `tsc --noEmit` (tipos) + `vite build` (bundle en `dist/`) |
| `npm run preview`   | Sirve el bundle ya compilado, para revisarlo              |
| `npm run lint`      | ESLint, con las reglas de React Hooks activas             |
| `npm run typecheck` | Comprobación de tipos sin generar archivos                |

## Cómo se conecta con el backend

`VITE_API_URL` (leída en `src/config/env.ts`, valor por defecto
`http://localhost:4000`) → `src/services/api-client.ts` (único `fetch` del proyecto) →
`src/services/<dominio>.service.ts` → componente.

Un componente nunca llama a `fetch` ni conoce rutas de la API.

## Carpetas

- `src/app/` — componente raíz y mapa de rutas.
- `src/layouts/` — `MainLayout`: menú lateral + `<Outlet />`.
- `src/pages/` — una pantalla por ruta; las que aún no tienen historia muestran un
  `PagePlaceholder` con sus HU y tareas pendientes.
- `src/features/` — componentes y hooks por dominio (ver su `README.md`).
- `src/services/` — acceso HTTP. `src/types/` — contratos de la API.
- `src/config/env.ts` — variables de entorno, leídas en un solo lugar.
