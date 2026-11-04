-- Multi-negocio (ADR 0002, etapa 2): cada negocio cliente tiene sus propios
-- datos. Los datos que ya existían pasan al «negocio inicial», creado con los
-- datos de BusinessSettings, así que nada se pierde.

-- CreateEnum
CREATE TYPE "BusinessStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "PlanRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- 1. Tablas nuevas -----------------------------------------------------------

CREATE TABLE "Business" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "legalId" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "receiptMessage" TEXT,
    "logoData" BYTEA,
    "logoMimeType" TEXT,
    "logoUpdatedAt" TIMESTAMP(3),
    "extraUsers" INTEGER NOT NULL DEFAULT 0,
    "status" "BusinessStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Business_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Business_extraUsers_not_negative" CHECK ("extraUsers" >= 0),
    -- El logo nunca queda a medias: imagen y tipo van juntos.
    CONSTRAINT "Business_logo_complete" CHECK (("logoData" IS NULL) = ("logoMimeType" IS NULL))
);

CREATE TABLE "PlatformSettings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "systemName" TEXT NOT NULL DEFAULT 'MiniSuper',
    "pricePerExtraUser" DECIMAL(12,2) NOT NULL DEFAULT 5000,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformSettings_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PlatformSettings_single_row" CHECK ("id" = 1),
    CONSTRAINT "PlatformSettings_price_not_negative" CHECK ("pricePerExtraUser" >= 0)
);

CREATE TABLE "PlanRequest" (
    "id" UUID NOT NULL,
    "businessId" UUID NOT NULL,
    "requestedById" UUID NOT NULL,
    "extraUsers" INTEGER NOT NULL,
    "monthlyAmount" DECIMAL(12,2) NOT NULL,
    "note" TEXT,
    "status" "PlanRequestStatus" NOT NULL DEFAULT 'PENDING',
    "response" TEXT,
    "decidedById" UUID,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlanRequest_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PlanRequest_extraUsers_positive" CHECK ("extraUsers" > 0),
    CONSTRAINT "PlanRequest_amount_not_negative" CHECK ("monthlyAmount" >= 0)
);

-- 2. Datos: negocio inicial y plataforma ------------------------------------

-- El negocio inicial toma los datos y el logo que ya había. El plan anterior
-- contaba al Encargado dentro del límite; ahora el plan son sus adicionales.
INSERT INTO "Business" ("id", "name", "legalId", "phone", "email", "address", "receiptMessage",
                        "logoData", "logoMimeType", "logoUpdatedAt", "extraUsers", "updatedAt")
SELECT gen_random_uuid(), "name", "legalId", "phone", "email", "address", "receiptMessage",
       "logoData", "logoMimeType", "logoUpdatedAt", GREATEST("maxUsers" - 1, 0), CURRENT_TIMESTAMP
FROM "BusinessSettings";

-- Por si la fila no existiera: siempre hay un negocio para los datos actuales.
INSERT INTO "Business" ("id", "name", "receiptMessage", "updatedAt")
SELECT gen_random_uuid(), 'Abastecedor Nuevo Amanecer', '¡Gracias por su compra!', CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "Business");

INSERT INTO "PlatformSettings" ("id", "updatedAt") VALUES (1, CURRENT_TIMESTAMP);

-- 3. businessId en usuarios y tablas del negocio ------------------------------

ALTER TABLE "User" ADD COLUMN "businessId" UUID;
ALTER TABLE "Category" ADD COLUMN "businessId" UUID;
ALTER TABLE "Product" ADD COLUMN "businessId" UUID;
ALTER TABLE "Customer" ADD COLUMN "businessId" UUID;
ALTER TABLE "Sale" ADD COLUMN "businessId" UUID;
ALTER TABLE "Supplier" ADD COLUMN "businessId" UUID;
ALTER TABLE "PurchaseOrder" ADD COLUMN "businessId" UUID;

-- Todo lo existente es del negocio inicial (en este punto es el único).
UPDATE "User" SET "businessId" = (SELECT "id" FROM "Business") WHERE "role" <> 'ADMIN';
UPDATE "Category" SET "businessId" = (SELECT "id" FROM "Business");
UPDATE "Product" SET "businessId" = (SELECT "id" FROM "Business");
UPDATE "Customer" SET "businessId" = (SELECT "id" FROM "Business");
UPDATE "Sale" SET "businessId" = (SELECT "id" FROM "Business");
UPDATE "Supplier" SET "businessId" = (SELECT "id" FROM "Business");
UPDATE "PurchaseOrder" SET "businessId" = (SELECT "id" FROM "Business");

ALTER TABLE "Category" ALTER COLUMN "businessId" SET NOT NULL;
ALTER TABLE "Product" ALTER COLUMN "businessId" SET NOT NULL;
ALTER TABLE "Customer" ALTER COLUMN "businessId" SET NOT NULL;
ALTER TABLE "Sale" ALTER COLUMN "businessId" SET NOT NULL;
ALTER TABLE "Supplier" ALTER COLUMN "businessId" SET NOT NULL;
ALTER TABLE "PurchaseOrder" ALTER COLUMN "businessId" SET NOT NULL;

-- Los administradores son de la plataforma; todos los demás, de un negocio.
ALTER TABLE "User" ADD CONSTRAINT "User_business_by_role"
  CHECK (("role" = 'ADMIN') = ("businessId" IS NULL));

-- 4. Únicos por negocio (dos negocios pueden tener el mismo código) ----------

ALTER TABLE "Product" DROP CONSTRAINT "Product_categoryId_fkey";
ALTER TABLE "PurchaseOrder" DROP CONSTRAINT "PurchaseOrder_supplierId_fkey";
ALTER TABLE "Sale" DROP CONSTRAINT "Sale_customerId_fkey";

DROP INDEX "Category_name_key";
DROP INDEX "Product_barcode_key";
DROP INDEX "Product_code_key";
DROP INDEX "Supplier_name_key";

CREATE INDEX "PlanRequest_status_createdAt_idx" ON "PlanRequest"("status", "createdAt");
CREATE INDEX "PlanRequest_businessId_createdAt_idx" ON "PlanRequest"("businessId", "createdAt");
-- Una sola solicitud pendiente por negocio.
CREATE UNIQUE INDEX "PlanRequest_one_pending_per_business" ON "PlanRequest"("businessId") WHERE "status" = 'PENDING';
CREATE UNIQUE INDEX "Category_businessId_name_key" ON "Category"("businessId", "name");
CREATE UNIQUE INDEX "Category_id_businessId_key" ON "Category"("id", "businessId");
CREATE INDEX "Customer_businessId_name_idx" ON "Customer"("businessId", "name");
CREATE UNIQUE INDEX "Customer_id_businessId_key" ON "Customer"("id", "businessId");
CREATE UNIQUE INDEX "Product_businessId_code_key" ON "Product"("businessId", "code");
CREATE UNIQUE INDEX "Product_businessId_barcode_key" ON "Product"("businessId", "barcode");
CREATE INDEX "PurchaseOrder_businessId_createdAt_idx" ON "PurchaseOrder"("businessId", "createdAt");
CREATE INDEX "Sale_businessId_createdAt_idx" ON "Sale"("businessId", "createdAt");
CREATE UNIQUE INDEX "Supplier_businessId_name_key" ON "Supplier"("businessId", "name");
CREATE UNIQUE INDEX "Supplier_id_businessId_key" ON "Supplier"("id", "businessId");
CREATE INDEX "User_businessId_idx" ON "User"("businessId");

-- 5. Llaves foráneas ----------------------------------------------------------

ALTER TABLE "User" ADD CONSTRAINT "User_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PlanRequest" ADD CONSTRAINT "PlanRequest_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PlanRequest" ADD CONSTRAINT "PlanRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PlanRequest" ADD CONSTRAINT "PlanRequest_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Category" ADD CONSTRAINT "Category_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Product" ADD CONSTRAINT "Product_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- Compuestas: la base impide mezclar negocios (un producto con la categoría de
-- otro negocio, una venta fiada a un cliente ajeno, un pedido a un proveedor ajeno).
ALTER TABLE "Product" ADD CONSTRAINT "Product_categoryId_businessId_fkey" FOREIGN KEY ("categoryId", "businessId") REFERENCES "Category"("id", "businessId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_customerId_businessId_fkey" FOREIGN KEY ("customerId", "businessId") REFERENCES "Customer"("id", "businessId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Supplier" ADD CONSTRAINT "Supplier_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_supplierId_businessId_fkey" FOREIGN KEY ("supplierId", "businessId") REFERENCES "Supplier"("id", "businessId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 6. La tabla de una sola fila ya no hace falta ------------------------------
DROP TABLE "BusinessSettings";
