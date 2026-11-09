# Plataforma

Pantallas del **Administrador de la plataforma**: Negocios y Solicitudes. Volver al
[índice de la guía](README.md). Las decisiones de fondo están en el
[ADR 0002](../adr/0002-usuarios-jerarquia-y-nivel-de-cuenta.md).

## 1. Qué hace

- **Negocios** (`/platform/businesses`): crear un negocio junto con su Encargado,
  definir su nivel de cuenta (cuántos usuarios adicionales puede tener), suspenderlo y
  reactivarlo, y cambiar el nombre del sistema que se ve en el login.
- **Solicitudes** (`/platform/requests`): aprobar o rechazar los pedidos de más
  usuarios que envían los Encargados desde Configuración › General.

**Regla de oro del módulo:** el Administrador administra **negocios**, no sus datos.
Ve el nombre, el estado, el Encargado y cuántos usuarios usa cada negocio; nunca sus
productos, ventas ni clientes. No pertenece a ningún negocio, así que las rutas de
negocio (`requireBusiness`) lo rechazan.

## 2. Flujo de información

### Crear un negocio

```text
Entrada   BusinessesPage.tsx: { businessName, extraUsers, managerName, managerEmail }
   │
   ▼  POST /api/platform/businesses        (sesión + permiso platform.manage)
routes/platform.routes.ts → controllers/platform.controller.ts (valida con Zod)
   ▼
services/platform.service.ts → createBusiness()
   │   1. genera una contraseña temporal de 12 caracteres (utils/temporary-password.ts)
   │   2. genera el usuario del Encargado a partir de su nombre (utils/username.ts)
   │   3. guarda solo el hash argon2 de la contraseña
   ▼
repositories/platform.repository.ts → en una transacción: Business + su Encargado
   │   ¿el correo ya existe? → 409
   ▼
Responde  201 { negocio, Encargado + contraseña temporal }
          La contraseña temporal se muestra UNA vez; la respuesta lleva
          `Cache-Control: no-store` para que el navegador no la guarde.
```

El Encargado entra con esa contraseña y el sistema lo obliga a cambiarla antes de
hacer cualquier otra cosa (ver [Usuarios y acceso](usuarios-y-acceso.md)).

### Pedir más usuarios y responder

```text
Encargado   POST /api/plan-requests { extraUsers: 2, note }   (Configuración › General)
              una sola solicitud pendiente por negocio; otra → 409
Administrador
            POST /api/platform/requests/:id/approve | /reject  { response? }
              en una transacción bloquea la solicitud PENDING;
              si aprueba: el negocio suma esos usuarios adicionales
              si ya estaba resuelta → 409 «La solicitud no existe o ya fue resuelta»
```

### Otras rutas

| Ruta | Para qué |
| --- | --- |
| `GET /api/platform/public` | Solo el nombre del sistema, sin sesión (pantalla de login) |
| `GET/PUT /api/platform/settings` | Leer y cambiar el nombre del sistema |
| `GET /api/platform/businesses` | Negocios con su Encargado, cupo y si tienen una solicitud pendiente |
| `PATCH /api/platform/businesses/:id/plan` | Cambiar los usuarios adicionales (nivel de cuenta) |
| `POST /api/platform/businesses/:id/suspend` · `/activate` | Suspender o reactivar el negocio |
| `GET /api/platform/requests?status=` | Solicitudes de todos los negocios |
| `GET /api/plan-requests` | Las solicitudes del negocio del Encargado (solo las suyas) |

### En el navegador

```text
pages/BusinessesPage.tsx       lista, alta, nivel de cuenta, suspender y nombre del sistema
pages/PlanRequestsPage.tsx     solicitudes con su estado (RequestStatusBadge.tsx)
features/platform/PlatformProvider.tsx   comparte el nombre del sistema con toda la app
features/settings/BusinessForm.tsx       donde el Encargado envía su solicitud
services/platform.service.ts             las peticiones HTTP de todo lo anterior
```

## 3. Librerías

| Librería | Qué resuelve aquí |
| --- | --- |
| **Zod** | Usuarios adicionales enteros de 0 a 500; nombre y correo válidos |
| **argon2** | Guardar la contraseña temporal del Encargado como hash |
| **node:crypto** (`randomInt`) | Que la contraseña temporal sea impredecible |
| **Prisma** (`$transaction` + bloqueo de fila) | Que dos clics en «Aprobar» no sumen los usuarios dos veces |

## 4. Cálculos y reglas

### Cupo de usuarios (`maxUsersOf`)

```text
usuarios permitidos = 1 (el Encargado) + usuarios adicionales
Negocio con 3 adicionales → 4 usuarios activos en total
Aprobar una solicitud de 2 → 3 + 2 = 5 adicionales → 6 en total
```

Bajar el nivel de cuenta por debajo de lo que ya se usa **no desactiva a nadie**: solo
impide crear o reactivar usuarios hasta que haya cupo.

### Suspender

Cambia el estado a `SUSPENDED`: las sesiones de todo el negocio dejan de servir en la
siguiente petición y nadie puede entrar. Los datos se conservan; reactivar lo deja
como estaba.

## 5. Dónde buscar cuando algo falla

| Síntoma | Dónde mirar |
| --- | --- |
| «Ya tiene una solicitud pendiente» | Esperado: el Administrador debe responder la anterior |
| Al aprobar, el negocio no recibe los usuarios | `platform.repository.ts` (`decideRequest`) |
| El Administrador recibe 403 al abrir una pantalla de negocio | Esperado: no pertenece a ningún negocio (`requireBusiness`) |
| Nadie de un negocio puede entrar | ¿Está suspendido? Pantalla Negocios |
| El login muestra otro nombre del sistema | `PUT /api/platform/settings` y `PlatformProvider.tsx` |
| «Ese correo ya está en uso» al crear el negocio | El correo del Encargado ya pertenece a otra cuenta |

Pruebas: `backend/src/routes/platform.routes.test.ts` y
`e2e/tests/hu-11-15-usuarios-roles.spec.ts`.
