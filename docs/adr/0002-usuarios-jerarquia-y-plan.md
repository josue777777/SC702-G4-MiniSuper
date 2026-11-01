# 2. Usuarios con jerarquía, plataforma multi-negocio y planes

- **Estado:** Aceptada (etapas 1 y 2 implementadas)
- **Fecha:** 2026-10-28
- **Historias relacionadas:** HU-11 … HU-15 (criterios adicionales de usuarios y roles)

## Contexto

El sistema empezó con una cuenta única de dueño (HU-12). Eso no alcanzaba: los
compañeros no podían entrar, cualquiera podía adueñarse de una instalación nueva desde
`/setup`, y el negocio necesitaba personal con permisos distintos (caja, bodega).

Además, el sistema debe poder atender **varios negocios** desde una misma plataforma:

1. El Administrador de la plataforma crea un **negocio** con su **nivel de cuenta**
   (límite de usuarios) y le entrega una cuenta de **Encargado**.
2. El Encargado personaliza su negocio (nombre, logo) y crea a su personal (Cajero,
   Bodega) hasta el límite de su nivel de cuenta.
3. Si necesita más usuarios, los **solicita**; el Administrador aprueba o rechaza.
4. La plataforma administra los negocios **por encima** (nivel de cuenta, uso,
   estado), pero **no ve la información interna** de ningún negocio (ventas, productos,
   clientes).

## Decisión

### Roles fijos con jerarquía

| Rol | Quién es | Pertenece a | Administra a |
| --- | --- | --- | --- |
| Administrador | Quien administra la plataforma | Ningún negocio | Administradores y Encargados |
| Encargado | El dueño del negocio | Su negocio | Cajero y Bodega de su negocio |
| Cajero, Bodega | Personal del negocio | Su negocio | Nadie |

- Los permisos de cada rol están en **un solo archivo**:
  `backend/src/auth/permissions.ts`. Cada ruta de la API exige el suyo (`403` si falta).
- El Administrador tiene solo `platform.manage` y `users.manage`: **ningún permiso de
  negocio**. Para probar módulos, el equipo se crea un Encargado como cualquier cliente.
- **Nadie da más poder del que tiene** (`canManageRole`), y el Encargado solo ve y maneja
  usuarios de **su** negocio.
- Las reglas las aplica el **servidor**. El frontend solo oculta lo que no corresponde.

### Multi-negocio: una base compartida, cada fila con su dueño

- Tabla `Business` (datos, logo, plan y estado de cada cliente). Las tablas raíz
  (`Category`, `Product`, `Customer`, `Sale`, `Supplier`, `PurchaseOrder` y `User`)
  llevan `businessId`. Las tablas hijas (líneas de venta, movimientos…) no lo repiten:
  heredan el negocio de su padre (normalización).
- **Aislamiento en tres capas:**
  1. **Middleware** `requireBusiness`: los módulos de negocio exigen que el usuario
     pertenezca a uno (`403` a la plataforma).
  2. **Repositorios atados a un negocio**: cada uno se construye con
     `new XRepository(businessId)` y **todas** sus consultas filtran por él; el
     `businessId` sale de la sesión, nunca de lo que manda el navegador.
  3. **La base de datos**: claves foráneas compuestas (`Product(categoryId, businessId)`
     → `Category(id, businessId)`, igual venta → cliente y pedido → proveedor) hacen
     imposible mezclar filas de dos negocios aunque el código fallara. Un `CHECK` exige
     que solo el Administrador no tenga negocio.
- Los únicos son **por negocio**: dos negocios pueden tener el producto `P001` o la
  categoría «Bebidas».
- Hay pruebas de aislamiento con PostgreSQL real (`tenant-isolation.integration.test.ts`):
  el negocio B no ve, cambia ni vende nada del negocio A.

### Plan: Encargado + N

- Plan 0 = solo el Encargado; cada nivel suma un usuario (`maxUsers = 1 + extraUsers`).
- Cuentan los usuarios **activos** del negocio. Crear o reactivar uno revisa el límite
  **dentro de una transacción con la fila del negocio bloqueada** (`SELECT … FOR UPDATE`):
  dos altas simultáneas nunca lo superan (probado con 6 altas a la vez y 1 cupo libre).
- Bajar el plan no desactiva a nadie: solo impide crear o reactivar hasta que haya cupo.
- **Solicitudes** (`PlanRequest`): el Encargado pide N usuarios más (con una nota
  opcional). Llega a la bandeja del
  Administrador, que aprueba (el plan sube y **el Encargado crea los usuarios**) o
  rechaza. Un índice único parcial impide dos solicitudes pendientes del mismo negocio.
- **Suspensión**: un negocio suspendido no puede entrar (ni con sesiones abiertas). Sus
  datos no se borran.

### Marca: lo de la plataforma y lo del negocio

| Qué | Dónde se guarda | Quién lo cambia |
| --- | --- | --- |
| Nombre del sistema | `PlatformSettings` | Solo el Administrador |
| Nombre, datos y logo del negocio | `Business` | Solo el Encargado de ese negocio |
| Apariencia (color, tamaño de letra) | `UserPreferences` (una fila por usuario) | Cada usuario, la suya |

- El nombre del sistema se ve en el login y arriba del menú; el del negocio, debajo. El
  pie del menú conserva el crédito de los creadores del sistema.
- `UserPreferences` va en su **propia tabla** y no en `User`: `User` guarda solo lo de
  acceso y seguridad.
- Los colores son una **paleta fija** con contraste comprobado (WCAG AA).

## Etapas

| Etapa | Qué incluye | Estado |
| --- | --- | --- |
| **1. Un negocio, pensado para crecer** | Roles con jerarquía, apariencia por usuario, datos y logo del negocio, límite de usuarios | **Hecha** |
| **2. Multi-negocio** | `Business` con `businessId` en las tablas; repositorios atados al negocio; claves foráneas compuestas; panel de la plataforma (negocios, planes, solicitudes, suspensión); pruebas de aislamiento | **Hecha** |

La migración `20261029120000_multi_business` convierte una base de la etapa 1: crea un
negocio con los datos de `BusinessSettings`, le asigna todos los datos y usuarios
existentes (menos los administradores) y borra `BusinessSettings`.

## Consecuencias

- **A favor:** un mismo sistema atiende a varios negocios con su propio límite de
  usuarios; la plataforma no puede ver los datos de ningún negocio; el aislamiento no depende de que nadie
  se olvide de un `where`, porque la base también lo exige.
- **En contra:** cada módulo nuevo del negocio tiene que seguir el patrón de repositorio
  atado al negocio (ver `docs/USUARIOS-Y-ROLES.md`, punto 5). Los roles no se
  personalizan desde la pantalla, a propósito, para mantenerlo simple y auditable.
- **Pendiente:** registrar **quién** hizo cada venta o movimiento (columna de autor).
