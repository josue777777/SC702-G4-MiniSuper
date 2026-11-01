-- Ajustes varios en control de acceso: registro de seguridad de las cuentas
-- (quién cambió o restableció una contraseña y cuándo).

-- CreateEnum
CREATE TYPE "AccessEventType" AS ENUM ('PASSWORD_RECOVERED_BY_EMAIL', 'PASSWORD_RESET_BY_MANAGER', 'PASSWORD_CHANGED');

-- CreateTable
CREATE TABLE "AccessEvent" (
    "id" UUID NOT NULL,
    "businessId" UUID,
    "userId" UUID NOT NULL,
    "actorId" UUID,
    "type" "AccessEventType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccessEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AccessEvent_businessId_createdAt_idx" ON "AccessEvent"("businessId", "createdAt");

-- CreateIndex
CREATE INDEX "AccessEvent_userId_createdAt_idx" ON "AccessEvent"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "AccessEvent" ADD CONSTRAINT "AccessEvent_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessEvent" ADD CONSTRAINT "AccessEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessEvent" ADD CONSTRAINT "AccessEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
