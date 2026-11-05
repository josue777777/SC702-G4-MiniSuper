# Usuarios y acceso

Historias: HU-11 a HU-15. Volver al [índice de la guía](README.md). La tabla de qué
puede hacer cada rol está en [USUARIOS-Y-ROLES.md](../USUARIOS-Y-ROLES.md); aquí se
explica **cómo funciona por dentro**.

## 1. Qué hace

- **Iniciar y cerrar sesión** con correo o nombre de usuario (HU-11, HU-15).
- **Usuarios** (Configuración › Usuarios): crear, editar, desactivar y restablecer la
  contraseña, siempre de un rango menor al propio y dentro del nivel de cuenta del
  negocio (HU-12).
- **Mi perfil**: nombre, correo y contraseña propios (HU-14); **Apariencia**: color y
  tamaño de letra de cada usuario.
- **Recuperar la contraseña** por correo (HU-13).
- **Datos del negocio** (Configuración › General): datos y logo.

## 2. Flujo de información

### Iniciar sesión (HU-11)

```text
Entrada   LoginPage.tsx: { login: "jnavarro" o "ana@correo.com", password }
   │
   ▼  POST /api/auth/login
controllers/auth.controller.ts → valida con loginSchema
   ▼
services/auth.service.ts → login()
   │   1. busca por correo (si tiene @) o por usuario (sin importar mayúsculas)
   │   2. verifica la contraseña con argon2 (utils/password.ts)
   │   3. usuario inexistente, contraseña mala o desactivado → el MISMO mensaje:
   │      «Usuario o contraseña incorrectos» (no revela cuál falló)
   │   4. firma el token de sesión (utils/session-token.ts)
   ▼
utils/session-cookie.ts → cookie httpOnly, sameSite=strict, 8 horas
   ▼
Responde  { data: usuario }   (el token NO viaja en el cuerpo: va en la cookie)
```

### Cada petición siguiente

```text
cookie de sesión → middleware/require-auth.middleware.ts
   │   verifica la firma y que no esté vencida; carga el usuario y compara
   │   passwordVersion y sessionVersion con la base
   ├─ ¿desactivado, firma falsa, contraseña o sesión cambiadas? → 401
   ├─ ¿debe cambiar la contraseña temporal? → solo se permite cambiarla
   ├─ requireBusiness: las rutas de un negocio exigen pertenecer a uno
   └─ requirePermission(read, write): GET usa el permiso de lectura y lo demás el de escritura
```

### Otras rutas

| Ruta | Para qué |
| --- | --- |
| `GET /api/auth/session` · `POST /api/auth/logout` | Quién soy · cerrar sesión (sube `sessionVersion`) |
| `GET/POST/PATCH /api/users` · `/:id/deactivate` · `/activate` · `/reset-password` | Administrar usuarios (`users.manage`) |
| `GET /api/users/username-suggestion?name=` | Sugerir el nombre de usuario |
| `GET/PATCH /api/profile` · `GET/PUT /api/profile/preferences` | Mi perfil y apariencia |
| `POST /api/auth/password/forgot` · `/reset` | Recuperar la contraseña por correo |
| `GET/PUT /api/business` · `/logo` | Datos y logo del negocio (`business.edit` para cambiarlos) |

### En el navegador

`features/auth/RequireSession.tsx` pide la sesión al abrir la app y manda al login si no
hay; `features/auth/RequirePermission.tsx` muestra «Acceso no permitido» si el rol no
tiene la sección; `layouts/navigation.ts` arma el menú solo con lo que el rol puede ver.
**La pantalla solo oculta: quien protege de verdad es el servidor.**

## 3. Librerías

| Librería | Qué resuelve aquí |
| --- | --- |
| **argon2** (argon2id) | Guardar contraseñas como hash lento a propósito, para que robar la base no revele las contraseñas |
| **node:crypto** (HMAC-SHA256, SHA-256, `randomInt`) | Firmar el token de sesión, guardar el token de recuperación como huella y generar contraseñas temporales al azar |
| **nodemailer** | Enviar el enlace de recuperación (según `MAIL_TRANSPORT`: en desarrollo se muestra en la consola y en las pruebas E2E se guarda en una carpeta) |
| **Zod** | Validar correo, usuario y la política de contraseñas |

## 4. Cálculos y reglas

### Token de sesión (`utils/session-token.ts`)

```text
token = base64url({ uid, pv, sv, exp }) + "." + base64url(HMAC-SHA256(secreto, payload))
  pv  = huella del hash de la contraseña → cambiar la contraseña invalida las sesiones
  sv  = sessionVersion → cerrar sesión o desactivar sube el número y el token viejo no sirve
  exp = ahora + 8 h
```

El navegador no puede inventar un token: sin el secreto del servidor la firma no
coincide.

### Nombre de usuario (`utils/username.ts`)

```text
«Juan Navarro»              → jnavarro   (inicial del nombre + primer apellido)
«Juan Carlos Navarro Mora»  → jnavarro   (con 3 o más palabras, el penúltimo)
Si jnavarro ya existe       → jnavarro2, jnavarro3…   (firstAvailable)
```

Sin tildes, en minúscula, y la base de datos garantiza que no se repita.

### Contraseña temporal (`utils/temporary-password.ts`)

12 caracteres al azar con al menos una letra y un número, **sin** los que se confunden
al dictarlos (`0/O`, `1/l/I`), mezclados con Fisher-Yates.

### Recuperación de contraseña (`password-recovery.service.ts`)

El enlace lleva un token al azar que vale **30 minutos** y sirve una sola vez. En la
base se guarda solo su huella SHA-256: quien lea la base no puede usar el enlace.

### Límite de intentos (`utils/login-rate-limiter.ts`)

```text
Login                      8 intentos fallidos por IP en 15 minutos
Pedir el correo de recuperación   3 por correo y 10 por IP en 1 hora
```

Pasado el límite por IP, el servidor responde 429 hasta que pase la ventana: así
nadie puede probar contraseñas sin fin. El límite por correo no avisa nada (no se
envía el correo, pero la respuesta es la misma), para no revelar que alguien lo
pidió. Se guarda en memoria: al reiniciar el servidor vuelve a cero.

### Límite de usuarios (nivel de cuenta)

```text
usuarios activos permitidos = 1 (el Encargado) + usuarios adicionales del negocio
Los administradores de la plataforma no cuentan.
Con el límite alcanzado no se puede crear ni reactivar: «El nivel de cuenta permite N…»
```

### Jerarquía

Administrador (3) > Encargado (2) > Cajero y Bodega (1). Cada uno administra solo
rangos menores, y nadie se desactiva ni se quita el rol a sí mismo.

## 5. Dónde buscar cuando algo falla

| Síntoma | Dónde mirar |
| --- | --- |
| No deja entrar con datos correctos | `auth.service.ts` (¿usuario desactivado? ¿negocio suspendido?) |
| Me saca de la sesión al cambiar la contraseña | Es lo esperado: `passwordVersion` cambió |
| Un rol ve una sección que no debería | `auth/permissions.ts` (un solo lugar) y `routes/index.ts` |
| «Su rol no tiene acceso a esta sección» (403) | El permiso de la ruta en `routes/index.ts` |
| «Demasiados intentos» (429) | `utils/login-rate-limiter.ts`: esperar a que pase la ventana |
| No llega el correo de recuperación | `MAIL_TRANSPORT` en `.env` (`console`, `outbox` o `smtp`) y `utils/mailer.ts` |
| «El nivel de cuenta permite N usuarios…» | `users.service.ts`: hay que desactivar a alguien o pedir más usuarios |

Pruebas: `backend/src/**/auth*.test.ts`, `users*.test.ts`, `profile*.test.ts`,
`password-recovery*.test.ts` y `e2e/tests/hu-11-…`, `hu-13-…`, `hu-14-…`.
