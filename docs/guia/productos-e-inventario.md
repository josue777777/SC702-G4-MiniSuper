# Productos e inventario

Historias: HU-01 a HU-10, HU-25 a HU-27, HU-31 y HU-33. Volver al
[índice de la guía](README.md).

## 1. Qué hace

Es el catálogo del negocio y el control de sus existencias:

- **Productos** (Almacén › Inventario): registrar, editar, desactivar, volver a activar
  y borrar productos; categorías; código de barras e imagen; exportar el catálogo a
  Excel.
- **Etiquetas** (botón «Etiquetas» de Inventario, «Ver código» y «Ver pedido»): imprimir
  etiquetas para rotular productos, de uno o de varios a la vez, con el diseño del negocio
  (tamaño de rollo térmico u hoja carta; logo, nombre del negocio, nombre y código del
  producto, precio, código de barras y QR). El diseño lo define el Encargado y vale para
  todos (HU-07).
- **Existencias**: mínimo de stock (alerta de stock bajo), fecha de vencimiento
  (alerta de vencidos y por vencer) y conteo físico, que corrige el stock con lo que
  hay de verdad en el estante.
- **Movimientos** (Almacén › Movimientos): el historial de cada producto, con cada
  entrada, salida o ajuste y el saldo después de cada uno (kardex).
- **Reporte de inventario** (Reportes › Inventario): totales, gráficos y el detalle por
  páginas, con PDF y Excel.

**Regla de oro del módulo:** el stock nunca cambia «porque sí». Cada cambio deja un
`InventoryMovement` (cuánto había, cuánto se movió, cuánto quedó) en la misma
transacción. Por eso Movimientos siempre cuadra con el stock.

## 2. Flujo de información

Todas las rutas exigen sesión y negocio. `GET` necesita `inventory.read` (también el
Cajero); crear o cambiar necesita `inventory.write` (Encargado y Bodega). Movimientos
necesita `kardex`.

### Registrar un producto (HU-01)

```text
Entrada   formulario de ProductForm.tsx (pestañas General, Precios, Existencias)
          { code, name, categoryId, supplierId?, price, cost, stock, minStock?, … }
   │
   ▼  POST /api/products
routes/products.routes.ts → controllers/products.controller.ts
   │   valida con createProductSchema (validators/products.validator.ts):
   │   código ≤ 50, nombre ≤ 120, importes con 2 decimales, stock 0 … 1 000 000
   ▼
services/products.service.ts → createProduct()
   │   ¿el código o el código de barras ya existe en el negocio? → 409
   │   si stock > 0, planea el movimiento «Stock inicial»
   ▼
repositories/products.repository.ts → create()
   │   en una transacción: Product + SupplierProduct (proveedor) + InventoryMovement
   ▼
Responde  201 { data: ProductDto }  (el dinero viaja como texto: "1500.00")
```

### Editar el stock (HU-02) y conteo físico (HU-10)

```text
PATCH /api/products/:id        { …, stock: 18 }      → buildStockAdjustment()
POST  /api/inventory/counts    { productId, countedQuantity: 18 } → buildCountAdjustment()
   ▼
El servicio calcula el ajuste (ver «Cálculos») y el repositorio guarda en una sola
transacción el stock nuevo y su InventoryMovement de tipo ADJUSTMENT.
```

### Otras rutas

| Ruta | Para qué |
| --- | --- |
| `GET /api/products?search=&categoryId=&activeOnly=` | Lista y búsqueda (HU-05) |
| `PATCH /api/products/:id/deactivate` · `/activate` · `DELETE /api/products/:id` | Baja lógica, reactivar, borrar solo si no tiene historial (HU-03) |
| `POST /api/products/:id/barcode` | Generar un EAN-13 interno (HU-07) |
| `GET /api/business/label-design` · `PUT` | Diseño de la etiqueta del negocio: lo lee cualquiera del negocio, lo guarda el Encargado (HU-07) |
| `PUT /api/products/:id/image` · `GET` · `DELETE` | Imagen del producto, hasta 2 MB, PNG/JPG/WEBP (HU-01) |
| `GET /api/products/export?categoryId=` | Catálogo en Excel (HU-33) |
| `GET /api/categories` · `POST` | Categorías (HU-04) |
| `GET /api/inventory/low-stock` · `/expirations` · `/products` | Alertas y configuración de existencias (HU-08, HU-09) |
| `PATCH /api/inventory/products/:id/min-stock` · `/expiration-date` | Mínimo y vencimiento |
| `GET /api/kardex/products/:id/movements?page=` | Movimientos de un producto, paginados en el servidor (HU-31) |
| `GET /api/reports/inventory` · `/rows?section=` · `/export` | Reporte de inventario: resumen, páginas y Excel (HU-25 a HU-27) |

### En el navegador

```text
pages/InventoryPage.tsx
  └─ features/products/ProductsSection.tsx   tabla, barra de acciones y modales
       ├─ use-products.ts                     carga, crea, edita, desactiva
       ├─ ProductForm.tsx / product-form.ts   el formulario y su validación
       ├─ BarcodeLabel.tsx / barcode.ts       «Ver código»: código de barras y QR
       └─ use-catalog-export.ts               descarga del Excel
  └─ features/inventory/…                     conteo físico y alertas
pages/KardexPage.tsx → features/kardex/        ficha del producto y sus movimientos
```

### Imprimir etiquetas (HU-07)

```text
Entrada   LabelPrintModal.tsx: productos y cuántas etiquetas de cada uno
          (abre con el producto elegido, o con las cantidades de un pedido)
   │
   ▼  use-label-data.ts carga, todo a la vez:
   │    GET /api/products (solo activos) · GET /api/business (nombre y logo)
   │    GET /api/business/label-design (si nunca se guardó: rollo 58 × 40 con todo)
   ▼
label-sizes.ts       cuántas etiquetas caben y dónde va cada una (en milímetros)
LabelSheet.tsx       dibuja las páginas escondidas con ProductLabel.tsx
label-print.ts       las copia a un <iframe> escondido con @page del tamaño del papel
   ▼
Diálogo de impresión del navegador → impresora térmica u hoja carta
```

**Por qué un `<iframe>` y no otra ventana.** Una ventana nueva la bloquea el navegador
(«ventana emergente»), y la página de la aplicación imprimiría también el menú. El
`<iframe>` lleva solo las etiquetas y su propio `@page` (`size: 58mm 40mm`), así cada
etiqueta cae justo en su sticker. El logo viaja dentro como `data:` URL, porque ese
documento no tiene la sesión.

**La ventana trabaja con lo que se eligió antes** (`LabelScope` en `LabelPrintModal.tsx`):

| Se abre desde | Modo | Qué muestra |
| --- | --- | --- |
| Botón «Etiquetas» de Inventario | `catalog` | Buscador y todo el catálogo, sin nada elegido: para varios productos |
| «Ver código» de un producto | `product` | Solo ese producto: vista previa grande y cuántas copias |
| «Ver pedido» | `order` | Solo los productos del pedido, con lo pedido |

Si ya se eligió un producto o un pedido, no tiene sentido volver a buscarlo: la
ventana no ofrece el catálogo.

**Personalizar** (`LabelCustomizeModal.tsx`, solo el Encargado): elige el tamaño y qué
datos lleva. Se guarda en `Business.labelDesign` para todo el negocio. El servidor no deja
guardar una etiqueta que no identifique el producto (sin nombre, código, barras ni QR).

## 3. Librerías

| Librería | Qué resuelve aquí |
| --- | --- |
| **Zod** | Que un precio `"12.345"` o un stock `-3` se rechacen con un mensaje claro antes de tocar la base |
| **Prisma** | Las transacciones que guardan el producto y su movimiento juntos (o ninguno de los dos) |
| **exceljs** | El archivo `.xlsx` del catálogo y del reporte de inventario, con números de verdad (no texto) |
| **qrcode.react** | El código QR de «Ver código» y de las etiquetas; el código de barras se dibuja a mano en SVG (`barcode.ts`) |

## 4. Cálculos

### Dígito de control del EAN-13 (`generateInternalEan13`, `isValidEan13`)

Los 12 primeros dígitos se multiplican alternando por 1 y por 3; el dígito 13 es lo
que falta para llegar a la siguiente decena.

```text
Dígitos:   7  5  0  1  2  3  4  5  6  7  8  9
Peso:      1  3  1  3  1  3  1  3  1  3  1  3
Producto:  7 15  0  3  2  9  4 15  6 21  8 27   → suma = 117
Control:   (10 − 117 mod 10) mod 10 = (10 − 7) mod 10 = 3
Código:    7501234567893
```

Así el lector detecta un código mal leído: si un dígito cambia, el control no coincide.

### Etiquetas por hoja (`label-sizes.ts`)

```text
Rollo térmico     1 etiqueta por página, del tamaño del sticker (58 × 40 mm)
Hoja carta de 30  3 columnas × 10 filas de 66,7 × 25,4 mm
Hoja carta de 10  2 columnas × 5 filas de 101,6 × 50,8 mm

Posición de una etiqueta en la hoja (slotPosition), en mm:
  izquierda = margen izquierdo + columna × (ancho + separación)
  arriba    = margen superior  + fila    × alto
  Hoja de 30, etiqueta 5 (columna 2, fila 2):
    izquierda = 4,8 + 1 × (66,7 + 3,15) = 74,65 mm
    arriba    = 12,7 + 1 × 25,4          = 38,1 mm

Hoja ya usada: «Empezar en la etiqueta» 5 → las 4 primeras quedan vacías.
  32 etiquetas desde la 5 → hoja 1: 26 · hoja 2: 6
```

El QR guarda el código de barras si el producto lo tiene (el lector de la caja lo lee
igual) y si no, su código interno (`qrValueOf`). El tamaño de letra se ajusta a la
altura: en una etiqueta de 25,4 mm todo mide 25,4 ÷ 40 = 0,635 de lo que mide en una de
40 mm.

### Ajuste de stock (`buildStockAdjustment`, `buildCountAdjustment`)

```text
Había 20, el conteo dice 18:
  { type: ADJUSTMENT, quantity: |18 − 20| = 2, stockBefore: 20, stockAfter: 18 }
```

La cantidad siempre es positiva; el sentido sale de `stockAfter − stockBefore`. La
edición de producto no guarda movimiento si el stock no cambió; el conteo físico **sí**
lo guarda (con cantidad 0), para que quede constancia de que se contó.

### Stock bajo (`isLowStock`)

`minStock > 0 y stock ≤ minStock`. Mínimo 5: con 5 o menos hay alerta. Un mínimo de 0
significa «no definido» y nunca alerta.

### Vencimientos (`classifyExpiration`, días = vencimiento − hoy en Costa Rica)

| Días que faltan | Estado |
| --- | --- |
| menos de 0 | Vencido |
| de 0 a 14 (vencer hoy cuenta) | Próximo a vencer |
| 15 o más | Sin alerta |

### Entradas y salidas del kardex (`movementAmounts`)

`ENTRY` suma, `EXIT` resta y un `ADJUSTMENT` cuenta como entrada o salida según si el
stock subió o bajó. Un ajuste de 20 → 18 aparece como **salida de 2**.

### Reporte de inventario (`inventory-report.service.ts`)

```text
Valor de un producto = stock × costo   (en céntimos, sin decimales flotantes)
  12 unidades × ₡450,00 = ₡5 400,00
Valor del inventario = suma de todos los productos activos del alcance
Estado del stock: agotado (stock 0), en su mínimo o debajo, o suficiente
```

## 5. Dónde buscar cuando algo falla

| Síntoma | Dónde mirar |
| --- | --- |
| El formulario no deja guardar un precio o un código | `validators/products.validator.ts` y `frontend/.../product-form.ts` |
| «Ya existe un producto con ese código» | `products.service.ts` (`assertCodeIsAvailable`) |
| El stock no cuadra con Movimientos | Busque quién cambió `stock` sin movimiento: solo los repositorios lo cambian |
| Un producto desactivado aparece en la caja | `sales.repository.ts` (filtra `isActive`) |
| La alerta de stock bajo no aparece | `isLowStock`: ¿el producto tiene mínimo definido? |
| El código de barras no se lee | `barcode.ts` (`isValidEan13`) y el dígito de control |
| La etiqueta sale corrida en la hoja de stickers | Las medidas de la hoja en `label-sizes.ts` y, al imprimir, escala «100 %» o «Tamaño real» (no «Ajustar a la página») |
| La etiqueta sale en una hoja grande en la impresora térmica | En el diálogo de impresión elegir la impresora de etiquetas; el tamaño lo pone `@page` (`label-print.ts`) |
| El Excel sale distinto a la pantalla | `inventory-report.service.ts` (mismo orden y filtros) y `utils/inventory-report-xlsx.ts` |
| Un negocio ve productos de otro | El repositorio: todas las consultas filtran por `businessId` |

Pruebas que cubren este módulo: `backend/src/**/products*.test.ts`,
`inventory*.test.ts`, `kardex*.test.ts`, `business.routes.test.ts` (diseño de etiqueta) y
`e2e/tests/hu-01-21-…`, `hu-07-etiquetas`, `hu-31-…`,
`hu-33-…`, `hu-40-…`.
