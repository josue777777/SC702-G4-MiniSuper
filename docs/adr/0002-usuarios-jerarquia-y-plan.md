# 2. Usuarios con jerarquía, plan por negocio y camino a multi-negocio

- **Estado:** Aceptada (etapa 1 implementada)
- **Fecha:** 2026-10-28
- **Historias relacionadas:** HU-11 … HU-15 (criterios adicionales de usuarios y roles)

## Contexto

El sistema empezó con una cuenta única de dueño (HU-12). Eso no alcanzaba: los
compañeros no podían entrar, cualquiera podía adueñarse de una instalación nueva desde
`/setup`, y el negocio necesitaba personal con permisos distintos (caja, bodega).

Además, la visión del equipo es **alquilar la aplicación como servicio** (SaaS):

1. El proveedor (nosotros) crea un **negocio** cliente con un **plan** y le entrega una
   cuenta de **Encargado**.
2. El Encargado personaliza su negocio (nombre, logo) y crea a su personal (Cajero,
   Bodega) hasta el límite de su plan.
3. Si necesita más usuarios, paga más y se le amplía el plan.

## Decisión

### Roles fijos con jerarquía

| Rol | Quién es | Rango |
| --- | --- | --- |
| Administrador | El proveedor de la plataforma | 3 |
| Encargado | El dueño del negocio cliente | 2 |
| Cajero, Bodega | Personal del negocio | 1 |

- Los permisos de cada rol están en **un solo archivo**:
  `backend/src/auth/permissions.ts`. Cada ruta de la API exige el suyo (`403` si falta).
- **Nadie da más poder del que tiene** (`canManageRole`): solo se administran usuarios de
  rango **menor** al propio. El Encargado maneja a Cajero y Bodega, nunca a otro
  Encargado ni al Administrador. El Administrador maneja a todos.
- Las reglas las aplica el **servidor**. El frontend solo oculta lo que no corresponde.

### Lo personal, separado de lo del negocio

| Qué | Dónde se guarda | Quién lo cambia |
| --- | --- | --- |
| Apariencia (color, tamaño de letra) | `UserPreferences` (una fila por usuario) | Cada usuario, la suya |
| Datos y logo del negocio | `BusinessSettings` | Administrador y Encargado |
| Límite de usuarios del plan | `BusinessSettings.maxUsers` | Solo el Administrador |

- `UserPreferences` va en su **propia tabla** y no en `User`: `User` guarda solo lo de
  acceso y seguridad, y la apariencia no se mezcla con eso.
- Los colores son una **paleta fija** con contraste comprobado (WCAG AA), no un selector
  libre: un color mal elegido puede dejar texto ilegible.

### Límite del plan

- Cuentan los usuarios **activos** que no son Administrador (el proveedor no ocupa cupo).
- Crear o reactivar un usuario revisa el límite **dentro de una transacción con la fila
  del plan bloqueada** (`SELECT … FOR UPDATE`). Así, dos altas simultáneas nunca lo
  superan. Hay una prueba con PostgreSQL real que lo demuestra (6 altas simultáneas con 1
  cupo libre: entra 1).
- Bajar el límite no desactiva a nadie: solo impide crear o reactivar hasta que haya cupo.
- La base protege los datos con `CHECK`: el plan permite al menos 1 usuario, y el logo
  nunca queda a medias (imagen y tipo van juntos).

## Etapas

| Etapa | Qué incluye | Estado |
| --- | --- | --- |
| **1. Un negocio, pensado para crecer** | Roles con jerarquía, apariencia por usuario, datos y logo del negocio, límite de usuarios del plan | **Hecha** |
| 2. Multi-negocio | Tabla `Business`; columna `businessId` en usuarios, productos, ventas y demás; el servidor filtra **siempre** por el negocio de la sesión; panel del proveedor; pruebas de aislamiento («el negocio A nunca ve datos del negocio B») | Pendiente |
| 3. Cobro | Planes con precio, pagos y **suspensión** (no borrado) del negocio que no paga | Pendiente |

La etapa 1 no se rehace en la etapa 2: `BusinessSettings` pasa a ser la tabla de negocios
y a cada tabla se le agrega a qué negocio pertenece.

## Consecuencias

- **A favor:** el sistema ya se usa con varias personas y permisos distintos; el modelo
  coincide con el de una aplicación que se alquila por plan; la seguridad está en el
  servidor y probada.
- **En contra:** los roles no se pueden personalizar desde la pantalla. Cambiar un
  permiso es editar `permissions.ts`, a propósito, para mantenerlo simple y auditable.
- **Pendiente:** registrar **quién** hizo cada venta o movimiento (columna de autor). Se
  agrega con una migración cuando una historia lo pida.
