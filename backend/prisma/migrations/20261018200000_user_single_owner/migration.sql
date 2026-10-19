-- HU-12: cuenta única del dueño, garantizada por la base de datos.
-- `isOwner` vale siempre true y es único: una segunda fila de User viola el
-- índice, incluso si dos peticiones de configuración inicial llegan a la vez.
-- Seguro con datos existentes: ningún flujo crea usuarios antes de HU-12, así
-- que User está vacía; con una sola fila existente el índice tampoco falla.

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "isOwner" BOOLEAN NOT NULL DEFAULT true;

-- CreateIndex
CREATE UNIQUE INDEX "User_isOwner_key" ON "User"("isOwner");
