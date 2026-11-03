-- AlterTable
ALTER TABLE "CreditPayment" ADD COLUMN     "operationId" UUID;

-- CreateTable
CREATE TABLE "CreditPaymentOperation" (
    "id" UUID NOT NULL,
    "businessId" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "totalAmount" DECIMAL(12,2) NOT NULL,
    "paymentDate" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditPaymentOperation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CreditPaymentOperation_customerId_createdAt_idx" ON "CreditPaymentOperation"("customerId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CreditPaymentOperation_businessId_idempotencyKey_key" ON "CreditPaymentOperation"("businessId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "CreditPayment_operationId_idx" ON "CreditPayment"("operationId");

-- AddForeignKey
ALTER TABLE "CreditPayment" ADD CONSTRAINT "CreditPayment_operationId_fkey" FOREIGN KEY ("operationId") REFERENCES "CreditPaymentOperation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditPaymentOperation" ADD CONSTRAINT "CreditPaymentOperation_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditPaymentOperation" ADD CONSTRAINT "CreditPaymentOperation_customerId_businessId_fkey" FOREIGN KEY ("customerId", "businessId") REFERENCES "Customer"("id", "businessId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditPaymentOperation" ADD CONSTRAINT "CreditPaymentOperation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Un abono siempre es de un monto positivo (Prisma no modela CHECK; se agrega a mano).
ALTER TABLE "CreditPaymentOperation"
  ADD CONSTRAINT "CreditPaymentOperation_totalAmount_positive" CHECK ("totalAmount" > 0);
