# SC702-G4-MiniSuper

Sistema de gestión para el minisúper/abastecedor **Nuevo Amanecer**.
Curso **SC-702 — Diseño y Desarrollo de Sistemas**, **Grupo 4**.

Cubre las 40 historias de usuario del negocio: catálogo e inventario, acceso al sistema,
ventas de caja con lector de código de barras, fiados y abonos, proveedores y pedidos, y
reportes exportables. Lo usa una sola persona: el dueño del negocio.

Las historias de usuario se gestionan como _issues_ en el tablero de GitHub Projects
**Historias de Usuario**, cada una con su etiqueta de sprint, su responsable y sus
criterios de aceptación como lista de chequeo.

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
git clone https://github.com/josue777777/SC702-G4-MiniSuper.git
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
└── docker-compose.yml  PostgreSQL 16 para desarrollo
```

## Estado de las historias de usuario

| Sprint   | Historias                                                | Estado al 03/10/2026                        |
| -------- | -------------------------------------------------------- | ------------------------------------------- |
| Sprint 1 | HU-01 … HU-07                                            | Cerró sin historias completadas; se heredan |
| Sprint 2 | HU-01 … HU-07 (heredadas), HU-08 … HU-15, HU-31 … HU-37  | En curso: HU-01, HU-02 y HU-03 completadas  |
| Sprint 3 | HU-16 … HU-23, HU-38 … HU-40                             | Pendiente                                   |
| Sprint 4 | Refinamiento (ajustes, corrección de errores y pulido) ¹ | Pendiente                                   |

¹ HU-24 … HU-30 (pedido en PDF y reportes) tienen hoy la etiqueta _Sprint 4_ en el tablero;
falta definir el sprint en que se desarrollan.

El estado actualizado de cada historia está en el tablero de GitHub Projects. La base de
datos ya tiene las tablas de los tres módulos funcionales: productos e inventario
(`Product`, `Category`, `InventoryMovement`), acceso, ventas y clientes (`User`, `Sale`,
`SaleItem`, `Customer`, `CreditPayment`) y proveedores y pedidos (`Supplier`,
`SupplierProduct`, `PurchaseOrder`, `PurchaseOrderItem`).

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

- Tablero de GitHub Projects **Historias de Usuario** — las 40 historias como issues, con
  su sprint, responsable y criterios de aceptación.

### Documentación técnica — José Daniel Aguilar

Elaborada por José Daniel Aguilar junto con la base del proyecto (29/09/2026).

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — capas, modelo de datos, entorno,
  convenciones y receta para implementar una historia.
- [`docs/adr/0001-stack-selection.md`](docs/adr/0001-stack-selection.md) — tecnologías
  usadas en la implementación, dentro de las opciones del documento de requerimientos.

> **Pendiente de revisión (José Daniel Aguilar):** estos dos documentos todavía hablan de
> 30 historias y mencionan `Historias_Usuario.xlsx`, que ya no está en el repositorio.
> Deben actualizarse a las 40 historias del tablero de GitHub Projects.

## Integrantes

Grupo 4 — SC-702 (Diseño y Desarrollo de Sistemas):

- Aguilar Aguilar José Daniel
- Navarro Barrantes Heblyn Josué
- González Andrade Bayron
- López Paniagua Adriela

La asignación de cada historia se consulta en el campo _Assignees_ de su issue en el
tablero de GitHub Projects.
