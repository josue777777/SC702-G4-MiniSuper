-- Ajustes varios de la plataforma: las solicitudes de ampliación del plan
-- registran solo la cantidad de usuarios adicionales.
ALTER TABLE "PlatformSettings" DROP COLUMN "pricePerExtraUser";
ALTER TABLE "PlanRequest" DROP COLUMN "monthlyAmount";
