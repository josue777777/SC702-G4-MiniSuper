# Sistema Minisúper

Aplicación web para gestionar el inventario, las ventas, los fiados, los proveedores y los
reportes del **Abastecedor Nuevo Amanecer**, un minisúper de San Francisco de Heredia.

Proyecto del curso **SC-702 Diseño y Desarrollo de Sistemas** (Universidad Fidélitas),
desarrollado por el **Grupo 4**.

## Funcionalidades

- Registro, edición, búsqueda y categorización de productos.
- Control de existencias con alertas de stock bajo y de vencimiento.
- Lectura y generación de códigos de barras.
- Registro de ventas con efectivo o tarjeta, y fiado de clientes.
- Registro de proveedores y preparación de pedidos en PDF.
- Reportes de inventario, ventas, ganancias y deudas de clientes.

## Tecnologías

Arquitectura cliente-servidor desacoplada, con TypeScript en todas las capas.

| Capa           | Tecnología                     |
| -------------- | ------------------------------ |
| Cliente        | React + Vite (TypeScript)      |
| Servidor       | Node.js + Express (TypeScript) |
| Acceso a datos | Prisma ORM                     |
| Base de datos  | PostgreSQL (Docker)            |
| Pruebas        | Vitest                         |

## Requisitos

- Node.js 20.19 o superior y npm 10 o superior.
- Docker Desktop (para la base de datos PostgreSQL).
- Git.

## Instalación

```bash
git clone https://github.com/josue777777/SC702-G4-MiniSuper.git
cd SC702-G4-MiniSuper
npm install

cp .env.example .env
cp backend/.env.example backend/.env

npm run db:up          # levanta PostgreSQL
npm run db:migrate     # crea las tablas y genera el cliente de Prisma
npm run db:seed        # crea el administrador inicial (ver abajo)
npm run dev            # inicia backend y frontend
```

La aplicación queda en http://localhost:5173 y la API en http://localhost:4000/api.

### Usuarios y roles

No hay registro público. El **administrador inicial** se crea con `npm run db:seed`,
usando `ADMIN_NAME`, `ADMIN_EMAIL` y `ADMIN_PASSWORD` de `backend/.env` (vienen de ejemplo
en `backend/.env.example`). Esa contraseña es temporal: el sistema obliga a cambiarla en
el primer ingreso. El comando se puede correr varias veces: si ya hay un administrador
activo, no hace nada.

Si se levanta el sistema sin ningún administrador activo, la terminal del backend lo avisa
al arrancar con estos mismos pasos. El aviso sale solo ahí: la pantalla de login no
revela si el sistema tiene usuarios.

Después, el administrador crea a los demás en **Configuración › Usuarios**, con uno de
estos roles (fijos; la matriz está en `backend/src/auth/permissions.ts`):

| Rol           | Qué puede usar                                                   |
| ------------- | ---------------------------------------------------------------- |
| Administrador | Todo, incluida la Configuración (usuarios)                       |
| Encargado     | Todo el negocio, menos la Configuración                          |
| Cajero        | Ventas y clientes; consulta productos sin modificarlos           |
| Bodega        | Inventario, kardex, pedidos a proveedor y reportes de inventario |

Cada usuario nuevo recibe una contraseña temporal (se muestra una sola vez). Si alguien
olvida su contraseña, el administrador se la restablece. Los usuarios no se borran: se
desactivan. Desactivar, cambiar el rol o restablecer la contraseña cierra las sesiones
abiertas de ese usuario.

> **Si ya tenía la base de antes:** `npm run db:migrate` convierte la cuenta existente en
> Administrador, con la misma contraseña. No hace falta `db:seed`.

**Después de cada `git pull`** que traiga cambios en `backend/prisma/`, vuelva a ejecutar
`npm run db:migrate`: aplica las migraciones nuevas y regenera el cliente de Prisma. Si se
omite, la API responde «Ha ocurrido un error interno» y en la terminal del backend aparece
`Unknown field …`.

## Comandos principales

| Comando             | Descripción                             |
| ------------------- | --------------------------------------- |
| `npm run dev`       | Inicia backend y frontend en desarrollo |
| `npm run build`     | Compila el proyecto                     |
| `npm test`          | Ejecuta las pruebas                     |
| `npm run lint`      | Revisa el estilo del código             |
| `npm run typecheck` | Revisa los tipos de TypeScript          |
| `npm run db:studio` | Abre el explorador de la base de datos  |

### Pruebas E2E (Playwright)

Abren Chromium contra el backend y el frontend reales, sobre una base PostgreSQL
**exclusiva** para E2E (su nombre debe terminar en `_e2e`; las pruebas borran datos).
Con las migraciones ya aplicadas a esa base:

```bash
# Linux/macOS/Git Bash
E2E_DATABASE_URL="postgresql://usuario:clave@localhost:5432/minisuper_e2e?schema=public" npm run test:e2e
# Primera vez: npx playwright install chromium
```

Las capturas de evidencia y los resultados se guardan **fuera del repositorio**, en la
carpeta hermana `<repo>-evidencias/` (se puede cambiar con `EVIDENCE_DIR`).
Las pruebas de integración con PostgreSQL de `npm test` solo corren si `DATABASE_URL`
apunta a una base cuyo nombre termina en `_test`; si no, se omiten.

## Estructura

```
backend/    API REST (Express + Prisma)
frontend/   Aplicación web (React + Vite)
docs/       Documentación técnica
```

## Cómo contribuir

1. Tomar una historia de usuario del tablero
   [Historias de Usuario](https://github.com/josue777777/SC702-G4-MiniSuper/issues) y
   asignársela.
2. Crear una rama desde `main` con el formato `feat/hu-XX-descripcion`
   (o `fix/…`, `docs/…`).
3. Hacer commits pequeños con mensajes descriptivos: `feat: registrar producto (HU-01)`.
4. Antes de subir: `npm run lint`, `npm run typecheck` y `npm test` sin errores.
5. Abrir un pull request hacia `main` y pedir revisión a otro integrante.

## Documentación

- [Arquitectura del sistema](docs/ARCHITECTURE.md): capas, modelo de datos y convenciones.
- [Usuarios y roles](docs/USUARIOS-Y-ROLES.md): cómo funciona el acceso y qué hacer al programar un módulo nuevo.
- [Decisiones de arquitectura](docs/adr/): registro de las decisiones técnicas.

## Equipo

Grupo 4 · SC-702 · Profesor: José Pablo Rodríguez Ledezma

- José Daniel Aguilar Aguilar
- Heblyn Josué Navarro Barrantes
- Bayron González Andrade
- Adriela López Paniagua
