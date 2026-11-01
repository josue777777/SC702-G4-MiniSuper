# 3. Recuperación de acceso por capas

- **Estado:** Aceptada (capas 1 a 3 implementadas)
- **Fecha:** 2026-11-01
- **Historias relacionadas:** HU-13 (recuperar contraseña), HU-11 (login), HU-12 (usuarios)

## Contexto

Con la jerarquía de usuarios ([ADR 0002](0002-usuarios-jerarquia-y-plan.md)), cada quien
restablece la contraseña de los que están debajo. Pero quedaba un hueco: si el Encargado
olvida su contraseña y el Administrador no está disponible, el negocio no puede entrar.
Y el Administrador no tiene a nadie arriba.

## Decisión

Recuperación por capas, como los sistemas reales (Google Workspace, Microsoft 365,
Shopify, y puntos de venta como Square o Toast):

| Capa | Para quién | Cómo |
| --- | --- | --- |
| 1. Por correo | Administrador y Encargado | Enlace al correo con el que inician sesión |
| 2. Por su jefe directo | Cajero y Bodega (y respaldo de la capa 1) | Contraseña temporal que hay que cambiar al entrar |
| 3. Nunca un solo responsable | Administradores | Se recomienda tener al menos dos administradores activos |

Por qué el personal no usa la capa 1: muchas veces no tiene correo propio o usa uno
compartido, y el dueño mantiene el control de quién entra a su caja.

Nadie sube de rango para cubrir a otro: un Encargado nunca restablece a otro Encargado.

### Reglas de seguridad

1. El enlace lleva un token al azar de 256 bits; en la base solo se guarda su hash.
2. Vence en 30 minutos y sirve una vez (la actualización es atómica). Pedir otro, o
   cambiar la contraseña por otra vía, invalida el anterior.
3. La respuesta nunca revela si una cuenta existe ni su rol.
4. Límite de 3 enlaces por correo y 10 solicitudes por equipo cada hora.
5. Al cambiar la contraseña se cierran todas las sesiones de la cuenta.
6. Cada cambio queda en el registro de seguridad (`AccessEvent`) y, para Administrador y
   Encargado, llega un aviso por correo.

### Correo

Los services dependen de una interfaz `Mailer`; `MAIL_TRANSPORT` elige la implementación:
`console` (desarrollo), `outbox` (pruebas E2E) o `smtp` (producción, obligatorio).

## Consecuencias

- El Encargado y el Administrador ya no dependen de que otra persona esté disponible.
- Producción necesita un servicio de correo SMTP (por ejemplo Resend, SendGrid o Gmail).
- Mejoras previstas, registradas como criterios de sus historias:
  - el personal entra con un **usuario generado** (`jnavarro`) en vez de correo (HU-12);
  - **verificación en dos pasos** para Administrador y Encargado (HU-11);
  - **PIN rápido** para cambiar de cajero en un equipo compartido (HU-15).
