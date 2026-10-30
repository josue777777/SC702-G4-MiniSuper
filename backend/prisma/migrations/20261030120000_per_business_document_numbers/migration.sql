-- Consecutivos POR NEGOCIO (venta y pedido) y llave de idempotencia por negocio.
--
-- Antes, "Sale"."number" y "PurchaseOrder"."number" salían de un contador
-- global: un negocio con 3 ventas podía imprimir «Venta #57», y por los saltos
-- de numeración deducir cuánto venden los demás.
--
-- Los números ya emitidos NO se renumeran: pueden estar impresos en
-- comprobantes y pedidos entregados. Siguen siendo únicos dentro de su negocio
-- (lo eran en todo el sistema), y cada contador continúa desde el mayor de su
-- negocio.

-- CreateEnum
CREATE TYPE "DocumentKind" AS ENUM ('SALE', 'PURCHASE_ORDER');

-- CreateTable
CREATE TABLE "DocumentSequence" (
    "businessId" UUID NOT NULL,
    "kind" "DocumentKind" NOT NULL,
    "next" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "DocumentSequence_pkey" PRIMARY KEY ("businessId","kind"),
    CONSTRAINT "DocumentSequence_next_check" CHECK ("next" >= 1)
);

ALTER TABLE "DocumentSequence" ADD CONSTRAINT "DocumentSequence_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Cada negocio continúa desde su mayor número actual.
INSERT INTO "DocumentSequence" ("businessId", "kind", "next")
SELECT "businessId", 'SALE', MAX("number") + 1 FROM "Sale" GROUP BY "businessId";

INSERT INTO "DocumentSequence" ("businessId", "kind", "next")
SELECT "businessId", 'PURCHASE_ORDER', MAX("number") + 1 FROM "PurchaseOrder" GROUP BY "businessId";

-- De único global a único por negocio.
DROP INDEX "Sale_number_key";
DROP INDEX "PurchaseOrder_number_key";
DROP INDEX "Sale_idempotencyKey_key";

CREATE UNIQUE INDEX "Sale_businessId_number_key" ON "Sale"("businessId", "number");
CREATE UNIQUE INDEX "PurchaseOrder_businessId_number_key" ON "PurchaseOrder"("businessId", "number");
CREATE UNIQUE INDEX "Sale_businessId_idempotencyKey_key" ON "Sale"("businessId", "idempotencyKey");

-- El número ya no sale del contador global: lo asigna "DocumentSequence".
ALTER TABLE "Sale" ALTER COLUMN "number" DROP DEFAULT;
DROP SEQUENCE "Sale_number_seq";

ALTER TABLE "PurchaseOrder" ALTER COLUMN "number" DROP DEFAULT;
DROP SEQUENCE "PurchaseOrder_number_seq";

ALTER TABLE "Sale" ADD CONSTRAINT "Sale_number_check" CHECK ("number" >= 1);
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_number_check" CHECK ("number" >= 1);
