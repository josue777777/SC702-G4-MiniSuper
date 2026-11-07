-- Factura del proveedor adjunta a cada entrega de un pedido (PDF o imagen, hasta 5 MB).
-- AlterTable
ALTER TABLE "PurchaseReceipt" ADD COLUMN     "invoiceFileAt" TIMESTAMP(3),
ADD COLUMN     "invoiceFileData" BYTEA,
ADD COLUMN     "invoiceFileName" TEXT,
ADD COLUMN     "invoiceFileType" TEXT;
