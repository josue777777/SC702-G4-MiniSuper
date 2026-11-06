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

### Datos de prueba

Para probar todo el sistema con datos realistas:

```bash
# en backend/.env:  DEMO_PASSWORD=UnaClaveDePrueba123
npm run db:seed:demo
```

Crea el negocio **«Minisúper Demo»**: unos 500 productos en 16 categorías (con código de
barras, mínimos y vencimientos), 12 proveedores, 40 clientes, y **un año** de ventas
(~5 700), pedidos, devoluciones, conteos físicos y abonos a fiados. Todo cuadra como si se
hubiera usado la aplicación: el stock de cada producto es el saldo de su último
movimiento. Tarda unos segundos.

- Entre con `demo.encargado`, `demo.cajero` o `demo.bodega` y la contraseña de
  `DEMO_PASSWORD` (no se sube al repositorio).
- No toca sus otros negocios; si el demo ya existe, lo rehace con fechas al día.
- No corre en producción. Si avisa que faltan migraciones, corra antes
  `npm run db:migrate`.

El código está en `backend/src/scripts/demo/` (el generador simula el año día por día).

### Usuarios y roles

No hay registro público. El **administrador inicial** se crea con `npm run db:seed`,
usando `ADMIN_NAME`, `ADMIN_EMAIL` y `ADMIN_PASSWORD` de `backend/.env` (vienen de ejemplo
en `backend/.env.example`). Esa contraseña es temporal: el sistema obliga a cambiarla en
el primer ingreso. El comando se puede correr varias veces: si ya hay un administrador
activo, no hace nada.

Si se levanta el sistema sin ningún administrador activo, la terminal del backend lo avisa
al arrancar con estos mismos pasos. El aviso sale solo ahí: la pantalla de login no
revela si el sistema tiene usuarios.

El sistema es **multi-negocio**. El Administrador es la
**plataforma**: crea cada negocio con su **Encargado** y su nivel de cuenta en **Negocios**, y
responde las solicitudes de más usuarios en **Solicitudes**. **No ve los datos de ningún
negocio.** Cada Encargado crea a su personal en **Configuración › Usuarios**. Roles
(fijos; la matriz está en `backend/src/auth/permissions.ts`):

| Rol           | Qué puede usar                                                               |
| ------------- | ---------------------------------------------------------------------------- |
| Administrador | La plataforma: negocios, niveles de cuenta, solicitudes y nombre del sistema |
| Encargado     | Dueño de su negocio: todo el negocio, datos y logo, su Cajero y Bodega       |
| Cajero        | Ventas y clientes; consulta productos sin modificarlos                       |
| Bodega        | Inventario, kardex, pedidos a proveedor y reportes de inventario             |

Hay **jerarquía**: cada uno administra solo usuarios de rango menor. El **nivel de cuenta** es
«Encargado + N usuarios»; si se llena, el Encargado solicita más y el Administrador
aprueba. Cada usuario elige su **apariencia** (color y tamaño de letra) en
Configuración › Apariencia. Guía para programar módulos en
[docs/USUARIOS-Y-ROLES.md](docs/USUARIOS-Y-ROLES.md); decisiones en
[docs/adr/0002-usuarios-jerarquia-y-nivel-de-cuenta.md](docs/adr/0002-usuarios-jerarquia-y-nivel-de-cuenta.md) y
[docs/adr/0003-recuperacion-de-acceso.md](docs/adr/0003-recuperacion-de-acceso.md);
camino de crecimiento a ERP en [docs/ESCALABILIDAD.md](docs/ESCALABILIDAD.md).

Cada usuario tiene un **nombre de usuario** generado de su nombre (`jnavarro`) y entra con
«Correo o usuario»; el correo es opcional para el personal. Al crearlo recibe una
contraseña temporal (se muestra una sola vez, junto con su usuario). Si alguien
olvida su contraseña: el Administrador y el Encargado la recuperan con un enlace a su
correo; al personal se la restablece su Encargado. Los usuarios no se borran: se
desactivan. Desactivar, cambiar el rol o restablecer la contraseña cierra las sesiones
abiertas de ese usuario.

> **Si ya tenía la base de antes (actualización a multi-negocio):**
>
> ```bash
> npm ci              # instala exactamente lo del package-lock.json
> npm run db:migrate  # crea el negocio con sus datos de antes y aplica lo nuevo
> npm run dev
> ```
>
> La migración pasa **todos sus datos** (productos, ventas, clientes…) y sus usuarios
> Encargado, Cajero y Bodega a un negocio con el nombre que tenía configurado. Las cuentas
> **Administrador** quedan como plataforma: ya no ven productos ni ventas. Para seguir
> usando sus datos, entre como Administrador, vaya a Configuración › Usuarios › Nuevo
> usuario, elija el rol **Encargado** y ese negocio, y entre con ese Encargado.

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

Las reglas están en [`CONTRIBUTING.md`](CONTRIBUTING.md) y son de **lectura
obligatoria** (el CI no deja pasar un PR sin confirmarlo). En resumen:

1. Tomar una historia del tablero
   ([issues](https://github.com/josue777777/SC702-G4-MiniSuper/issues)) y asignársela.
2. Crear una rama desde `develop`.
3. Antes de subir: `npm run format:check`, `npm run lint`, `npm run typecheck` y las
   pruebas de lo que se tocó.
4. Abrir el PR hacia `develop`, marcar la casilla «Leí y cumplo `CONTRIBUTING.md`» y
   esperar el CI en verde. `develop` pasa a `main` cuando todo está en verde.

## Documentación

Todo documento del repositorio está enlazado aquí o desde las reglas: si no está en
esta lista, no se usa.

| Documento                                    | Para qué sirve                                                                                                                                                                                                                                  |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Reglas del equipo](CONTRIBUTING.md)         | **Lectura obligatoria.** Una página con las reglas generales                                                                                                                                                                                    |
| [Guía de pantallas](docs/PANTALLAS.md)       | **Antes de crear o cambiar una pantalla.** Modales, paginación, buscadores, reportes, filtros y diseño igual en todo el sistema                                                                                                                 |
| [Guía del código](docs/guia/README.md)       | **Para entender y buscar.** Una página por módulo: qué hace, flujo de información, librerías, cálculos y dónde buscar cuando algo falla                                                                                                         |
| [Arquitectura](docs/ARCHITECTURE.md)         | Capas, modelo de datos, receta para una historia nueva y reglas de cálculo de ventas y reportes                                                                                                                                                 |
| [Usuarios y roles](docs/USUARIOS-Y-ROLES.md) | Cómo funciona el acceso y qué hacer al programar un módulo nuevo                                                                                                                                                                                |
| [Escalabilidad](docs/ESCALABILIDAD.md)       | Reglas de datos para crecer sin rehacer (negocio de la sesión, dinero, stock, documentos)                                                                                                                                                       |
| [Decisiones de arquitectura](docs/adr/)      | Por qué se decidió cada cosa: [stack](docs/adr/0001-stack-selection.md), [usuarios y multi-negocio](docs/adr/0002-usuarios-jerarquia-y-nivel-de-cuenta.md), [recuperación de acceso](docs/adr/0003-recuperacion-de-acceso.md)                   |
| [Instrucciones para IA](AGENTS.md)           | Lo que leen las herramientas de IA. [`CLAUDE.md`](CLAUDE.md), [`GEMINI.md`](GEMINI.md) y [`copilot-instructions.md`](.github/copilot-instructions.md) llevan a él y repiten las reglas críticas; `npm run check:ai` revisa que no falte ninguna |

## Equipo

Grupo 4 · SC-702 · Profesor: José Pablo Rodríguez Ledezma

- José Daniel Aguilar Aguilar
- Heblyn Josué Navarro Barrantes
- Bayron González Andrade
- Adriela López Paniagua
