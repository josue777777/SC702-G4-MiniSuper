import { prisma } from '../config/prisma.js';

/**
 * Usuarios ya tomados que empiezan con `base` (`jnavarro`, `jnavarro2`…), de
 * cualquier negocio y aunque estén desactivados: un usuario nunca se reutiliza,
 * para que el historial no se confunda de persona. Con esto se calcula el
 * primero libre (`utils/username.ts`). La unicidad real la garantiza el índice
 * único de la base.
 */
export async function takenUsernames(base: string): Promise<string[]> {
  const rows = await prisma.user.findMany({
    where: { username: { startsWith: base } },
    select: { username: true },
  });

  return rows.map((row) => row.username);
}
