-- Usuarios y roles (HU-11 a HU-15, criterios del Sprint 3).
-- Se deja de limitar la tabla a una sola cuenta: el administrador crea usuarios
-- y les asigna un rol. La cuenta que ya existía pasa a ser ADMIN, así nadie
-- pierde el acceso al aplicar la migración.

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'ENCARGADO', 'CAJERO', 'BODEGA');

-- AlterTable: las filas existentes reciben ADMIN; después el rol es obligatorio
-- y sin valor por omisión (cada alta debe indicarlo).
ALTER TABLE "User" ADD COLUMN "role" "UserRole" NOT NULL DEFAULT 'ADMIN';
ALTER TABLE "User" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "User" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "User" ADD COLUMN "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;

-- DropIndex / AlterTable: ya no hay una sola cuenta.
DROP INDEX "User_isOwner_key";
ALTER TABLE "User" DROP COLUMN "isOwner";
