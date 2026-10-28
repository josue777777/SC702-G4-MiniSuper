-- Apariencia por usuario, logo del negocio y límite de usuarios del plan.

-- CreateEnum
CREATE TYPE "AccentColor" AS ENUM ('AZUL', 'VERDE', 'MORADO', 'NARANJA', 'GRIS');

-- CreateEnum
CREATE TYPE "FontScale" AS ENUM ('NORMAL', 'GRANDE');

-- AlterTable: logo y plan del negocio.
ALTER TABLE "BusinessSettings" ADD COLUMN     "logoData" BYTEA,
ADD COLUMN     "logoMimeType" TEXT,
ADD COLUMN     "logoUpdatedAt" TIMESTAMP(3),
ADD COLUMN     "maxUsers" INTEGER NOT NULL DEFAULT 5;

-- El plan permite al menos un usuario (el Encargado).
ALTER TABLE "BusinessSettings" ADD CONSTRAINT "BusinessSettings_maxUsers_positive" CHECK ("maxUsers" >= 1);

-- El logo nunca queda a medias: imagen y tipo van juntos.
ALTER TABLE "BusinessSettings" ADD CONSTRAINT "BusinessSettings_logo_complete"
  CHECK (("logoData" IS NULL) = ("logoMimeType" IS NULL));

-- CreateTable: preferencias de apariencia, aparte de los datos de acceso.
CREATE TABLE "UserPreferences" (
    "userId" UUID NOT NULL,
    "accentColor" "AccentColor" NOT NULL DEFAULT 'AZUL',
    "fontScale" "FontScale" NOT NULL DEFAULT 'NORMAL',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserPreferences_pkey" PRIMARY KEY ("userId")
);

-- AddForeignKey: al borrar un usuario se borran sus preferencias.
ALTER TABLE "UserPreferences" ADD CONSTRAINT "UserPreferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
