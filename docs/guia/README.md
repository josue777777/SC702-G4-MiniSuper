# Guía del código

Una página por módulo para **entender el código y encontrar dónde buscar** cuando
algo falla. Cada página tiene las mismas cinco partes:

1. **Qué hace**, en palabras sencillas.
2. **Flujo de información**: qué entra, por qué archivos pasa y qué responde.
3. **Librerías** que usa y qué problema resuelven.
4. **Cálculos**, con un ejemplo con números.
5. **Dónde buscar** cuando algo falla.

| Módulo | Pantallas |
| --- | --- |
| [Productos e inventario](productos-e-inventario.md) | Inventario, Movimientos, Reportes › Inventario |
| [Ventas y clientes](ventas-y-clientes.md) | Ventas (Caja e Historial), Clientes y fiados, Inicio |
| [Pedidos y proveedores](pedidos-y-proveedores.md) | Pedidos (pestañas Pedidos y Proveedores) |
| [Reportes comerciales](reportes.md) | Reportes › Ventas, Ganancias, Más vendidos, Deudas |
| [Usuarios y acceso](usuarios-y-acceso.md) | Iniciar sesión, Mi perfil, Configuración |
| [Plataforma](plataforma.md) | Negocios y Solicitudes (Administrador) |

Las reglas para escribir código están en [`CONTRIBUTING.md`](../../CONTRIBUTING.md); la
arquitectura completa, en [`ARCHITECTURE.md`](../ARCHITECTURE.md).

## El flujo común: el viaje de una petición

Todos los módulos siguen el mismo camino. Aprenderlo una vez sirve para todo el
sistema. Ejemplo: abrir la pantalla Inventario.

```text
NAVEGADOR (frontend/src)
  pages/InventoryPage.tsx            la pantalla (lo que se ve)
    └─ features/products/use-products.ts      el estado de la pantalla (hook)
         └─ services/products.service.ts      arma la petición HTTP
              └─ services/api-client.ts       fetch + cookie de sesión + errores
                         │  GET /api/products?activeOnly=true
                         ▼
SERVIDOR (backend/src)
  app.ts                             helmet, cors, JSON, cookies
  routes/index.ts                    sesión + negocio + permiso (requirePermission)
  routes/products.routes.ts          a qué controlador va cada URL
  controllers/products.controller.ts valida la entrada con Zod y elige el status
  services/products.service.ts       reglas de negocio (no sabe de HTTP)
  repositories/products.repository.ts  única capa que habla con la base
  Prisma → PostgreSQL
                         │  { "data": [ … ] }
                         ▼
  De vuelta al navegador: el hook guarda los datos y React redibuja la pantalla.
```

**Por qué tantas capas.** Cada una tiene una sola responsabilidad. Si una regla de
negocio está mal, se busca en `services/`; si una consulta trae datos de otro
negocio, en `repositories/`; si una URL responde 400, en `validators/` y
`controllers/`. Los errores siempre responden `{ "error": { "message" } }`
(`middleware/error-handler.middleware.ts`).

**El negocio sale de la sesión.** El repositorio se construye con el `businessId`
de la sesión (`businessIdOf(res)`), nunca de la URL: así un negocio no puede ver
datos de otro aunque modifique la petición.

## Librerías del proyecto y qué resuelven

| Librería | Dónde | Qué problema resuelve |
| --- | --- | --- |
| **Express** | backend | Recibir peticiones HTTP y enviarlas a la función correcta según la URL y el método |
| **Zod** | backend | Validar lo que llega (tipos, longitudes, importes) antes de usarlo, y derivar los tipos de TypeScript del mismo esquema |
| **Prisma** (+ `@prisma/adapter-pg`) | backend | Consultar PostgreSQL con funciones tipadas en lugar de SQL a mano, y llevar las migraciones de la base |
| **argon2** | backend | Guardar contraseñas como hash seguro (nunca en texto) |
| **helmet** / **cors** | backend | Cabeceras de seguridad y permitir solo el origen del frontend |
| **exceljs** | backend | Generar los archivos Excel (catálogo y reportes) |
| **nodemailer** | backend | Enviar el correo de recuperación de contraseña |
| **dotenv** | backend | Leer la configuración del archivo `.env` |
| **React** | frontend | Dibujar la pantalla a partir del estado y redibujarla cuando cambia |
| **react-router-dom** | frontend | Que cada pantalla tenga su dirección (`/inventory`, `/orders?seccion=…`) |
| **qrcode.react** | frontend | Dibujar el código QR de las etiquetas |
| **Vite** | frontend | Servidor de desarrollo y empaquetado para producción |
| **Vitest** / **supertest** | pruebas | Pruebas del backend y de sus rutas HTTP sin levantar el servidor |
| **Playwright** | pruebas | Pruebas E2E: un navegador real que usa la aplicación como una persona |

## Cómo se mantiene esta guía

Quien cambia un módulo actualiza su página en el mismo PR (regla 7 de
`CONTRIBUTING.md`). Un módulo nuevo agrega su página y su fila en la tabla de
arriba.
