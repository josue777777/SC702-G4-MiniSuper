-- HU-16/17: número consecutivo de la venta, efectivo recibido (HU-17) y llave de
-- idempotencia contra ventas duplicadas por doble clic o reintento (HU-16).
-- Las ventas que ya existan se numeran por fecha de creación y las nuevas siguen
-- desde el último número. Las columnas nuevas son opcionales: no rompen datos previos.
CREATE SEQUENCE "Sale_number_seq";

ALTER TABLE "Sale" ADD COLUMN "number" INTEGER;
ALTER TABLE "Sale" ADD COLUMN "cashReceived" DECIMAL(12,2);
ALTER TABLE "Sale" ADD COLUMN "idempotencyKey" TEXT;

UPDATE "Sale" AS s
SET "number" = o.rn
FROM (
  SELECT "id", ROW_NUMBER() OVER (ORDER BY "createdAt", "id") AS rn
  FROM "Sale"
) AS o
WHERE s."id" = o."id";

SELECT setval(
  '"Sale_number_seq"',
  COALESCE((SELECT MAX("number") FROM "Sale"), 0) + 1,
  false
);

ALTER TABLE "Sale"
  ALTER COLUMN "number" SET DEFAULT nextval('"Sale_number_seq"'),
  ALTER COLUMN "number" SET NOT NULL;

ALTER SEQUENCE "Sale_number_seq" OWNED BY "Sale"."number";

CREATE UNIQUE INDEX "Sale_number_key" ON "Sale"("number");
CREATE UNIQUE INDEX "Sale_idempotencyKey_key" ON "Sale"("idempotencyKey");
