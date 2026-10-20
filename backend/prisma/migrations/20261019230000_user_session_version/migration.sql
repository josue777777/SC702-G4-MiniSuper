-- HU-15: cerrar sesión invalida los tokens emitidos antes.
-- Cada token lleva la versión vigente; al cerrar sesión se incrementa. Seguro
-- con datos existentes: la columna nace en 0 (los tokens previos a esta
-- migración no la traen y piden iniciar sesión de nuevo).

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "sessionVersion" INTEGER NOT NULL DEFAULT 0;
