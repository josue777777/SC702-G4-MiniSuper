-- Datos del negocio (Configuración › General): una sola fila.
CREATE TABLE "BusinessSettings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "name" TEXT NOT NULL,
    "legalId" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "receiptMessage" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BusinessSettings_pkey" PRIMARY KEY ("id"),
    -- La base garantiza que nunca haya una segunda fila.
    CONSTRAINT "BusinessSettings_single_row" CHECK ("id" = 1)
);

-- Valores con los que el sistema ya funcionaba: nada cambia hasta que el
-- administrador los edite.
INSERT INTO "BusinessSettings" ("id", "name", "receiptMessage", "updatedAt")
VALUES (1, 'Abastecedor Nuevo Amanecer', '¡Gracias por su compra!', CURRENT_TIMESTAMP);
