# 1. Selección del stack tecnológico

- **Estado:** Aceptada
- **Fecha:** 2026-09-30
- **Historias relacionadas:** todas (es la base sobre la que se implementan HU-01 … HU-30)

## Contexto

El proyecto es un sistema de gestión para un minisúper/abastecedor: catálogo e inventario,
ventas de caja con lector de código de barras, fiados, proveedores, pedidos y reportes
exportables. Lo usa **un único dueño** del negocio, desde una computadora del local, con
lectores de código de barras USB y una caja con conexión intermitente. El equipo son
estudiantes de SC-702 que deben poder repartirse 30 historias en 4 sprints sin pelearse con
el código ni con la base de datos.

Lo que exige el dominio condiciona el stack:

* Montos exactos (precio, costo, utilidad, deuda de fiado) → tipos decimales y
  transacciones.
* Reportes con filtros y agregaciones (HU-25 … HU-30) → consultas relacionales reales.
* Varios integrantes migrando el esquema en paralelo → el esquema debe estar en código
  versionado y auditable.
* Interfaz de caja rápida y validación inmediata → SPA con estado local.

## Decisión

| Capa | Tecnología | Versión |
| --- | --- | --- |
| Frontend | React + Vite + TypeScript | React 19, Vite 8, TS 6 |
| Ruteo | React Router | v7 |
| API | Node.js + Express + TypeScript | Express 5 |
| Validación de entrada | Zod | v4 |
| Acceso a datos | Prisma ORM + adaptador `@prisma/adapter-pg` | Prisma 7.10 |
| Base de datos | PostgreSQL | 16 (Docker) |
| Pruebas | Vitest | v5 |
| Formato / calidad | Prettier + ESLint (flat config) | — |
| Monorepo | npm workspaces (`backend`, `frontend`) | npm 10+ |

Decisiones dentro de la decisión:

1. **Prisma 7 y no Prisma 8.** Prisma 8 está en `8.0.0-rc.*` (release candidate). La
   versión fija es `7.10.0`, que ya es ESM-first y usa conductores nativos
   (`@prisma/adapter-pg`) en lugar de un motor binario, con lo que el `node_modules`
   pesa menos y no hay descargas de binarios en cada máquina.
2. **Express y no NestJS.** Nest aporta un contenedor de inyección de dependencias,
   decoradores y un módulo por recurso. Con un solo usuario, 12 tablas y un equipo
   estudiante, ese andamiaje tapa las capas que el proyecto necesita aprender a
   separar (routes → controllers → services → repositories), que es justo el objetivo
   académico. La composición de dependencias se hace a mano en el archivo de rutas
   (`health.routes.ts`), que es legible sin añadir un framework adicional.
3. **Prisma y no TypeORM.** Prisma genera el cliente tipado desde `schema.prisma`, así
   que un error de nombre de columna se detecta al compilar y no en la tercera
   ejecución de la demo. Las migraciones son archivos SQL versionados, revisables en
   cada PR.
4. **PostgreSQL y no SQL Server.** PostgreSQL 16 en Docker arranca igual en la máquina
   de los cuatro integrantes; SQL Server exige Windows Server/Express, más RAM y una
   instalación más pesada. El dominio no usa ninguna característica de SQL Server.
5. **CSS plano y no Tailwind ni una librería de componentes.** La interfaz son
   formularios, tablas y una barra lateral. Un `global.css` de ~200 líneas se puede leer
   entero; una librería de UI añadiría decisiones de versión y tema sin resolver ningún
   requisito.
6. **Sin estado global (Redux/Zustand) por ahora.** El estado de cada pantalla vive en su
   hook; el único dato compartido entre pantallas es la sesión, que se resolverá con el
   token de HU-11. Si más adelante hay que compartir colecciones grandes, se añade un
   store, no antes.

## Consecuencias

**Positivas**

* Un solo lenguaje (TypeScript) y un solo formato (Prettier) en los dos workspaces.
* `npx prisma validate` y `npm run typecheck` detectan la mayoría de los errores de
  datos antes de ejecutar nada.
* Las migraciones versionadas permiten que cuatro personas trabajen sobre el mismo
  esquema sin borrarse tablas entre sí.
* El backend no compila ni descarga motores nativos: `npm install` es predecible.

**Negativas / asumidas**

* Prisma 7 cambió varias costumbres de la versión 6 (generador `prisma-client`, archivo
  `prisma7.config.ts`, `generate` ya no automático tras migrar, `.env` no se carga solo).
  Está documentado en `docs/ARCHITECTURE.md` §7 y en los comentarios del código para que
  nadie lo descubra a las tres de la mañana.
* La composición manual de dependencias no escala infinitamente; con 30 historias y un
  equipo de cuatro es suficiente y explícito.
* Los tipos de la API se declaran a mano en el frontend (`frontend/src/types/`); se
  aceptó esa duplicación a cambio de no añadir un workspace `shared/` ni generación de
  tipos. Ver §11 de la arquitectura.

## Alternativas descartadas

| Alternativa | Motivo del descarte |
| --- | --- |
| NestJS | Sobrediseño para un sistema monousuario; oscurece las capas que hay que aprender |
| TypeORM | Cliente menos tipado, migraciones más frágiles al trabajar cuatro personas |
| Prisma 8 (RC) | Versión no estable para un proyecto semestral |
| SQL Server | Peso de instalación y licencia; sin ventaja para este dominio |
| Next.js / SSR | No hay requisitos de SEO ni de contenido público; la app es interna |
| Tailwind / MUI | Añade dependencias y decisiones de tema sin requerimiento funcional |
| MySQL / MariaDB | Sin ventaja frente a PostgreSQL, que ya está en el stack del curso |
| Python/Django | El equipo trabaja en TypeScript; partir el stack duplicaría el esfuerzo |
