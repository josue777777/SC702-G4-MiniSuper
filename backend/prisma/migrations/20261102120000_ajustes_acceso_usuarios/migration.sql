-- Ajustes varios de acceso: nombre de usuario para entrar al sistema y correo
-- opcional para el personal.
--
-- Las cuentas que ya existen reciben su usuario generado del nombre, con la
-- misma regla que la aplicación (`backend/src/utils/username.ts`): inicial del
-- nombre + primer apellido, sin tildes y en minúscula; si se repite, se le
-- agrega un número. Nadie pierde el acceso: también pueden seguir entrando con
-- su correo.

-- 1. Columna nueva (vacía por ahora) y correo opcional.
ALTER TABLE "User" ADD COLUMN "username" TEXT;
ALTER TABLE "User" ALTER COLUMN "email" DROP NOT NULL;

-- 2. Usuario generado para cada cuenta existente.
WITH words AS (
  SELECT
    id,
    "createdAt",
    ARRAY(
      SELECT cleaned
      FROM (
        SELECT regexp_replace(
                 translate(lower(word), 'áàäâéèëêíìïîóòöôúùüûñç', 'aaaaeeeeiiiioooouuuunc'),
                 '[^a-z0-9]', '', 'g'
               ) AS cleaned, position
        FROM unnest(regexp_split_to_array(trim(name), '\s+')) WITH ORDINALITY AS t(word, position)
      ) AS c
      WHERE cleaned <> ''
      ORDER BY position
    ) AS parts
  FROM "User"
),
bases AS (
  SELECT
    id,
    "createdAt",
    CASE
      WHEN cardinality(parts) = 0 THEN 'usuario'
      WHEN cardinality(parts) = 1 THEN parts[1]
      WHEN cardinality(parts) = 2 THEN left(parts[1], 1) || parts[2]
      ELSE left(parts[1], 1) || parts[cardinality(parts) - 1]
    END AS raw
  FROM words
),
normalized AS (
  SELECT
    id,
    "createdAt",
    left(CASE WHEN raw ~ '^[a-z]' THEN raw ELSE 'u' || raw END, 26) AS base
  FROM bases
),
numbered AS (
  SELECT
    id,
    CASE WHEN length(base) < 2 THEN 'usuario' ELSE base END AS base,
    row_number() OVER (
      PARTITION BY CASE WHEN length(base) < 2 THEN 'usuario' ELSE base END
      ORDER BY "createdAt", id
    ) AS n
  FROM normalized
)
UPDATE "User" AS u
SET "username" = CASE WHEN numbered.n = 1 THEN numbered.base ELSE numbered.base || numbered.n END
FROM numbered
WHERE numbered.id = u.id;

-- 3. Desde ahora es obligatorio y único.
ALTER TABLE "User" ALTER COLUMN "username" SET NOT NULL;
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
