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
npm run db:migrate     # crea las tablas
npm run dev            # inicia backend y frontend
```

La aplicación queda en http://localhost:5173 y la API en http://localhost:4000/api.

## Comandos principales

| Comando             | Descripción                             |
| ------------------- | --------------------------------------- |
| `npm run dev`       | Inicia backend y frontend en desarrollo |
| `npm run build`     | Compila el proyecto                     |
| `npm test`          | Ejecuta las pruebas                     |
| `npm run lint`      | Revisa el estilo del código             |
| `npm run typecheck` | Revisa los tipos de TypeScript          |
| `npm run db:studio` | Abre el explorador de la base de datos  |

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
- [Decisiones de arquitectura](docs/adr/): registro de las decisiones técnicas.

## Equipo

Grupo 4 · SC-702 · Profesor: José Pablo Rodríguez Ledezma

- José Daniel Aguilar Aguilar
- Heblyn Josué Navarro Barrantes
- Bayron González Andrade
- Adriela López Paniagua
