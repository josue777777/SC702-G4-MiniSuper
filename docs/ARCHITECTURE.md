# Arquitectura — SC702-G4-MiniSuper

Sistema de gestión para minisúper / abastecedor **Nuevo Amanecer**.
Curso **SC-702 — Diseño y Desarrollo de Sistemas**, **Grupo 4**.

Este documento describe **la base arquitectónica** del proyecto: cómo está organizado el
código, qué responsabilidad tiene cada capa y cómo se agrega una funcionalidad nueva.
Las historias de usuario (HU) se implementan **encima** de esta base.

---

## 1. Contexto y alcance

| Punto | Definición |
| --- | --- |
| Usuario del sistema | **Un único dueño** del negocio (no hay múltiples roles ni multi-tenant) |
| Uso de IA | El sistema **NO** incluye asistentes de inteligencia artificial |
| Tipo de aplicación | Aplicación web cliente-servidor (SPA + API REST) |
| Historias de usuario | 30 HU (`HU-01` … `HU-30`) agrupadas en 3 módulos funcionales |

### Los 3 módulos funcionales

| Módulo | Dominio | Historias |
| --- | --- | --- |
| **Módulo 1** | Productos e inventario | HU-01 … HU-10 |
| **Módulo 2** | Acceso, ventas y clientes | HU-11 … HU-20 |
| **Módulo 3** | Proveedores, pedidos y reportes | HU-21 … HU-30 |

La arquitectura debe poder soportar los 3 módulos sin reorganizaciones: por eso el backend
trabaja por **capas** (routes → controllers → services → repositories) y el frontend por
**features**.

---

## 2. Vista general

```mermaid
flowchart TD
    A["React SPA<br/>(Vite + TypeScript)"] -->|"HTTP / JSON (REST)"| B["Express API<br/>(Node.js + TypeScript)"]
    B --> C["Routes"]
    C --> D["Controllers"]
    D --> E["Services"]
    E --> F["Repositories"]
    F --> G["Prisma ORM"]
    G --> H[("PostgreSQL")]
```

Regla central de la arquitectura: **cada capa solo conoce a la capa inmediatamente
inferior**. Un `controller` nunca llama a Prisma directamente; siempre pasa por `service` y
`repository`.

---

## 3. Frontend

* **Tecnología**: React + Vite + TypeScript (SPA).
* **Ruteo**: React Router con rutas declarativas (`BrowserRouter` + `Routes`) en
  `frontend/src/app/routes.tsx`. `/login` se renderiza fuera del layout; el resto
  de pantallas comparte `MainLayout` a través de `<Outlet />`.
* **Comunicación HTTP**: centralizada en `frontend/src/services/`. Ningún componente
  ejecuta `fetch` directamente.
* **URL del backend**: variable de entorno `VITE_API_URL`, leída una sola vez en
  `frontend/src/config/env.ts` (ver `frontend/.env.example`).

```
frontend/src/
├── app/          Arranque de la app: App.tsx (router) y routes.tsx (definición de rutas)
├── components/   Componentes de UI genéricos y reutilizables (sin lógica de negocio)
├── config/       Lectura tipada de variables de entorno (env.ts)
├── features/     Un folder por dominio (products, sales, suppliers...):
│                 componentes + hooks + estado propio de esa funcionalidad.
│                 Se llena al implementar las HU (ver src/features/README.md)
├── layouts/      Marcos visuales que envuelven páginas (MainLayout)
├── pages/        Una página por ruta. Componen features/components, sin lógica de negocio
├── services/     Único lugar con acceso HTTP (api-client.ts + *.service.ts)
├── styles/       Estilos globales (CSS plano)
├── types/        Tipos compartidos de TypeScript (contratos de la API)
└── main.tsx      Monta React en el DOM
```

### Flujo de datos en el frontend

```
Page → feature (hook/componente) → services/*.service.ts → services/api-client.ts → HTTP
```

Cuando se implemente un módulo se espera, por ejemplo:

```
features/products/            (implementado en HU-01 … HU-03)
├── ProductTable.tsx     Tabla del catálogo con acciones y confirmación de desactivación
├── ProductForm.tsx      Formulario de alta y de edición
├── use-products.ts      Hook: catálogo, opciones, avisos y acciones (crear/editar/desactivar)
├── product-form.ts      Conversión formulario ↔ API y validación de experiencia de usuario
└── money.ts             Formateo de importes para mostrarlos

services/products.service.ts  -> usa api-client.ts y devuelve datos tipados
types/products.ts             -> contratos del módulo (copia de backend/src/types/products.ts)
```

---

## 4. Backend

* **Tecnología**: Node.js + Express + TypeScript.
* **Prefijo de API**: `/api`.
* `app.ts` configura Express (middlewares, rutas, manejo de errores).
* `server.ts` levanta el servidor HTTP (es el único que hace `listen`).

```
backend/src/
├── app.ts         Configura Express (helmet, cors, json, rutas, errores) y exporta la app
├── server.ts      Inicia el servidor HTTP usando app.ts y cierra conexiones al apagar
├── config/        Variables de entorno validadas (env.ts) y cliente Prisma (prisma.ts)
├── routes/        Define endpoints y los asocia a controllers (sin lógica)
├── controllers/   Reciben el request, usan validadores, llaman services y arman la response
├── services/      Lógica de negocio y coordinación de operaciones
├── repositories/  Acceso a datos. Únicos que usan Prisma para operaciones del dominio
├── validators/    Esquemas Zod de entrada por recurso (ver src/validators/README.md)
├── middleware/    Middlewares transversales: manejo de errores y 404
├── testing/       Dobles de repositorio para las pruebas. NO se compila (tsconfig.build.json)
├── types/         Contratos del dominio por recurso (DTO y planes de escritura)
├── utils/         Utilidades puras y errores HTTP (HttpError)
└── generated/     Cliente Prisma generado (`prisma generate`). No se versiona
```

### Responsabilidades por capa (contrato del equipo)

| Capa | Sí hace | No hace |
| --- | --- | --- |
| `routes` | Declarar método + ruta y delegar al controller | Lógica, validaciones, acceso a datos |
| `controllers` | Leer `req` (params/query/body), llamar al service, elegir status code y forma de la respuesta | Reglas de negocio, consultas a Prisma |
| `services` | Reglas de negocio, coordinación, cálculos (totales, deudas, ganancias) | Hablar HTTP (`req`/`res`), Prisma directo |
| `repositories` | Consultas y escrituras con Prisma | Reglas de negocio, HTTP |
| `validators` | Validar/normalizar la entrada con Zod antes del controller | Reglas de negocio |
| `middleware` | Aspectos transversales: errores, 404, logging | Lógica de un módulo |

### Manejo de errores

* `utils/http-error.ts` expone `HttpError` (status code + mensaje + detalles opcionales)
  para errores esperados, con fábricas `badRequest`, `unauthorized`, `forbidden`,
  `notFound`, `conflict` y `externalService`.
* `middleware/error-handler.middleware.ts` centraliza **todas** las respuestas de error con
  una forma JSON estable (`details` solo se incluye cuando hay algo que mostrar):

```json
{
  "error": {
    "message": "Los datos enviados no son válidos.",
    "details": { "price": ["Debe ser mayor que 0"] }
  }
}
```

* El manejador distingue tres casos: `ZodError` → `400` con el detalle por campo;
  `HttpError` → el status code que trae el error; cualquier otro error → `500`, se
  registra completo en la consola del servidor y al cliente solo le llega un mensaje
  genérico (en desarrollo se añade `details` con la causa para depurar).
* Express 5 propaga automáticamente los rechazos de promesas `async` al manejador de
  errores; por eso los controllers pueden ser `async` sin envoltorios tipo `asyncHandler`.
* `middleware/not-found.middleware.ts` responde 404 en formato JSON para rutas inexistentes.
* `server.ts` además hace apagado ordenado: en `SIGINT`/`SIGTERM` deja de aceptar
  peticiones, cierra el pool de Prisma y termina el proceso (con corte forzado a los 10 s).

### Endpoints de infraestructura

| Método | Ruta | Descripción |
| --- | --- | --- |
| `GET` | `/api/health` | Estado del servicio: `{ "status": "ok" }`. No toca la base de datos |
| `GET` | `/api/health/database` | Verifica la conexión con PostgreSQL vía Prisma (`repository`) |

`/api/health/database` demuestra el flujo completo `route → controller → service →
repository → Prisma`. Responde `200` si la base responde y `503` si no.

### Endpoints de productos (HU-01 … HU-03)

| Método | Ruta | Descripción |
| --- | --- | --- |
| `GET` | `/api/products` | Catálogo completo (activos e inactivos) para administrarlo |
| `GET` | `/api/products/form-options` | Categorías y proveedores **activos** para los `<select>` del formulario |
| `POST` | `/api/products` | Registrar producto (HU-01). Responde `201` |
| `PATCH` | `/api/products/:id` | Editar producto (HU-02) |
| `PATCH` | `/api/products/:id/deactivate` | Baja lógica (HU-03): solo `isActive = false` |

Convenciones de este módulo, decididas al implementarlo:

* **El recurso viaja dentro de `data`**: `{ "data": … }`. Así agregar metadatos más
  adelante (por ejemplo un total en la búsqueda de HU-05) no rompe a los clientes que ya
  existen. `/api/health` queda como está: es un sondeo de infraestructura, no un recurso.
* **El dinero es cadena** (`"1500.00"`), nunca `number`: en la base es `Decimal(12, 2)` y
  `number` no lo representa con exactitud. El validador normaliza lo que llegue a esa forma.
* **`PATCH` recibe el cuerpo completo** (los siete campos de HU-01). HU-02 permite modificar
  todos los campos del producto y, con campos parciales, "no cambiar el stock" y "dejar el
  stock en cero" serían indistinguibles.
* **No hay ruta de reactivación**: HU-03 no la pide. Desactivar es **idempotente**: si el
  producto ya estaba inactivo se devuelve tal cual, sin escribir de nuevo.
* **El proveedor del formulario es el principal del producto**: se guarda en
  `SupplierProduct` con `isPreferred = true` y `unitCost = costo`. La edición libera a los
  demás proveedores antes de marcar el nuevo, de modo que nunca hay dos preferidos.
* **Los movimientos de inventario los decide el service y los escribe el repository** en la
  misma transacción: `ENTRY` con `reason = "Stock inicial"` al crear con stock > 0, y
  `ADJUSTMENT` con `reason = "Ajuste desde edición de producto"` al cambiar el stock a mano.
* **`updatedAt`/historial de ventas intactos**: editar un producto nunca escribe en
  `SaleItem`, cuyos `unitPrice` y `unitCost` son la foto del momento de la venta.

---

## 5. Base de datos y Prisma

* **Motor**: PostgreSQL.
* **ORM**: Prisma (`backend/prisma/schema.prisma`).
* **Cliente Prisma**: instanciado una sola vez en `backend/src/config/prisma.ts`.
* Los `services` **no** importan Prisma: solo los `repositories`.

### Decisiones de modelado

1. **Dinero con `Decimal`** (`Decimal(12, 2)`). Nunca `Float`: evita errores de redondeo en
   precios, costos, totales y pagos.
2. **Identificadores `UUID`** (`String @id @default(uuid())`) en todas las entidades.
3. **Baja lógica, no borrado físico**, en productos, categorías, clientes y proveedores
   (`isActive`). El historial de ventas no debe perder información (HU-03).
4. **`SupplierProduct`** (tabla intermedia) guarda `unitCost` por proveedor: un producto
   puede comprarse a varios proveedores y el costo se compara entre ellos.
5. **`SaleItem` guarda `unitPrice` y `unitCost` como "foto" del momento de la venta**, para
   que el reporte de ganancias (HU-29) no dependa del costo actual del producto.
6. **El stock vive en `Product.stock`** (permite comparar contra `minStock` sin agregaciones)
   y **todo cambio de stock debe generar un `InventoryMovement`** (`stockBefore`/`stockAfter`)
   para dejar historial auditable (HU-10, HU-16).
7. **Las alertas no se almacenan**: son derivables del dominio (`stock <= minStock`,
   vencimiento cercano, deuda > 0). Guardarlas duplicaría estado y podría desincronizarse.
8. **La deuda de un cliente (fiado) no se guarda como saldo**: se **deriva** de las `Sale`
   con `paymentMethod = CREDIT` menos los `CreditPayment` de ese cliente. Así HU-18 ("se
   acumula la deuda") y HU-19 ("la deuda se actualiza o se marca como saldada") se cumplen
   manteniendo un historial de movimientos en lugar de un número que puede descuadrar.
9. **Sin roles ni RBAC**: existe un único dueño (`User`); no se modelan permisos.
10. **Sin columna `createdBy`/autor en ventas, movimientos ni pedidos**: el sistema es
    monousuario (HU-12), así que el autor no aporta información. Si algún día hay más de
    un usuario, se agrega con una migración y no rompe lo existente.
11. **Sin folios correlativos** (`invoiceNumber`, `orderNumber`): ninguna historia los
    pide. El ticket de caja y el PDF del pedido (HU-24) pueden usar el `id` y la fecha;
    si el dueño los pide, se añade un correlativo anual con su propia migración.
12. **Sin campos de descuento ni de anulación de ventas**: HU-17 solo pide elegir
    efectivo o tarjeta, y las 30 historias no contemplan borrar una venta. Modelarlos
    ahora sería inventar requisitos.
13. **`PurchaseOrderStatus` solo tiene `PENDING` y `RECEIVED`**: los estados de un enum
    también son requisitos. `receivedQuantity` en `PurchaseOrderItem` permite, en cambio,
    recepciones parciales sin crear una entidad extra (HU-22 habla de "entregas").

```mermaid
erDiagram
    Category ||--o{ Product : clasifica
    Product ||--o{ SupplierProduct : "se compra a"
    Supplier ||--o{ SupplierProduct : suministra
    Product ||--o{ InventoryMovement : genera
    Product ||--o{ SaleItem : "vendido en"
    Product ||--o{ PurchaseOrderItem : "pedido en"
    Customer ||--o{ Sale : compra
    Customer ||--o{ CreditPayment : abona
    Sale ||--|{ SaleItem : contiene
    Sale ||--o{ CreditPayment : "se abona a"
    Supplier ||--o{ PurchaseOrder : recibe
    PurchaseOrder ||--|{ PurchaseOrderItem : contiene
    Sale ||--o{ InventoryMovement : origina
    PurchaseOrder ||--o{ InventoryMovement : origina
```

`User` aparece sin relaciones en el diagrama a propósito: es la cuenta única de acceso
(HU-11 … HU-15) y, al no haber múltiples usuarios, ninguna transacción necesita
referenciarla (decisión 10).

### Modelo de dominio y su origen en las HU

| Entidad | Para qué existe (HU relacionadas) |
| --- | --- |
| `User` | Cuenta única del dueño: login, perfil, recuperación (HU-11 … HU-15) |
| `Category` | Categorizar y filtrar inventario (HU-04) |
| `Product` | Código, código de barras, precios, costo, stock, stock mínimo y vencimiento (HU-01 … HU-09) |
| `InventoryMovement` | Historial auditable de entradas, salidas y ajustes (HU-10, HU-16) |
| `Supplier` / `SupplierProduct` | Proveedores, productos que suministran y su costo (HU-01, HU-21) |
| `Customer` | Clientes y sus fiados (HU-18, HU-19, HU-30) |
| `Sale` / `SaleItem` | Ventas con varios ítems, método de pago y ganancia histórica (HU-16 … HU-20, HU-28, HU-29) |
| `CreditPayment` | Abonos a fiados (HU-19, HU-30) |
| `PurchaseOrder` / `PurchaseOrderItem` | Pedidos a proveedores e historial de compras (HU-22 … HU-24) |

---

## 6. Flujo HTTP / JSON de una petición

```mermaid
sequenceDiagram
    participant UI as React (SPA)
    participant R as routes
    participant C as controller
    participant S as service
    participant P as repository
    participant DB as PostgreSQL (Prisma)

    UI->>R: GET /api/health/database
    R->>C: handler de la ruta
    C->>S: ejecuta el caso de uso
    S->>P: solicita datos
    P->>DB: consulta ORM
    DB-->>P: resultado
    P-->>S: datos
    S-->>C: resultado del caso de uso
    C-->>UI: HTTP 200 + JSON
```

---

## 7. Variables de entorno

Tres archivos `.env` con propósitos distintos. Todos tienen su `.env.example`
versionado; ninguno se sube a Git.

| Archivo | Lo lee | Variables |
| --- | --- | --- |
| `.env` (raíz) | `docker-compose.yml` | `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `POSTGRES_PORT` |
| `backend/.env` | `backend/prisma7.config.ts` (CLI de Prisma) y `backend/src/config/env.ts` (API) | `PORT`, `NODE_ENV`, `CORS_ORIGIN`, `DATABASE_URL` |
| `frontend/.env` | Vite a través de `frontend/src/config/env.ts` | `VITE_API_URL` |

Puntos que conviene tener claros:

* **Prisma 7 no carga `.env` automáticamente.** Lo hace `prisma7.config.ts` con
  `import 'dotenv/config'`, y el propio backend lo hace en `src/config/env.ts`.
  Ese archivo es, además, el nuevo nombre del archivo de configuración de Prisma
  (`prisma.config.ts` sigue funcionando como nombre legado).
* **La cadena de conexión está en dos lugares y debe coincidir**: `prisma7.config.ts`
  (para la CLI: migraciones, Studio) y `src/config/prisma.ts` (para la aplicación,
  a través del adaptador `@prisma/adapter-pg`). En `schema.prisma` ya no va.
* `env.ts` valida con Zod en el arranque: si falta `DATABASE_URL`, el servidor no
  arranca y dice exactamente qué variable falta.
* Las variables del frontend solo son públicas si empiezan con `VITE_`. Nunca poner
  secretos ahí: se compilan dentro del bundle.

---

## 8. Cómo agregar una característica (receta para cualquier HU)

Se usa `HU-01 — registrar producto` como ejemplo; el resto es idéntico.

1. **Modelo de datos.** Añadir/ajustar entidades en `backend/prisma/schema.prisma` y
   generar la migración: `npm run db:migrate` (luego `npm run prisma:generate`, que en
   Prisma 7 **ya no** se ejecuta solo después de migrar).
2. **Validador.** `backend/src/validators/products.validator.ts` con un esquema Zod por
   operación (`createProductSchema`, `updateProductSchema`) y el parámetro `:id`. El tipo
   de la entrada se deriva del esquema para que no existan dos listas de campos.
3. **Contratos.** `backend/src/types/<recurso>.ts`: DTO que publica la API y "planes" de
   escritura que el service encarga al repository.
4. **Repository.** `backend/src/repositories/products.repository.ts`: únicas funciones
   que hablan con `prisma`. Reciben y devuelven datos del dominio (nunca `req`/`res`) y
   normalizan el dinero a cadena. Sin miembros privados, para poder sustituirlo por un
   doble en las pruebas.
5. **Service.** `backend/src/services/products.service.ts`: reglas de negocio
   (código duplicado → `HttpError.conflict`, desactivación idempotente, qué movimiento de
   inventario corresponde). Lanza errores, no escribe JSON, y no importa Prisma.
6. **Controller.** `backend/src/controllers/products.controller.ts`: valida con el
   esquema, llama al service, elige el status code (`201` al crear) y envuelve en `data`.
7. **Routes.** `backend/src/routes/products.routes.ts` con una fábrica
   `createProductsRouter(repository)` y una línea en `backend/src/routes/index.ts`:
   `apiRouter.use('/products', productsRouter)`.
8. **Servicio HTTP del frontend.** `frontend/src/services/products.service.ts` usando
   `api-client.ts`, con los contratos en `frontend/src/types/`.
9. **Feature y página.** Componentes en `frontend/src/features/products/`, y
   `ProductsPage` deja de renderizar `PagePlaceholder` y compone la feature.
10. **Pruebas.** Tres niveles, todas sin base de datos:
    * validador (`src/validators/*.test.ts`): qué entra y qué se rechaza;
    * service con un doble de repositorio de `src/testing/`: reglas de negocio;
    * rutas con `supertest` sobre `createProductsRouter(doble)`: status codes y forma del
      JSON, incluidos los errores.
11. **Documentación.** Actualizar esta arquitectura si la HU introduce una decisión
    nueva, y el checklist de la historia en el tablero del sprint.

**Regla de oro:** si una línea de código no la pide una historia de usuario, no se
escribe. Ante una duda de modelado, la respuesta está en el checklist de la HU.

---

## 9. Convenciones del equipo

**Código**

* TypeScript estricto en los dos workspaces. `npm run typecheck` no puede fallar.
* **ESM en el backend** (`"type": "module"` con `module: NodeNext`): los imports
  relativos propios llevan extensión `.js` (`import { prisma } from '../config/prisma.js'`),
  porque es el archivo que existirá después de compilar. En el frontend no se pone
  extensión (`moduleResolution: bundler`).
* El código generado por Prisma vive en `backend/src/generated/prisma` y **no se edita
  ni se versiona**.
* Prettier manda sobre el formato (`npm run format`); ESLint busca errores, no estilo.
* Nombres: `recurso.routes.ts`, `recurso.controller.ts`, `recurso.service.ts`,
  `recurso.repository.ts`, `recurso.validator.ts`. En el frontend,
  `RecursoPage.tsx` y `features/recurso/`.
* Comentarios y mensajes al usuario en español; identificadores en inglés.

**Datos y dinero**

* Todo importe es `Decimal(12, 2)`. En JSON viaja como **cadena** (`"1500.00"`) y la
  validación lo normaliza a esa forma; en pantalla se formatea con
  `frontend/src/features/products/money.ts`.
* Un cambio de stock siempre escribe su `InventoryMovement` en la misma transacción.
* Bajas lógicas (`isActive`) en lugar de `DELETE`.
* Un recurso que publica la API va dentro de `{ "data": … }`; los errores, siempre con la
  forma `{ "error": { "message", "details"? } }`.

**Pruebas**

* Ninguna prueba necesita PostgreSQL: el service se prueba con el doble de repositorio de
  `backend/src/testing/` (que no se compila) y las rutas, con `supertest` sobre
  `createProductsRouter(doble)`.
* Las interacciones de interfaz que dependen del navegador (cancelar una edición, cancelar
  una desactivación) se comprueban a mano en la validación de la historia: no se añade un
  framework de pruebas de componentes por dos clics.

**Flujo de trabajo**

* Rama por historia: `feat/hu-01-registrar-producto`, apartada de `main`.
* Commits con [Conventional Commits](https://www.conventionalcommits.org/):
  `feat: agregar registro de producto (HU-01)`, `fix: validar stock en venta (HU-16)`.
* Un PR por historia, con el checklist de la HU en la descripción.
* Las migraciones se generan, nunca se escriben a mano, y se revisan en el PR.

---

## 10. Fuera de alcance (decidido, no pendiente)

| No se hace | Por qué |
| --- | --- |
| Roles, permisos, multiusuario | El sistema es para un único dueño (HU-12) |
| Registro público de cuentas | HU-12 prohíbe crear cuentas adicionales |
| Módulo contable o facturación fiscal | No aparece en las 30 historias |
| Integración con pasarelas de pago | HU-17 solo registra el método de pago usado en caja |
| Multi-sucursal / multi-tenant | Un solo negocio |
| Funcionalidad IA (recomendaciones predictivas, chatbots) | Fuera del alcance del proyecto; HU-23 es una regla simple sobre `stock` y `minStock` |
| Aplicación móvil nativa | La SPA es responsiva; no hay requisitos de app nativa |
| Sincronización offline | Requiere el servidor para operar |

Si una necesidad real aparece después, se discute, se escribe una historia nueva y se
extiende la arquitectura — no se cuela en el código actual.

---

## 11. Estado de la base y siguientes pasos

**Implementado y verificado**

* Monorepo npm workspaces (`backend`, `frontend`) con scripts en la raíz.
* Backend Express 5 + TypeScript con las 5 capas, errores centralizados, 404 JSON,
  apagado ordenado y `GET /api/health` + `GET /api/health/database`.
* Prisma 7 + `@prisma/adapter-pg`: esquema con 12 tablas y 3 enums, migración inicial
  `20260930012103_init` aplicada y verificada contra PostgreSQL 16/17 real.
* **Rebanada vertical de productos (HU-01, HU-02, HU-03)**: catálogo con alta, edición y
  baja lógica, de punta a punta (React → API → controller → service → repository → Prisma
  → PostgreSQL), con proveedor principal en `SupplierProduct`, movimientos de inventario y
  pruebas de validador, service y rutas.
* Frontend React + Vite con rutas, `MainLayout`, las 10 pantallas del sistema,
  `api-client.ts` centralizado y la tarjeta de estado consumiendo la API.
* Validaciones: `npm run build`, `npm run lint`, `npm run typecheck`, `npm test` y
  `npx prisma validate` en verde.

**Siguiente paso para el equipo (Sprint 1)**

1. `HU-04` — CRUD de categorías: el formulario de producto ya lee las categorías activas,
   pero todavía no existe forma de crearlas dentro del sistema (hacen falta para probar el
   alta de productos sin tocar la base a mano).
2. `HU-05` — búsqueda de productos sobre `GET /api/products` (añadiendo parámetros de
   consulta; la forma `{ "data": … }` ya deja espacio para metadatos).
3. `HU-21` — CRUD de proveedores, con la misma forma de trabajo que la rebanada de
   productos.

**Deuda técnica conocida**

* Tipos de la API declarados a mano en `frontend/src/types/`. Si duplicarlos empieza a
  molestar, la salida es un workspace `shared/` o generar tipos con `zod` desde el
  backend; no hace falta hoy.
* No hay datos semilla (`prisma db seed`): hoy las categorías y proveedores de prueba se
  insertan a mano. Cuando exista el CRUD de categorías (HU-04) conviene dejar un
  `prisma/seed.ts` **de desarrollo** con datos de ejemplo para todo el equipo.
* El repositorio `main` ya no contiene `Historias_Usuario.xlsx` (se eliminó en el commit
  `0722505`). Las historias siguen descritas en este documento y en el tablero del sprint;
  si el equipo necesita el archivo, está en el historial de Git.


