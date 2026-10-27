CREATE TYPE "SaleStatus" AS ENUM ('COMPLETED', 'PARTIALLY_RETURNED', 'RETURNED', 'VOID');
CREATE TYPE "SaleAdjustmentType" AS ENUM ('RETURN', 'VOID');

ALTER TABLE "Sale"
ADD COLUMN "status" "SaleStatus" NOT NULL DEFAULT 'COMPLETED';

CREATE TABLE "SaleAdjustment" (
    "id" UUID NOT NULL,
    "saleId" UUID NOT NULL,
    "type" "SaleAdjustmentType" NOT NULL,
    "reason" TEXT NOT NULL,
    "total" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SaleAdjustment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SaleAdjustmentItem" (
    "id" UUID NOT NULL,
    "adjustmentId" UUID NOT NULL,
    "saleItemId" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "SaleAdjustmentItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SaleAdjustment_saleId_createdAt_idx" ON "SaleAdjustment"("saleId", "createdAt");
CREATE UNIQUE INDEX "SaleAdjustmentItem_adjustmentId_saleItemId_key"
ON "SaleAdjustmentItem"("adjustmentId", "saleItemId");
CREATE INDEX "SaleAdjustmentItem_saleItemId_idx" ON "SaleAdjustmentItem"("saleItemId");

ALTER TABLE "SaleAdjustment"
ADD CONSTRAINT "SaleAdjustment_saleId_fkey"
FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SaleAdjustmentItem"
ADD CONSTRAINT "SaleAdjustmentItem_adjustmentId_fkey"
FOREIGN KEY ("adjustmentId") REFERENCES "SaleAdjustment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SaleAdjustmentItem"
ADD CONSTRAINT "SaleAdjustmentItem_saleItemId_fkey"
FOREIGN KEY ("saleItemId") REFERENCES "SaleItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;