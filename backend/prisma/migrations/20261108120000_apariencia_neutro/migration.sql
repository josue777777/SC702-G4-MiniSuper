-- Diseño neutro del sistema: nueva opción de color, la predeterminada.
-- (Un valor nuevo de un enum no se puede usar en la misma migración que lo crea.)
ALTER TYPE "AccentColor" ADD VALUE 'NEUTRO' BEFORE 'AZUL';
