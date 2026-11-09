# Ventas y clientes

Historias: HU-16 a HU-18, HU-20, HU-34, HU-35, HU-36 y HU-37 (abonos a fiados: HU-19,
en curso). Volver al [índice de la guía](README.md).

## 1. Qué hace

- **Caja** (Ventas › Caja): escanear o buscar productos, armar el carrito, cobrar en
  efectivo, tarjeta o fiado y entregar el comprobante (HU-16 a HU-18, HU-34).
- **Historial del día** (Ventas › Historial del día): las ventas de un día, filtradas
  por método de pago (HU-20), con las mismas piezas que Pedidos y Proveedores:
  - columnas en orden: N.º, hora, cliente, productos, pago, estado (insignia con su
    palabra: «Completada», «Con devolución», «Devuelta», «Anulada») y total (si cambió,
    debajo «de ₡X», el original);
  - en la celda de productos, el primero y «+N más», que abre solo esa lista en una
    ventana de 4 en 4 (`SaleProductsModal.tsx`): la fila no crece;
  - por fila, «Ver venta» (el detalle completo) y «🧾 Comprobante» (HU-34);
  - páginas de 15 armadas en el servidor con `Pagination`; mientras llega otra página
    se ve la anterior atenuada.
- **Devolver o anular** una venta (HU-35): desde «Ver venta» › «Anular o devolver»
  (se decide viendo la venta completa); devuelve las unidades al stock y deja
  constancia.
- **Clientes**: el cliente al que se le fía y su saldo (HU-18, HU-36).
- **Inicio**: «Lo urgente hoy» (como mucho tres urgencias con su acción) y el resumen
  de ventas de hoy (HU-37). La barra de comandos `Ctrl + K` está en todas las pantallas.

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
  └─ SalesHistory.tsx / SaleProductsModal.tsx / SaleDetailModal.tsx / SaleAdjustmentModal.tsx
pages/CustomersPage.tsx → features/customers/CustomersSection.tsx
pages/DashboardPage.tsx → features/dashboard/
  ├─ use-dashboard.ts          alertas, facturas sin cargar, pedidos y ventas del día (cada 15 s)
  ├─ dashboard-urgencies.ts    arma y ordena las urgencias (sin React)
  └─ UrgentToday.tsx           las tres primeras, «Ver todo», «¡Está al día!» y las acciones
layouts/MainLayout.tsx → features/command-bar/ (commands.ts, CommandBar.tsx)   Ctrl + K
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

### Inicio (`dashboard-urgencies.ts`)

```text
Urgencias, de más grave a menos grave (a igual gravedad, en este orden):
  Crítico   productos vencidos · sin stock (alguno en 0)
  Atención  stock en su mínimo · facturas sin cargar (HU-38) · vencen en < 15 días
  Aviso     pedidos que esperan mercadería
Se ven las 3 primeras; el resto, en «Ver todo (N)».
```

Ejemplo: 1 vencido, el café en 0 y una factura sin cargar → se ven esas tres; si
además algo vence en 5 días, aparece «Ver todo (4)».

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
