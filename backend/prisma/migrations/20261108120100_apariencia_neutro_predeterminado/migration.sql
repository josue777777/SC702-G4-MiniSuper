-- El sistema pasa al diseño neutro: es la apariencia de fábrica. Quien tenía la
-- de fábrica anterior (azul) pasa al neutro; quien eligió otro color lo conserva.
ALTER TABLE "UserPreferences" ALTER COLUMN "accentColor" SET DEFAULT 'NEUTRO';
UPDATE "UserPreferences" SET "accentColor" = 'NEUTRO' WHERE "accentColor" = 'AZUL';
