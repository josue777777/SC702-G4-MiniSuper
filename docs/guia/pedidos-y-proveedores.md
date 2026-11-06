# Pedidos y proveedores

Historias: HU-21, HU-22 y HU-24 (pendientes: HU-23, HU-38 y HU-39). Volver al
[índice de la guía](README.md).

## 1. Qué hace

- **Proveedores**: a quién se le compra y qué productos le suministra cada uno, con el
  costo acordado (HU-21).
- **Pedidos**: armar un pedido a un proveedor con sus productos y cantidades, ver el
  historial filtrado por proveedor (HU-22) y abrir el documento para imprimirlo o
  guardarlo como PDF (HU-24).

En el menú es una sola entrada, **Pedidos**, con dos pestañas: «Pedidos» y
«Proveedores» (`/orders?seccion=proveedores`). Las dos usan el permiso `purchasing`
(Encargado y Bodega).

## 2. Flujo de información

### Crear un pedido (HU-24)

```text
Entrada   PurchaseOrderForm.tsx: proveedor + { productId, quantity } por línea
          (el costo NO lo manda la pantalla)
   │
   ▼  POST /api/purchase-orders
routes/purchase-orders.routes.ts → controllers/purchase-orders.controller.ts
   │   valida con validators/purchase-orders.validator.ts
   ▼
services/purchase-orders.service.ts → createOrder()
   │   1. busca el catálogo del proveedor (findSupplierCatalog); si no existe o está
   │      inactivo → 400
   │   2. a cada línea le pone el costo ACORDADO con ese proveedor; un producto que
   │      el proveedor no suministra → 400
   │   3. calcula el total (calculateTotal)
   ▼
repositories/purchase-orders.repository.ts → create()
   │   en una transacción: toma el consecutivo (nextDocumentNumber → PED-0007),
   │   guarda el pedido PENDING y sus líneas
   ▼
Responde  201 { data: PurchaseOrderDto }  →  la pantalla lo agrega al historial
```

**Por qué el costo lo pone el servidor.** Si lo mandara la pantalla, alguien podría
cambiarlo en la petición. El servidor usa el costo guardado en `SupplierProduct`.

### Otras rutas

| Ruta | Para qué |
| --- | --- |
| `GET /api/purchase-orders?supplierId=` | Historial, filtrable por proveedor (HU-22) |
| `GET /api/purchase-orders/:id` | Un pedido con sus líneas: el documento «Ver pedido» |
| `GET /api/suppliers` · `POST` · `PATCH /:id` | Lista, alta y edición de proveedores con sus productos (HU-21) |

### En el navegador

```text
pages/OrdersPage.tsx                     las pestañas (la elegida va en ?seccion=)
  ├─ features/purchase-orders/OrdersSection.tsx
  │    ├─ use-purchase-orders.ts          carga pedidos y proveedores, crea, abre
  │    ├─ PurchaseOrderForm.tsx            el formulario (purchase-order-form.ts calcula)
  │    ├─ PurchaseOrderHistory.tsx         la lista paginada y el filtro por proveedor
  │    └─ PurchaseOrderDetail.tsx          el documento en un Modal, con «Imprimir» y
  │                                        «Etiquetas» (una por unidad pedida, HU-07)
  └─ features/suppliers/SuppliersSection.tsx
       ├─ use-suppliers.ts                  carga, crea y edita
       └─ SupplierForm.tsx / SupplierTable.tsx
```

El PDF no lo genera el servidor: «Imprimir» usa el diálogo del navegador
(`window.print()`), que permite elegir «Guardar como PDF». La clase
`printing-report` hace que solo se imprima el documento.

## 3. Librerías

| Librería | Qué resuelve aquí |
| --- | --- |
| **Zod** | Que no llegue un pedido sin proveedor, sin líneas o con cantidades inválidas |
| **Prisma** (`$transaction` + SQL del consecutivo) | Que el número `PED-xxxx` no se repita aunque dos personas guarden a la vez, y que no se gaste si el pedido falla |

## 4. Cálculos

### Total del pedido (`calculateTotal` en el servidor, `calculateOrderTotal` en la pantalla)

```text
Línea       = cantidad × costo acordado      (en céntimos, sin decimales flotantes)
Café 500 g  = 12 × ₡1 800,00 = ₡21 600,00
Arroz 1 kg  = 20 × ₡600,00   = ₡12 000,00
Total       = ₡33 600,00
```

La pantalla calcula lo mismo para mostrar el total mientras se escribe, pero el que
se guarda es el del servidor.

### Consecutivo del pedido (`nextDocumentNumber`)

Cada negocio tiene su propio contador por tipo de documento (ventas y pedidos van
por separado). Se toma dentro de la misma transacción: atómico y sin huecos.

## 5. Dónde buscar cuando algo falla

| Síntoma | Dónde mirar |
| --- | --- |
| «Hay productos que este proveedor no suministra» | El producto no está asociado al proveedor: pestaña Proveedores › Editar |
| El costo del pedido no es el esperado | `SupplierProduct.unitCost` del proveedor (no el costo del producto) |
| «No se puede quitar … es su proveedor principal» | `suppliers.service.ts`: primero cambie el proveedor principal en Inventario |
| El PDF imprime toda la pantalla | `PurchaseOrderDetail.tsx` (`printing-report`) y los estilos `@media print` |
| Un número de pedido se repite | `repositories/document-sequence.ts` |

Pruebas: `backend/src/**/purchase-orders*.test.ts`, `suppliers*.test.ts` y
`e2e/tests/pantallas-listas.spec.ts` (pestañas de Pedidos).
