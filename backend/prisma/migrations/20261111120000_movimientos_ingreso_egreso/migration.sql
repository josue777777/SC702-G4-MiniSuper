-- Movimientos con ingreso y egreso (HU-38): una compra directa (sin pedido)
-- guarda su factura, fecha, costo y proveedor; un egreso (vencido, traslado,
-- devolución a proveedor) guarda su documento, su detalle y el lote del que
-- salió. El producto suma su unidad de medida y un stock máximo.

-- CreateEnum
CREATE TYPE "UnitOfMeasure" AS ENUM ('UD', 'KG', 'G', 'L', 'ML', 'M', 'CJ', 'PQ');

-- AlterTable
ALTER TABLE "InventoryMovement" ADD COLUMN     "detail" TEXT,
ADD COLUMN     "documentDate" DATE,
ADD COLUMN     "documentNumber" TEXT,
ADD COLUMN     "exitLotId" UUID,
ADD COLUMN     "supplierId" UUID,
ADD COLUMN     "unitCost" DECIMAL(12,2);

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "maxStock" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "unit" "UnitOfMeasure" NOT NULL DEFAULT 'UD';

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_exitLotId_fkey" FOREIGN KEY ("exitLotId") REFERENCES "ProductLot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "InventoryMovement_supplierId_idx" ON "InventoryMovement"("supplierId");

-- CreateIndex
CREATE INDEX "InventoryMovement_exitLotId_idx" ON "InventoryMovement"("exitLotId");

-- El máximo nunca es negativo (0 = sin máximo).
ALTER TABLE "Product" ADD CONSTRAINT "Product_maxStock_check" CHECK ("maxStock" >= 0);
