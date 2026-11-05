# Ventas y clientes

Historias: HU-16 a HU-18, HU-20, HU-34, HU-35, HU-36 y HU-37 (abonos a fiados: HU-19,
en curso). Volver al [índice de la guía](README.md).

## 1. Qué hace

- **Caja** (Ventas › Caja): escanear o buscar productos, armar el carrito, cobrar en
  efectivo, tarjeta o fiado y entregar el comprobante (HU-16 a HU-18, HU-34).
- **Historial del día** (Ventas › Historial del día): las ventas de un día, filtradas
  por método de pago, con su detalle (HU-20).
- **Devolver o anular** una venta: devuelve las unidades al stock y deja constancia
  (HU-35).
- **Clientes**: el cliente al que se le fía y su saldo (HU-18, HU-36).
- **Inicio**: el resumen de ventas de hoy y los indicadores del inventario (HU-37).

**Regla de oro del módulo:** el navegador solo **propone** la venta. Precio, total,
stock y vuelto los decide el servidor con los datos de la base.

## 2. Flujo de información

Ventas exige el permiso `sales` y Clientes, `customers` (Encargado y Cajero).

### Confirmar una venta (HU-16 a HU-18)

```text
Entrada   use-pos.ts: { items: [{ productId, quantity }], paymentMethod,
                        cashReceived?, customerId?, idempotencyKey }
   │
   ▼  POST /api/sales
routes/sales.routes.ts → controllers/sales.controller.ts (valida con Zod)
   ▼
services/sales.service.ts → createSale()
   │   1. junta el mismo producto repetido en una sola línea
   │   2. ¿existe, está activo y alcanza el stock? si no → 404 / 409
   │   3. calcula el total con el precio ACTUAL del catálogo (en céntimos)
   │   4. validatePayment: efectivo ≥ total · tarjeta sin monto · fiado con cliente activo
   ▼
repositories/sales.repository.ts → createSale(), en UNA transacción:
   │   número consecutivo del negocio (nextDocumentNumber: Venta #12) → Sale
   │   por cada línea: UPDATE stock = stock − cantidad WHERE stock ≥ cantidad
   │                   → SaleItem (precio y costo de ese momento) → movimiento EXIT
   │   si el precio cambió mientras tanto → se revierte todo (409 «El precio cambió»)
   ▼
Responde  201 { data: venta + vuelto + saldo del cliente }  → ReceiptModal (comprobante)
```

**Por qué la llave de idempotencia.** Si la red falla después de cobrar y la caja
reintenta, la misma `idempotencyKey` (un UUID creado en `use-pos.ts`) hace que el
servidor devuelva la venta ya guardada en lugar de cobrar y descontar dos veces.

**Por qué `WHERE stock >= cantidad`.** Si dos cajas venden la última unidad a la vez,
la base deja pasar solo una; la otra recibe «Stock insuficiente: otra venta se llevó
las unidades».

### Otras rutas

| Ruta | Para qué |
| --- | --- |
| `GET /api/sales/lookup?code=` | Producto por código o código de barras (lector) |
| `GET /api/sales/products?search=` | Búsqueda manual si el lector no reconoce el código |
| `GET /api/sales/daily-history?date=&paymentMethod=&page=` | Historial del día, paginado (HU-20) |
| `GET /api/sales/daily-summary` | Totales de hoy por método de pago (Inicio, HU-37) |
| `GET /api/sales/:id` | Una venta con sus líneas (detalle y reimpresión del comprobante) |
| `POST /api/sales/:id/adjustments` | Devolver productos o anular la venta (HU-35) |
| `GET /api/customers` · `POST` | Clientes activos con su saldo · crear cliente (nombre y teléfono) |

### Devolver o anular (HU-35)

```text
POST /api/sales/:id/adjustments  { type: RETURN | VOID, reason, items? }
  en una transacción: SaleAdjustment (quién, cuándo, por qué)
                    + el stock vuelve (movimiento ENTRY «Devolución venta #12: …»)
                    + baja el total de la venta
  estado: PARTIALLY_RETURNED → RETURNED cuando ya no queda nada; VOID no admite más
```

### En el navegador

```text
pages/SalesPage.tsx                 pestañas «Caja» e «Historial del día»
  ├─ use-pos.ts                     el estado de la caja: carrito, pago, confirmar
  ├─ ScannerBar.tsx / barcode-scanner.ts   el lector de código de barras
  ├─ CartTable.tsx / cart.ts        el carrito y sus cálculos
  ├─ CheckoutPanel.tsx / cash-suggestions.ts   cobro y montos rápidos
  ├─ CustomerPicker.tsx             elegir o crear el cliente del fiado
  ├─ ReceiptModal.tsx / SaleReceipt.tsx       comprobante para imprimir
  └─ SalesHistory.tsx / SaleDetailModal.tsx / SaleAdjustmentModal.tsx
pages/CustomersPage.tsx → features/customers/CustomersSection.tsx
pages/DashboardPage.tsx → features/dashboard/ (use-dashboard.ts, dashboard-metrics.ts)
```

## 3. Librerías

| Librería | Qué resuelve aquí |
| --- | --- |
| **Prisma** (`$transaction` + SQL) | Que la venta, el descuento de stock y los movimientos se guarden juntos o ninguno, y que el stock no quede negativo |
| **Zod** | Que no llegue una venta sin productos, con cantidades inválidas o montos con más de 2 decimales |
| **`crypto.randomUUID`** (navegador) | La llave de idempotencia de cada venta |
| **`window.print()`** (navegador) | Imprimir el comprobante o guardarlo como PDF, sin librería extra |

El lector de código de barras no necesita librería: se comporta como un teclado muy
rápido que termina con Enter (`barcode-scanner.ts`).

## 4. Cálculos

### Total de la venta (`createSale` en el servidor, `cartTotal` en la pantalla)

```text
Línea   = cantidad × precio actual         (en céntimos: ₡1 250,50 = 125 050)
Leche   = 2 × ₡1 250,50 = ₡2 501,00
Pan     = 3 × ₡  800,00 = ₡2 400,00
Total   = ₡4 901,00
```

La pantalla calcula lo mismo para mostrarlo mientras se arma el carrito
(`frontend/src/features/sales/cents.ts`); el que se guarda es el del servidor.

### Vuelto (`withDerived`)

```text
Vuelto = efectivo recibido − total = ₡5 000,00 − ₡4 901,00 = ₡99,00
```

No se guarda: se calcula cada vez a partir de lo recibido y el total original.

### Montos rápidos del efectivo (`cashSuggestions`)

El total exacto y el total redondeado hacia arriba a cada billete (₡1 000, ₡2 000,
₡5 000, ₡10 000, ₡20 000), sin repetir y hasta 4 opciones:

```text
Total ₡3 900 → ₡3 900 · ₡4 000 · ₡5 000 · ₡10 000
```

### Saldo del cliente (`creditBalance`)

```text
Saldo = ventas a crédito − abonos = ₡12 000,00 − ₡5 000,00 = ₡7 000,00
```

### Lector de código de barras (`WedgeBuffer`, `hasValidGtinCheckDigit`)

- Es una **ráfaga** si entre tecla y tecla pasan 80 ms o menos y tiene 4 caracteres o
  más; una persona tecleando es más lenta y no dispara la búsqueda.
- Un código de 8, 12, 13 o 14 dígitos se revisa con el dígito de control (mismo
  cálculo de pesos 1 y 3 que en [Productos e inventario](productos-e-inventario.md)).

### Día del negocio (`getDailyHistory`, `getDailySummary`)

Costa Rica está en UTC−6 todo el año, así que el día va de las 06:00 UTC a las 06:00
UTC del día siguiente. Una venta a las 11:30 p. m. hora local cuenta en ese día y no
en el siguiente.

### Inicio (`dashboard-metrics.ts`)

```text
Inventario valorizado = Σ stock × costo de los productos activos
Porcentaje de una barra = valor del producto ÷ valor total × 100, con un decimal
```

## 5. Dónde buscar cuando algo falla

| Síntoma | Dónde mirar |
| --- | --- |
| «El precio de … cambió» | Alguien editó el precio mientras se cobraba: volver a agregar el producto |
| «Stock insuficiente: otra venta se llevó las unidades» | `sales.repository.ts` (`createSale`): otra caja vendió primero |
| La venta se registró dos veces | La llave de idempotencia en `use-pos.ts` (debe ser la misma en el reintento) |
| El lector no agrega el producto | `barcode-scanner.ts` (¿el foco está en un campo de texto?) y `GET /api/sales/lookup` |
| El total del día no coincide con el historial | El rango de fechas en `sales.service.ts` (UTC−6) |
| El saldo del cliente no cuadra | `customers.repository.ts` (`getCreditTotals`) y las devoluciones de ventas a crédito |
| No se puede devolver una venta | Ya está anulada o devuelta del todo: `adjustSale` |

Pruebas: `backend/src/**/sales*.test.ts`, `sales-history.service.test.ts` y
`e2e/tests/hu-16-17-18-ventas.spec.ts`, `hu-20-…`, `hu-34-…`.
