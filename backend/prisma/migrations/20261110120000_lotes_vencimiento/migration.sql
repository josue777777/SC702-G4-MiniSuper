-- Lotes con vencimiento (HU-38): cada entrada guarda en qué lotes vino cada
-- producto y cuándo vence cada uno. Un lote nuevo nunca reemplaza la fecha de
-- los anteriores, y el stock del producto es SIEMPRE la suma de sus lotes.

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "perishable" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "PurchaseReceiptItemLot" (
    "id" UUID NOT NULL,
    "receiptItemId" UUID NOT NULL,
    "lotNumber" TEXT NOT NULL,
    "expirationDate" DATE,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "PurchaseReceiptItemLot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductLot" (
    "id" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "lotNumber" TEXT NOT NULL,
    "expirationDate" DATE,
    "quantity" INTEGER NOT NULL,
    "receivedQuantity" INTEGER NOT NULL,
    "entryMovementId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductLot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseReceiptItemLot_receiptItemId_lotNumber_key" ON "PurchaseReceiptItemLot"("receiptItemId", "lotNumber");

-- CreateIndex
CREATE INDEX "ProductLot_productId_expirationDate_idx" ON "ProductLot"("productId", "expirationDate");

-- CreateIndex
CREATE INDEX "ProductLot_entryMovementId_idx" ON "ProductLot"("entryMovementId");

-- AddForeignKey
ALTER TABLE "PurchaseReceiptItemLot" ADD CONSTRAINT "PurchaseReceiptItemLot_receiptItemId_fkey" FOREIGN KEY ("receiptItemId") REFERENCES "PurchaseReceiptItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductLot" ADD CONSTRAINT "ProductLot_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductLot" ADD CONSTRAINT "ProductLot_entryMovementId_fkey" FOREIGN KEY ("entryMovementId") REFERENCES "InventoryMovement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Las cantidades de un lote nunca son negativas; lo que llega en un lote es > 0.
ALTER TABLE "ProductLot" ADD CONSTRAINT "ProductLot_quantity_check" CHECK ("quantity" >= 0 AND "receivedQuantity" >= 0);
ALTER TABLE "PurchaseReceiptItemLot" ADD CONSTRAINT "PurchaseReceiptItemLot_quantity_check" CHECK ("quantity" > 0);

-- Los productos que hoy no tienen fecha se consideran «No vence»; los nuevos
-- vencen salvo que se marque lo contrario (default true).
UPDATE "Product" SET "perishable" = ("expirationDate" IS NOT NULL);

-- Lo que ya hay en inventario queda en un lote «SIN LOTE» con la fecha que tenía
-- el producto, para que desde hoy stock = suma de lotes.
INSERT INTO "ProductLot" ("id", "productId", "lotNumber", "expirationDate", "quantity", "receivedQuantity")
SELECT gen_random_uuid(), "id", 'SIN LOTE', "expirationDate"::date, "stock", "stock"
FROM "Product"
WHERE "stock" > 0;

-- Disparador: los lotes siguen al stock. Así ventas, devoluciones, conteos y
-- ediciones no tienen que conocer los lotes para no descuadrarlos.
--   * Si el stock BAJA, se descuenta del lote que vence primero (FEFO: el que
--     vence antes sale antes; los que no vencen, al final).
--   * Si SUBE sin que nadie haya agregado el lote (devolución, conteo, stock
--     inicial), la diferencia va al lote «SIN LOTE» con la fecha del producto.
--   * Una recepción (HU-38) inserta sus lotes ANTES de subir el stock, así que
--     al dispararse la suma ya cuadra y no hace nada.
CREATE FUNCTION "product_lots_follow_stock"() RETURNS trigger AS $$
DECLARE
  difference INTEGER;
  remaining  INTEGER;
  taken      INTEGER;
  lot        RECORD;
BEGIN
  SELECT NEW."stock" - COALESCE(SUM("quantity"), 0) INTO difference
  FROM "ProductLot" WHERE "productId" = NEW."id";

  IF difference > 0 THEN
    UPDATE "ProductLot"
       SET "quantity" = "quantity" + difference,
           "receivedQuantity" = "receivedQuantity" + difference
     WHERE "productId" = NEW."id"
       AND "lotNumber" = 'SIN LOTE'
       AND "expirationDate" IS NOT DISTINCT FROM NEW."expirationDate"::date;

    IF NOT FOUND THEN
      INSERT INTO "ProductLot" ("id", "productId", "lotNumber", "expirationDate", "quantity", "receivedQuantity")
      VALUES (gen_random_uuid(), NEW."id", 'SIN LOTE', NEW."expirationDate"::date, difference, difference);
    END IF;
  ELSIF difference < 0 THEN
    remaining := -difference;

    FOR lot IN
      SELECT "id", "quantity" FROM "ProductLot"
       WHERE "productId" = NEW."id" AND "quantity" > 0
       ORDER BY "expirationDate" ASC NULLS LAST, "createdAt" ASC, "id" ASC
       FOR UPDATE
    LOOP
      EXIT WHEN remaining = 0;
      taken := LEAST(remaining, lot."quantity");
      UPDATE "ProductLot" SET "quantity" = "quantity" - taken WHERE "id" = lot."id";
      remaining := remaining - taken;
    END LOOP;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "product_lots_follow_stock"
AFTER INSERT OR UPDATE OF "stock" ON "Product"
FOR EACH ROW EXECUTE FUNCTION "product_lots_follow_stock"();
