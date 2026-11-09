-- Alertas por lote (HU-32): las alertas de vencimiento salen de los lotes con
-- unidades. Lo que está en inventario sin lote propio (el lote «SIN LOTE»: lo
-- que había antes de los lotes, el stock inicial, una devolución) vence en la
-- fecha que el producto tiene en Inventario (HU-09). Este disparador la
-- copia a esos lotes cada vez que cambia, para que la alerta la siga.
--
-- Los lotes que entraron con una entrega o una compra (tienen su entrada en el
-- Kardex) conservan SU fecha: nunca se reemplaza.

-- Al día: los «SIN LOTE» toman la fecha actual de su producto.
UPDATE "ProductLot" AS l
   SET "expirationDate" = p."expirationDate"::date
  FROM "Product" AS p
 WHERE l."productId" = p."id"
   AND l."lotNumber" = 'SIN LOTE'
   AND l."entryMovementId" IS NULL;

CREATE FUNCTION "product_lots_follow_expiration"() RETURNS trigger AS $$
BEGIN
  UPDATE "ProductLot"
     SET "expirationDate" = NEW."expirationDate"::date
   WHERE "productId" = NEW."id"
     AND "lotNumber" = 'SIN LOTE'
     AND "entryMovementId" IS NULL;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "product_lots_follow_expiration"
AFTER UPDATE OF "expirationDate" ON "Product"
FOR EACH ROW
WHEN (OLD."expirationDate" IS DISTINCT FROM NEW."expirationDate")
EXECUTE FUNCTION "product_lots_follow_expiration"();
