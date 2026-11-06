# Reportes comerciales

Historias: HU-28, HU-29, HU-30 y HU-40. El reporte de inventario (HU-25 a HU-27) se
explica en [Productos e inventario](productos-e-inventario.md). Volver al
[índice de la guía](README.md).

## 1. Qué hace

En Reportes hay cuatro pestañas comerciales, solo para el Encargado (permiso
`reports.sales`):

| Pestaña | Responde a la pregunta |
| --- | --- |
| **Ventas** (HU-28) | ¿Cuánto se vendió en el período, cuánto se devolvió y con qué método de pago? |
| **Ganancias** (HU-29) | ¿Cuánto quedó después de restar el costo de lo vendido? |
| **Más vendidos** (HU-30) | ¿Qué productos salieron más (en unidades)? |
| **Deudas de clientes** (HU-30) | ¿Quién debe y cuánto, hoy? |

Cada una tiene filtros (período, categoría, precio), resumen, gráfico, detalle por
páginas, PDF (imprimir) y Excel (HU-40).

Con el permiso `reports.inventory` (Encargado y Bodega) están además
**Inventario** (HU-25) y **Conteos** (HU-10): los conteos físicos del período, con
lo que decía el sistema, lo que se contó, la diferencia y su valor. Conteos usa el
mismo formato que los comerciales (`ReportResult`), así que se ve, se filtra, se
imprime y se exporta igual; solo cambia la ruta (`/api/reports/counts`, porque el
permiso es otro). Antes era un historial plegado dentro de la ventana de Conteo
físico; se movió aquí porque revisar conteos pasados es otra tarea
(docs/PANTALLAS.md, regla 4).

**Regla de oro del módulo:** los reportes **no guardan nada**; leen las ventas y las
resumen. Usan el precio y el costo **de cada venta** (los guardados en `SaleItem`),
no los del catálogo de hoy.

## 2. Flujo de información

```text
Entrada   ReportFilters.tsx: { from, to, categoryId?, minPrice?, maxPrice? }
   │      (período rápido con report-periods.ts: Hoy, Esta semana, Este mes…)
   ▼  GET /api/reports/commercial/:kind?from=&to=…   (kind = sales | profits | top-products | customer-debts)
routes/reports.routes.ts → controllers/reports.controller.ts
   │   valida con validators/reports.validator.ts (máximo 366 días, desde ≤ hasta)
   ▼
services/reports.service.ts → sales() · profits() · topProducts() · customerDebts()
   │   1. loadSales: ventas del período (días de Costa Rica), sin las anuladas
   │   2. reports.lines.ts: cada línea con lo vendido MENOS lo devuelto
   │   3. arma { summary, charts, rows, filters, notices }
   ▼
Responde  { data: ReportResult }  → ReportResultView.tsx dibuja tarjetas, gráfico y tabla
```

### Otras rutas

| Ruta | Para qué |
| --- | --- |
| `GET /api/reports/commercial/options` | Categorías para el filtro |
| `GET /api/reports/commercial/:kind/rows?page=` | El detalle por páginas (`use-paged-rows.ts`) |
| `GET /api/reports/commercial/:kind/export` | El Excel con los mismos filtros (`utils/reports-xlsx.ts`) |
| `GET /api/reports/counts?from=&to=` · `/rows` · `/export` | Reporte de conteos (HU-10): `routes/counts-report.routes.ts` → `CountsReportController` → `services/counts-report.service.ts` → `InventoryRepository.countsInPeriod()` |

Los dos controladores comparten `ReportEndpoints` (`controllers/reports.controller.ts`):
resumen, filas por página y Excel se responden igual; cada uno solo dice cómo se
genera su reporte.

### En el navegador

```text
pages/ReportsPage.tsx                    pestañas (y «Inventario» si el rol lo tiene)
  └─ features/reports/CommercialReports.tsx
       ├─ use-commercial-report.ts        pide el reporte cuando cambian los filtros
       ├─ ReportFilters.tsx / report-filters.ts / report-periods.ts
       ├─ ReportResultView.tsx / ReportChartView.tsx / ReportDetail.tsx
       ├─ ReportCustomizeModal.tsx / report-preferences.ts   columnas visibles e impresión
       └─ ReportActions.tsx / ReportPdfPreview.tsx           PDF y Excel
```

El PDF lo hace el navegador: `printReport()` agrega la clase `printing-report` y la
hoja de estilos de impresión deja visible solo el reporte; el usuario elige
«Guardar como PDF».

## 3. Librerías

| Librería | Qué resuelve aquí |
| --- | --- |
| **exceljs** | El `.xlsx` con importes como números con formato de moneda (se pueden sumar en Excel) |
| **Zod** | Que las fechas sean `AAAA-MM-DD`, el rango no pase de 366 días y los precios tengan 2 decimales |
| **Prisma** | Leer las ventas con sus líneas, devoluciones y abonos en una sola consulta |

Los gráficos se dibujan con SVG propio (`ReportChartView.tsx`), sin librería.

## 4. Cálculos

Todo el dinero se suma en **céntimos enteros** (`bigint`), para no arrastrar errores
de decimales: `0.1 + 0.2` en JavaScript da `0.30000000000000004`.

### Línea efectiva (`toEffectiveLines`, `lineAmounts`)

```text
Se vendieron 5 cafés a ₡1 800 (costo ₡1 200) y luego devolvieron 1:
  unidades netas = 5 − 1           = 4
  original       = 5 × ₡1 800      = ₡9 000
  devuelto       = 1 × ₡1 800      = ₡1 800
  neto           = 4 × ₡1 800      = ₡7 200
  costo          = 4 × ₡1 200      = ₡4 800
  ganancia       = ₡7 200 − ₡4 800 = ₡2 400
```

Una devolución hecha otro día ajusta **la venta original**, no el día en que se
devolvió.

### Ventas (`sales`)

```text
Total vendido (neto) = Σ neto        Importe original = Σ original
Devuelto             = Σ devuelto    Transacciones = ventas distintas
```

### Ganancias (`profits`, `isCreditSaleCollected`)

```text
Ganancia = Σ neto − Σ costo, solo de ventas COBRADAS
```

Efectivo y tarjeta se cobran al vender. Un **fiado** solo cuenta cuando los abonos
ligados a esa venta cubren su total; si no, se excluye y el resumen muestra cuántos
fiados y qué monto quedaron fuera. Un producto con costo ₡0 se señala porque su
ganancia sale inflada.

### Más vendidos (`topProducts`)

Ordena por unidades netas de mayor a menor; con empate, por código. El gráfico junta
lo que no cabe en una barra «Otros» (`sumBy` en `utils/report-charts.ts`).

### Deudas de clientes (`customerDebts`, `debtOf`)

```text
Saldo = ventas a crédito vigentes − abonos   (el mismo cálculo que Clientes)
Ana: fiados ₡12 000 − abonos ₡5 000 = debe ₡7 000
Un cliente con saldo 0 o a favor no aparece.
```

Es un corte **al momento de consultar**: no usa el período.

### Períodos rápidos (`periodRange` en `report-periods.ts`)

Se cuentan en días de Costa Rica; la semana empieza el lunes. Ejemplo, con hoy
miércoles 2026-11-04: «Esta semana» = 2026-11-02 a 2026-11-04; «Últimos 7 días» =
2026-10-29 a 2026-11-04 (hoy cuenta).

## 5. Dónde buscar cuando algo falla

| Síntoma | Dónde mirar |
| --- | --- |
| El total no coincide con el historial del día | ¿Hay devoluciones? El reporte usa el neto; el período usa días de Costa Rica |
| Una venta a crédito no aparece en Ganancias | `isCreditSaleCollected` (`reports.lines.ts`): aún no está cobrada |
| La ganancia sale muy alta | Productos con costo ₡0: el aviso del reporte los lista |
| Una venta antigua sale en otra categoría | Esperado: la categoría es la ACTUAL del producto (aviso del reporte) |
| «El rango no puede superar 366 días» | `validators/reports.validator.ts` (`MAX_REPORT_DAYS`) |
| El Excel no coincide con la pantalla | `utils/reports-xlsx.ts` (usa el mismo `ReportResult`) |
| El PDF imprime el menú | `report-preferences.ts` (`printReport`) y los estilos `@media print` |

Pruebas: `backend/src/**/reports*.test.ts`, `report-charts.test.ts` y
`e2e/tests/hu-28-…`, `hu-29-…`, `hu-30-…`, `hu-40-…`.
