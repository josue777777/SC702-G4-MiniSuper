# Pedidos y proveedores

Historias: HU-21, HU-22, HU-24 y la recepción de HU-38 (pendientes: HU-23, HU-39 y,
de HU-38, los lotes con vencimiento y la entrada desde el Kardex). Volver al
[índice de la guía](README.md).

## 1. Qué hace

- **Proveedores**: a quién se le compra y qué productos le suministra cada uno, con el
  costo acordado (HU-21).
- **Pedidos**: armar un pedido a un proveedor con sus productos y cantidades, ver el
  historial filtrado por proveedor (HU-22) y abrir el documento para imprimirlo o
  guardarlo como PDF (HU-24).
- **Entregas** (HU-38): un pedido se recibe en una o varias entregas, cada una con su
  **factura**, el **día real** en que llegó y la cantidad real de cada producto. El
  pedido queda «Parcial» y sigue abierto hasta que llega todo o se **da por
  concluido**. Al registrar una entrega se elige: **cargarla ya al inventario** o
  **dejar la carga pendiente** y confirmarla después (botón «Cargar al inventario»
  en esa factura; el historial avisa «Carga pendiente»).
- **Proveedores › Editar**: los productos que suministra se agregan buscándolos
  («Agregar producto que suministra», sin lista desplegable del catálogo), se ven de 4 en 4
  con buscador y se quitan con «Quitar» (los de proveedor principal se cambian en
  Inventario). «N productos» de la tabla abre solo esa lista, también de 4 en 4.
- **«N productos» en el historial**: abre solo la lista de productos del pedido (lo pedido y
  lo recibido), de 4 en 4 (`OrderProductsModal.tsx`). El pedido completo es «Ver pedido».
- **Nuevo pedido**: al elegir el proveedor, sus productos se ven de 4 en 4 con un buscador
  (`MODAL_PAGE_SIZE`, la regla de las listas en una ventana); las cantidades escritas se
  conservan al cambiar de página o de búsqueda y el total suma todo el pedido.
- **Documento del pedido** (Imprimir / Guardar PDF): encabezado y pie con los datos del
  negocio y su logo (`features/business/BusinessDocument.tsx`), y la constancia con
  «Generado por» (el usuario), «Fecha de recepción» y «Firma». En pantalla, «Ver pedido»
  muestra la información sin esa constancia.
- **Factura del proveedor** (HU-38): al registrar la entrega se puede adjuntar el PDF
  o la foto de la factura del proveedor; se ve al lado de las cantidades mientras se
  anotan. Si no se adjuntó, en «Ver pedido» › Entregas cada factura tiene «📎 Adjuntar
  factura» o «📄 Ver factura proveedor», junto a «Cargar al inventario».
- **Historial** con filtros que se aplican solos: buscador (PED-0007, factura,
  proveedor o producto), proveedor, estado (también «Con carga pendiente») y período.

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

### Registrar una entrega (HU-38)

```text
Entrada   ReceiveOrderModal.tsx: { invoiceNumber, receivedOn, loadNow, items: [{ productId, quantity }] }
   ▼  POST /api/purchase-orders/:id/receipts
services/purchase-orders.service.ts → receiveOrder()
   │   reglas: pedido abierto; fecha no futura ni anterior al pedido; solo productos
   │   del pedido; nunca más de lo que falta; las líneas en 0 no se guardan
   ▼
repositories/purchase-orders.repository.ts → receive()   (una sola transacción)
   │   1. suma lo recibido a cada línea SOLO si nadie la cambió (si no → 409)
   │   2. guarda PurchaseReceipt + PurchaseReceiptItem (factura única en el pedido)
   │   3. estado: RECEIVED si llegó todo (con la fecha real), si no PARTIAL
   │   4. si loadNow: loadReceiptStock() → stock + InventoryMovement ENTRY
   │      con motivo «Recepción PED-0007 · Factura F-120» y la entrega enlazada
   ▼
Responde  201 { data: PurchaseOrderDto }  (con receipts, receivedQuantity y pendingQuantity)
```

La carga pendiente se confirma con `POST /:id/receipts/:receiptId/load`.
`loadReceiptStock()` marca la entrega como cargada **solo si seguía pendiente**: si
dos personas confirman a la vez, el stock se suma una vez y la otra recibe 409.

### Otras rutas

| Ruta | Para qué |
| --- | --- |
| `GET /api/purchase-orders?supplierId=` | Historial, filtrable por proveedor (HU-22) |
| `GET /api/purchase-orders/:id` | Un pedido con sus líneas y sus entregas: el documento «Ver pedido» |
| `POST /api/purchase-orders/:id/receipts/:receiptId/load` | Cargar al inventario una entrega pendiente (HU-38) |
| `POST /api/purchase-orders/:id/close` | Dar por concluido un pedido que llegó en parte (HU-38) |
| `PUT /api/purchase-orders/:id/receipts/:receiptId/invoice` · `GET` | Adjuntar (o reemplazar) y ver la factura del proveedor: PDF, PNG, JPG o WEBP hasta 5 MB; el nombre viaja en `X-File-Name`. Se revisa la firma del archivo (`utils/invoice-file.ts`) |
| `GET /api/suppliers` · `POST` · `PATCH /:id` | Lista, alta y edición de proveedores con sus productos (HU-21) |

### En el navegador

```text
pages/OrdersPage.tsx                     las pestañas (la elegida va en ?seccion=)
  ├─ features/purchase-orders/OrdersSection.tsx
  │    ├─ use-purchase-orders.ts          carga pedidos y proveedores, crea, abre
  │    ├─ PurchaseOrderForm.tsx            el formulario (purchase-order-form.ts calcula)
  │    ├─ PurchaseOrderHistory.tsx         la lista paginada y el filtro por proveedor
  │    ├─ PurchaseOrderDetail.tsx          el documento en un Modal, con «Imprimir»,
  │    │                                   «Etiquetas» (una por unidad pedida, HU-07) y
  │    │                                   las entregas con «Cargar al inventario» (HU-38)
  │    ├─ ReceiveOrderModal.tsx            registrar una entrega (factura, fecha, cantidades,
  │    │                                   archivo de la factura con su vista previa)
  │    ├─ InvoicePreview.tsx / invoice-file.ts   visor (PDF o imagen) y reglas del archivo
  │    └─ order-filters.ts                 filtros del historial (estado, período, buscador)
  └─ features/suppliers/SuppliersSection.tsx
       ├─ use-suppliers.ts                  carga, crea y edita
       ├─ SupplierForm.tsx / SupplierTable.tsx
       └─ SupplierProductsModal.tsx         los productos de un proveedor, en una ventana
```

El PDF no lo genera el servidor: «Imprimir» usa el diálogo del navegador
(`window.print()`), que permite elegir «Guardar como PDF». La clase
`printing-report` hace que solo se imprima el documento.

## 3. Librerías

| Librería | Qué resuelve aquí |
| --- | --- |
| **Zod** | Que no llegue un pedido sin proveedor, sin líneas o con cantidades inválidas |
| **Prisma** (`$transaction` + SQL del consecutivo) | Que el número `PED-xxxx` no se repita aunque dos personas guarden a la vez, y que no se gaste si el pedido falla |

## 4. Cálculos y reglas

### Un producto, varios proveedores (`SupplierProduct`)

La relación es de **muchos a muchos**: un proveedor suministra muchos productos y un
producto puede comprarse a varios proveedores. Cada pareja es una fila de
`SupplierProduct` con su propio **costo acordado**:

```text
Coca Cola 250 ml   IMPERIAL     ₡1 000,00   principal
Coca Cola 250 ml   Distribuidora ₡  950,00
@@unique([supplierId, productId]) → la misma pareja no se repite
```

Uno solo es el **principal** (`isPreferred`): el que muestra Inventario y el que se
cambia al modificar el producto. Un pedido usa el costo acordado con el proveedor del
pedido, no el principal. Comparar costos entre proveedores es HU-39 (pendiente).

### Total del pedido (`calculateTotal` en el servidor, `calculateOrderTotal` en la pantalla)

```text
Línea       = cantidad × costo acordado      (en céntimos, sin decimales flotantes)
Café 500 g  = 12 × ₡1 800,00 = ₡21 600,00
Arroz 1 kg  = 20 × ₡600,00   = ₡12 000,00
Total       = ₡33 600,00
```

La pantalla calcula lo mismo para mostrar el total mientras se escribe, pero el que
se guarda es el del servidor.

### Lo que falta de cada línea (`pendingQuantity`)

`pendingQuantity = quantity − receivedQuantity` (nunca negativo). Ejemplo: se pidieron
10 arroces; llegan 6 con la factura F-100 → faltan 4; llegan 4 con la F-101 → falta 0
y el pedido queda «Recibido» con la fecha de la F-101. `receivedQuantity` cuenta al
**registrar** la entrega (llegó la mercadería); el **stock** sube al **cargarla**.

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
| «El pedido cambió mientras se registraba la entrega» | Dos personas registraron a la vez: `receive()` en el repositorio; abrir el pedido de nuevo |
| «La mercadería no puede llegar antes de hacer el pedido» con la fecha de hoy | Se compara con el día del pedido en Costa Rica (`todayInBusinessZone`), no en UTC |
| La factura no se ve en la ventana | Solo PDF o imagen; el visor de PDF es el del navegador (`InvoicePreview.tsx`) |
| El stock no subió después de registrar una entrega | La carga quedó pendiente: «Ver pedido» › Entregas › «Cargar al inventario» |

Pruebas: `backend/src/**/purchase-orders*.test.ts`,
`repositories/purchase-receipts.integration.test.ts` (stock, Kardex y doble carga en
PostgreSQL), `suppliers*.test.ts`, `e2e/tests/hu-38-recepcion-pedidos.spec.ts` y
`e2e/tests/pantallas-listas.spec.ts` (pestañas de Pedidos).
