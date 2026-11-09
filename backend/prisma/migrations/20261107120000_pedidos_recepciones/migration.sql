-- Recepciones de pedidos con factura (HU-38): un pedido se recibe en una o varias
-- entregas; cada una puede cargarse al inventario al registrarla o quedar pendiente.

-- AlterEnum
ALTER TYPE "PurchaseOrderStatus" ADD VALUE 'PARTIAL';

-- AlterTable
ALTER TABLE "InventoryMovement" ADD COLUMN     "receiptId" UUID;

-- CreateTable
CREATE TABLE "PurchaseReceipt" (
    "id" UUID NOT NULL,
    "purchaseOrderId" UUID NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "receivedOn" DATE NOT NULL,
    "loadedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PurchaseReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseReceiptItem" (
    "id" UUID NOT NULL,
    "receiptId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "PurchaseReceiptItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PurchaseReceipt_purchaseOrderId_createdAt_idx" ON "PurchaseReceipt"("purchaseOrderId", "createdAt");

-- CreateIndex
CREATE INDEX "PurchaseReceipt_loadedAt_idx" ON "PurchaseReceipt"("loadedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseReceipt_purchaseOrderId_invoiceNumber_key" ON "PurchaseReceipt"("purchaseOrderId", "invoiceNumber");

-- CreateIndex
CREATE INDEX "PurchaseReceiptItem_productId_idx" ON "PurchaseReceiptItem"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseReceiptItem_receiptId_productId_key" ON "PurchaseReceiptItem"("receiptId", "productId");

-- CreateIndex
CREATE INDEX "InventoryMovement_receiptId_idx" ON "InventoryMovement"("receiptId");

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "PurchaseReceipt"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseReceipt" ADD CONSTRAINT "PurchaseReceipt_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseReceiptItem" ADD CONSTRAINT "PurchaseReceiptItem_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "PurchaseReceipt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseReceiptItem" ADD CONSTRAINT "PurchaseReceiptItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Cada línea de una entrega trae al menos una unidad.
ALTER TABLE "PurchaseReceiptItem" ADD CONSTRAINT "PurchaseReceiptItem_quantity_check" CHECK ("quantity" > 0);
