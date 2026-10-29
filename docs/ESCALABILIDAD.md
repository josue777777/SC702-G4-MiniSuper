# Escalabilidad: bases que ya tenemos y camino a un ERP

Este documento revisa, práctica por práctica, cómo está hoy el sistema frente a una
arquitectura SaaS multi-negocio y qué falta para crecer hacia un ERP (compras,
contratos, SICOP, sucursales…).

**La regla del proyecto:** primero se terminan y entregan las historias de usuario. Aquí
solo se hace **ahora** lo que es barato, protege los datos o evita rehacer trabajo; lo
demás queda **anotado con su camino**, para que después sea un paso natural y no una
reescritura.

Documentos relacionados: [ADR 0002](adr/0002-usuarios-jerarquia-y-plan.md) (multi-negocio
y planes) y [USUARIOS-Y-ROLES.md](USUARIOS-Y-ROLES.md) (cómo programar un módulo).

---

## Resumen

| Práctica | Hoy | Cuándo |
| --- | --- | --- |
| Identificador de negocio en las tablas | ✅ `businessId` en las tablas raíz, con FK compuestas | Ampliar a tablas hijas junto con RLS (después) |
| Filtro automático por negocio | 🟡 Repositorios atados al negocio + pruebas de aislamiento | RLS de PostgreSQL (después) |
| Consecutivos por negocio | 🔴 **Global**: un negocio deduce el volumen de otro | **Ahora** |
| Idempotencia | 🟡 Solo en ventas, y la llave es única global | **Ahora** (por negocio) · resto después |
| Jerarquía de tres niveles | 🟡 Plataforma → Negocio → Usuario; faltan sucursales | Después |
| Límites del plan en el servidor | ✅ Cupos de usuarios con bloqueo de fila | Generalizar a «funciones del plan» (después) |
| Pasarela de pagos desacoplada | ✅ Estado interno del negocio (activo/suspendido) | Webhooks (después) |
| Cabecera-detalle | ✅ Ventas, pedidos, ajustes; kardex como libro | Contratos y SICOP con el mismo patrón |
| Artículos genéricos (bienes y servicios) | 🟡 Solo bienes | Atributo `kind` (después) |
| Contactos únicos | 🟡 Cliente y proveedor separados | Tabla de contactos con roles (cuando haya un caso real) |
| Tareas en segundo plano y eventos | ⚪ Todo es síncrono (suficiente hoy) | Outbox + trabajador (después) |
| Integración continua (CI) | 🔴 GitHub no corre pruebas | **Ahora** |

✅ listo · 🟡 base puesta, falta crecer · 🔴 corregir pronto · ⚪ no hace falta todavía

---

## 1. Arquitectura y multi-negocio

### 1.1 Identificador del negocio (`tenant_id`)

**Qué es:** cada fila sabe a qué negocio pertenece, para que un negocio nunca vea los
datos de otro. En nuestro sistema se llama `businessId`.

**Hoy:** lo llevan las tablas **raíz**: `Category`, `Product`, `Customer`, `Sale`,
`Supplier`, `PurchaseOrder` y `User`. Las tablas **hijas** (`SaleItem`,
`InventoryMovement`, `CreditPayment`, `PurchaseOrderItem`…) no lo repiten: heredan el
negocio de su padre.

Para que eso sea seguro, las relaciones entre tablas raíz son **claves foráneas
compuestas**. Por ejemplo, `Product(categoryId, businessId)` apunta a
`Category(id, businessId)`: la **base de datos** rechaza un producto de A con una
categoría de B, aunque el código tuviera un error.

**Recomendación:** está bien así para las historias. La práctica de «`tenant_id` en
absolutamente todas las tablas» tiene sentido cuando se active RLS (punto 1.2), porque
las reglas de RLS son mucho más simples y rápidas si cada tabla tiene su columna. En
ese momento se agrega `businessId` a las tablas hijas y se protege igual, con FK
compuesta hacia el padre, para que nunca pueda quedar distinto del padre.

### 1.2 Filtro automático por negocio

**Qué es:** que el `WHERE businessId = X` no dependa de que cada programador se acuerde
de escribirlo.

**Hoy:** cada repositorio se **construye** con el negocio de la sesión
(`new ProductsRepository(businessId)`) y filtra todas sus consultas por él. El
`businessId` sale siempre de la sesión, nunca del navegador. Además hay pruebas con
PostgreSQL real (`tenant-isolation.integration.test.ts`) que fallan si alguien olvida
el filtro. Es estructural, pero todavía es «código que hay que escribir bien».

**Recomendación (después de las historias):** activar **Row Level Security (RLS)** de
PostgreSQL:

```sql
ALTER TABLE "Product" ENABLE ROW LEVEL SECURITY;
CREATE POLICY por_negocio ON "Product"
  USING ("businessId" = current_setting('app.business_id')::uuid);
```

Y en cada transacción el backend ejecuta `SET LOCAL app.business_id = '…'`. Así la
**base** filtra todo, incluido el SQL directo (`$queryRaw`) que usan ventas y reportes.

¿Por qué RLS y no un filtro automático en Prisma (`$extends`)? Porque la extensión de
Prisma no cubre el SQL directo ni todas las escrituras anidadas, y daría una falsa
sensación de seguridad. RLS es la capa más baja posible: no se puede saltar.

### 1.3 Jerarquía de tres niveles

**Qué es:** Cuenta (suscripción) → Organizaciones (sucursales, bodegas) → Usuarios.

**Hoy:**

```
Plataforma (Administrador: nosotros)
  └─ Negocio = la cuenta con su plan (Business)
       └─ Usuarios con rol (Encargado, Cajero, Bodega)
```

Falta el nivel **Sucursal / Bodega**: hoy cada producto tiene **un** `stock`.

**Recomendación (después):**

1. Tabla `Branch` (sucursal o bodega) con `businessId`.
2. El stock sale de `Product` a `ProductStock(productId, branchId, quantity)`.
3. Ventas, pedidos y movimientos llevan `branchId`, y los usuarios pueden quedar
   asignados a una o varias sucursales.

**Lo que ya ayuda:** todos los cambios de stock pasan por los repositorios (ventas,
recepción de pedidos, conteo físico), nunca desde la pantalla. Cuando llegue la
sucursal, el cambio queda concentrado en esos puntos. **Regla para hoy:** no escribir
`UPDATE "Product" SET stock …` fuera de esos repositorios.

---

## 2. Datos con diseño genérico

### 2.1 Artículos: bienes y servicios

**Hoy:** `Product` modela bienes con inventario: stock, mínimo, vencimiento, código de
barras.

**Recomendación (después):** agregar `kind: GOOD | SERVICE` y una regla `CHECK`: un
servicio no tiene stock ni vencimiento. Precio, código, categoría e impuestos se
comparten. **No conviene renombrar `Product` a `Item` ahora**: no lo pide ninguna
historia y obligaría a tocar todos los módulos.

### 2.2 Contactos únicos (clientes, proveedores, empleados)

**Hoy:** `Customer` y `Supplier` son tablas separadas, y `User` es aparte.

**Recomendación:** el modelo de «contacto con roles» (una tabla `Contact` y roles
`CUSTOMER`, `SUPPLIER`, `EMPLOYEE`) es bueno para un ERP, pero agrega complejidad en
cada consulta. Adoptarlo **cuando haya un caso real** (por ejemplo, un proveedor que
también compra a crédito, o contratos SICOP con la misma institución como cliente y
proveedor). `User` debe seguir separado: es la **cuenta de acceso** (contraseña,
sesiones), no la persona. Si hace falta, `User` apunta a su `Contact`.

### 2.3 Cabecera-detalle

**Hoy:** ✅ ya es el patrón del sistema:

| Documento (cabecera: quién, cuándo, estado) | Líneas (qué, cuánto, valor) |
| --- | --- |
| `Sale` | `SaleItem` |
| `PurchaseOrder` | `PurchaseOrderItem` |
| `SaleAdjustment` | `SaleAdjustmentItem` |

Además, `InventoryMovement` es el **libro** (kardex): cada entrada y salida queda
registrada y no se edita.

**A futuro:** contratos, órdenes SICOP o traslados entre bodegas siguen el mismo patrón
(cabecera + líneas + movimientos de inventario cuando corresponda).

### 2.4 Consecutivos por negocio — 🔴 corregir ahora

**Problema:** `Sale.number` y `PurchaseOrder.number` usan **un solo contador para todo
el sistema** (`autoincrement`). Con varios negocios:

- un negocio con 3 ventas puede imprimir «Venta #57» en su comprobante;
- con los saltos de numeración, un negocio puede **calcular cuánto venden los demás**
  (fuga de información entre clientes).

**Solución (próxima rama, pequeña):** una tabla de contadores por negocio y tipo de
documento:

```prisma
model DocumentSequence {
  businessId String @db.Uuid
  kind       String // 'SALE', 'PURCHASE_ORDER'…
  next       Int    @default(1)
  @@id([businessId, kind])
}
```

Se toma el número con `UPDATE … SET next = next + 1 RETURNING next` dentro de la misma
transacción de la venta: es atómico y no se repite. `number` pasa a ser único **por
negocio** (`@@unique([businessId, number])`). La migración numera las ventas existentes
por negocio y en orden de fecha. Esto también deja lista la base para la **factura
electrónica de Hacienda**, que exige un consecutivo por emisor.

---

## 3. Planes y suscripciones (SaaS)

### 3.1 Límites del plan en el servidor

**Hoy:** ✅ el límite de usuarios se valida **en el servidor**, dentro de una
transacción que bloquea la fila del negocio (`SELECT … FOR UPDATE`). Dos altas
simultáneas no pueden pasarse del cupo; hay una prueba que lo demuestra. La pantalla
solo informa.

**Recomendación (después):** generalizar a **funciones del plan**. Hoy el **rol** decide
qué puede hacer una persona (`requirePermission('purchasing')`). Mañana, además, el
**plan** decide qué módulos tiene el negocio:

```ts
apiRouter.use('/contracts', ...businessRequired, requireFeature('contracts'), requirePermission('contracts'), router);
```

con una tabla `PlanFeature(planId, feature, limit)` (por ejemplo, `products: 500`,
`contracts: enabled`). Es el mismo patrón que ya usamos con los permisos.

### 3.2 Pasarela de pagos desacoplada

**Hoy:** ✅ el acceso depende de un **estado interno** (`Business.status`:
`ACTIVE`/`SUSPENDED`), no de un servicio externo. Si mañana cambia la pasarela, el
resto del sistema no se entera.

**Recomendación (después):**

1. Agregar el estado `PAST_DUE` (pago atrasado, con días de gracia) antes de
   `SUSPENDED`.
2. Un endpoint de **webhook** de la pasarela que **verifique la firma** del aviso y
   guarde el id del evento (`ProcessedWebhookEvent`): si el aviso llega dos veces, se
   procesa una sola vez (idempotencia, punto 4.3).
3. El webhook solo cambia el estado interno; nada más del sistema llama a la
   pasarela.

---

## 4. Concurrencia y flujo de datos

### 4.1 Tareas en segundo plano

**Hoy:** todo es síncrono y está bien así. El comprobante y los PDF se generan **en el
navegador**, la exportación a Excel del catálogo es pequeña y no enviamos correos. No
hay tareas pesadas que bloqueen al cajero.

**Recomendación (cuando haya correos, reportes grandes o integraciones):** patrón
**outbox**. En la misma transacción de la venta se guarda una fila «pendiente:
enviar comprobante por correo». Un **trabajador** aparte (por ejemplo `pg-boss`, que
usa la misma base PostgreSQL y no agrega servidores) la procesa y reintenta si falla.
La venta nunca espera al correo.

### 4.2 Eventos entre módulos — con una advertencia importante

**La advertencia:** el descuento de **stock no debe** volverse un evento asíncrono.
Hoy la venta y el descuento ocurren en **la misma transacción**, con
`UPDATE … WHERE stock >= cantidad`. Por eso dos cajeros no pueden vender el último
producto a la vez (hay una prueba e2e de eso). Si el inventario «reaccionara después»
a un evento `VentaRealizada`, ese intervalo permitiría **vender lo que no hay**.

**Recomendación:** eventos (con el outbox del punto 4.1) para los **efectos
secundarios**: correo, analítica, avisos de stock bajo, sincronizar con Hacienda o
SICOP. Lo que debe cuadrar (stock, saldo del fiado, totales) va en la transacción.

### 4.3 Idempotencia

**Qué es:** si una petición llega dos veces (doble clic, se cayó la conexión y se
reintentó), se procesa una sola vez.

**Hoy:** ✅ las ventas llevan `idempotencyKey`. Si la misma confirmación llega dos
veces, se devuelve la venta original sin descontar stock de nuevo (hay pruebas).

**Ajustes:**

- **Ahora (junto con 2.4):** la llave es única en **todo** el sistema; debe ser única
  **por negocio** (`@@unique([businessId, idempotencyKey])`). Así ningún negocio choca
  con la llave de otro.
- **Después:** extender la llave a todo lo que mueve dinero o stock: abonos a fiados,
  recepción de pedidos y ajustes. Lo más limpio es un middleware genérico con el
  encabezado `Idempotency-Key` y una tabla de respuestas ya dadas, en lugar de una
  columna por tabla.

---

## 5. Otras buenas prácticas que recomiendo

| Práctica | Por qué | Cuándo |
| --- | --- | --- |
| **CI en GitHub** (Actions: lint, typecheck, pruebas unitarias y de integración con PostgreSQL) | Hoy las pruebas solo corren en las máquinas del equipo; un PR puede entrar roto sin que nadie lo note. | **Ahora** (no toca el código de la app) |
| **Autor de cada operación** (`createdById` en ventas, movimientos y pedidos) | Auditoría: saber qué cajero hizo qué. Ya está anotado como pendiente en el ADR 0002. | Cuando una historia lo pida, o antes de entregar |
| **Hora de Costa Rica** explícita (`America/Costa_Rica`) en «ventas del día» y reportes | Un servidor en UTC corta el día a las 6 p. m. hora local. | Revisar al cerrar reportes |
| **Logs con `requestId` y `businessId`** | Encontrar en segundos qué le pasó a qué cliente. | Antes de producción |
| **Respaldos automáticos y prueba de restauración** | Un SaaS responde por los datos de sus clientes. | Antes de producción |
| **Monolito modular**, no microservicios | Cada módulo (ventas, inventario, compras) en su carpeta, con su repositorio y sus permisos. Ya lo hacemos; separar en servicios solo complica a un equipo de nuestro tamaño. | Siempre |
| **Una migración por cambio**, revisada en el PR | Las bases de los clientes no se arreglan a mano. | Siempre (ya lo hacemos) |

---

## 6. Hoja de ruta

**Ahora (sin salirse de las historias):**

1. Consecutivos por negocio y llave de idempotencia por negocio (2.4 y 4.3).
2. CI en GitHub.

**Al terminar las historias (antes de entregar al cliente):**

3. Autor de cada operación (auditoría).
4. RLS en PostgreSQL y `businessId` en las tablas hijas (1.1 y 1.2).
5. Logs con `requestId` y respaldos.

**Crecimiento a ERP (después de la entrega):**

6. Sucursales y bodegas con stock por sucursal (1.3).
7. Funciones por plan (3.1) y cobro con webhooks (3.2).
8. Bienes y servicios (2.1); contactos con roles cuando haya un caso real (2.2).
9. Outbox y trabajador para correos e integraciones (4.1 y 4.2).
10. Módulos nuevos sobre el mismo patrón cabecera-detalle: compras formales,
    contratos, SICOP y factura electrónica.

Cada paso entra como siempre: rama → pruebas → PR a `develop`, con su migración y, si
cambia una decisión, un ADR nuevo.
