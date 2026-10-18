-- HU-24: número consecutivo del pedido (PED-0001, PED-0002…).
-- Los pedidos que ya existen se numeran por fecha de creación, y los nuevos
-- siguen desde el último número.
CREATE SEQUENCE "PurchaseOrder_number_seq";

ALTER TABLE "PurchaseOrder" ADD COLUMN "number" INTEGER;

UPDATE "PurchaseOrder" AS p
SET "number" = o.rn
FROM (
  SELECT "id", ROW_NUMBER() OVER (ORDER BY "createdAt", "id") AS rn
  FROM "PurchaseOrder"
) AS o
WHERE p."id" = o."id";

SELECT setval(
  '"PurchaseOrder_number_seq"',
  COALESCE((SELECT MAX("number") FROM "PurchaseOrder"), 0) + 1,
  false
);

ALTER TABLE "PurchaseOrder"
  ALTER COLUMN "number" SET DEFAULT nextval('"PurchaseOrder_number_seq"'),
  ALTER COLUMN "number" SET NOT NULL;

ALTER SEQUENCE "PurchaseOrder_number_seq" OWNED BY "PurchaseOrder"."number";

CREATE UNIQUE INDEX "PurchaseOrder_number_key" ON "PurchaseOrder"("number");
