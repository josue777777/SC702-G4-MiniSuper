# SC702-G4-MiniSuper

Sistema de gestión para el minisúper/abastecedor **Nuevo Amanecer**.
Curso **SC-702 — Diseño y Desarrollo de Sistemas**, **Grupo 4**.

Cubre las 30 historias de usuario del negocio: catálogo e inventario, ventas de caja con
lector de código de barras, fiados y abonos, proveedores y pedidos, y reportes
exportables. Lo usa una sola persona: el dueño del negocio.

> Esta rama deja **la base arquitectónica** lista para implementar historias: monorepo,
> backend en capas, esquema de datos migrado, frontend enrutado y una rebanada vertical
> (`/api/health`) funcionando de punta a punta.
> La guía de diseño está en [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) y las
> decisiones en [`docs/adr/`](docs/adr/).

---

## Stack

| Capa           | Tecnología                                   |
| -------------- | -------------------------------------------- |
| Frontend       | React 19 + Vite 8 + TypeScript, React Router |
| Backend        | Node.js + Express 5 + TypeScript             |
| Acceso a datos | Prisma 7 (+ `@prisma/adapter-pg`)            |
| Base de datos  | PostgreSQL 16 en Docker                      |
| Validación     | Zod                                          |
| Pruebas        | Vitest                                       |
| Calidad        | ESLint + Prettier                            |

## Requisitos

- **Node.js 20.19 o superior** (`node -v`) y npm 10+.
- **Docker Desktop** para correr PostgreSQL, **o** un PostgreSQL 14+ propio.
- Cliente Git configurado con la cuenta de cada integrante.

---

## Instalación

```bash
# 1. Clonar el repositorio y entrar a la carpeta
git clone https://github.com/danielaguilar14/SC702-G4-MiniSuper.git
cd SC702-G4-MiniSuper

# 2. Instalar las dependencias de los dos workspaces (backend y frontend)
npm install

# 3. Crear los archivos de entorno locales (valores de desarrollo, no secretos)
cp .env.example .env
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env   # opcional: funciona sin este archivo

# 4. Levantar PostgreSQL
npm run db:up                            # equivale a docker compose up -d

# 5. Crear las tablas (primera vez) y generar el cliente Prisma
npm run db:migrate                       # prisma migrate dev
npm run prisma:generate

# 6. Arrancar backend y frontend juntos
npm run dev
```

Con `npm run dev` quedan disponibles:

| URL                                       | Qué es                               |
| ----------------------------------------- | ------------------------------------ |
| http://localhost:5173                     | Interfaz web (Vite)                  |
| http://localhost:4000/api/health          | Estado del backend                   |
| http://localhost:4000/api/health/database | Estado de la conexión a PostgreSQL   |
| http://localhost:5173/login               | Pantalla de acceso (en construcción) |

Al abrir el panel (`http://localhost:5173`) la tarjeta **Estado del sistema** llama a los
dos endpoints anteriores y muestra si el backend y la base están conectados. Es la
rebanada vertical de referencia: `React → health.service.ts → api-client.ts → Express →
Prisma → PostgreSQL`.

## Scripts (desde la raíz)

| Comando                             | Qué hace                                                 |
| ----------------------------------- | -------------------------------------------------------- |
| `npm run dev`                       | Backend con `tsx watch` + frontend con Vite, en paralelo |
| `npm run build`                     | Compila backend (`tsc`) y frontend (`vite build`)        |
| `npm run lint`                      | ESLint en los dos workspaces                             |
| `npm run typecheck`                 | `tsc --noEmit` en los dos workspaces                     |
| `npm test`                          | Vitest (pruebas unitarias del backend)                   |
| `npm run format`                    | Prettier sobre todo el repositorio                       |
| `npm run db:up` / `npm run db:down` | Sube o baja el contenedor de PostgreSQL                  |
| `npm run db:migrate`                | `prisma migrate dev`: aplica y crea migraciones          |
| `npm run prisma:generate`           | Regenera `backend/src/generated/prisma`                  |
| `npm run prisma:validate`           | Valida `schema.prisma` sin tocar la base                 |
| `npm run db:studio`                 | Prisma Studio (explorador de datos)                      |

Para trabajar con un solo workspace: `npm run dev -w backend`, `npm run lint -w frontend`.

---

## Estructura del repositorio

```
.
├── backend/            API REST (Express + Prisma)
│   ├── prisma/         schema.prisma y migraciones
│   ├── prisma7.config.ts   configuración de la CLI de Prisma (cadena de conexión)
│   └── src/
│       ├── app.ts      configuración de Express
│       ├── server.ts   arranque del servidor HTTP
│       ├── routes → controllers → services → repositories
│       ├── validators/ esquemas Zod de entrada
│       ├── middleware/ errores y 404
│       └── generated/  cliente Prisma (generado, no versionado)
├── frontend/           SPA (React + Vite)
│   └── src/
│       ├── app/        componente raíz y rutas
│       ├── layouts/    MainLayout (menú lateral)
│       ├── pages/      una página por ruta
│       ├── features/   un folder por dominio (al implementar las HU)
│       ├── services/   api-client.ts y los services de cada dominio
│       └── types/      contratos tipados de la API
├── docs/
│   ├── ARCHITECTURE.md capas, modelo de datos, receta para agregar una HU
│   └── adr/            decisiones de arquitectura
├── docker-compose.yml  PostgreSQL 16 para desarrollo
└── Historias_Usuario.xlsx  las 30 historias con su checklist
```

## Estado de las historias de usuario

| Módulo                             | Historias     | Estado                                                                                  |
| ---------------------------------- | ------------- | --------------------------------------------------------------------------------------- |
| 1. Productos e inventario          | HU-01 … HU-10 | Base lista (tablas `Product`, `Category`, `InventoryMovement`)                          |
| 2. Acceso, ventas y clientes       | HU-11 … HU-20 | Base lista (tablas `User`, `Sale`, `SaleItem`, `Customer`, `CreditPayment`)             |
| 3. Proveedores, pedidos y reportes | HU-21 … HU-30 | Base lista (tablas `Supplier`, `SupplierProduct`, `PurchaseOrder`, `PurchaseOrderItem`) |

Cada pantalla del frontend declara en su propio archivo qué historias le faltan y cuáles
son las tareas pendientes, de modo que el tablero del sprint y el código coinciden.

## Trabajando en una historia

```bash
git switch -c feat/hu-01-registrar-producto
# implementar siguiendo la receta de docs/ARCHITECTURE.md §8
npm run lint && npm run typecheck && npm test
git commit -m "feat: agregar registro de producto (HU-01)"
git push -u origin feat/hu-01-registrar-producto
```

Antes de subir un PR: `npm run build`, `npm run lint`, `npm run typecheck`, `npm test` y
`npm run prisma:validate` en verde, y `npm run format` aplicado.

## Solución de problemas

| Error                                                   | Causa y solución                                                                                                    |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `P1001: Can't reach database server at localhost:5432`  | PostgreSQL no está corriendo: `npm run db:up`. Si usa un PostgreSQL propio, ajuste `DATABASE_URL` en `backend/.env` |
| `password authentication failed for user "minisuper"`   | El `.env` de la raíz no coincide con el contenedor: copie `.env.example` a `.env` y vuelva a `npm run db:up`        |
| El puerto 5432 ya está ocupado por otro PostgreSQL      | Cambie `POSTGRES_PORT` en `.env` y use el mismo puerto dentro de `DATABASE_URL`                                     |
| `P2021: table does not exist`                           | Faltan migraciones: `npm run db:migrate`                                                                            |
| `Cannot find module '../generated/prisma/client.js'`    | No se ha generado el cliente: `npm run prisma:generate`                                                             |
| `ERR_MODULE_NOT_FOUND` al importar un archivo propio    | En el backend los imports relativos necesitan extensión `.js` (ESM)                                                 |
| `Cannot find name 'prisma'` tras editar `schema.prisma` | Volver a generar: `npm run prisma:generate`                                                                         |
| El frontend muestra «Backend no accesible»              | El backend no está corriendo, o cambió `VITE_API_URL`                                                               |

## Documentos del proyecto

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — capas, modelo de datos, entorno,
  convenciones y receta para implementar una historia.
- [`docs/adr/0001-stack-selection.md`](docs/adr/0001-stack-selection.md) — por qué este
  stack y qué alternativas se descartaron.
- `Historias_Usuario.xlsx` — las 30 historias con su checklist y sprint asignado.

## Integrantes

Grupo 4 — SC-702 (Diseño y Desarrollo de Sistemas). Ver la columna
_Módulo / Integrante asignado_ de `Historias_Usuario.xlsx` para la asignación por
historia.
