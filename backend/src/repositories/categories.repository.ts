import { prisma } from '../config/prisma.js';
import { Prisma } from '../generated/prisma/client.js';
import type { CategoryDto, CategoryWritableFields } from '../types/categories.js';

const categorySelection = { id: true, name: true, description: true, isActive: true } as const;

/**
 * Capa de acceso a datos del módulo de categorías (HU-04), atada a UN negocio:
 * todas sus consultas filtran por `businessId` (multi-negocio, ADR 0002).
 *
 * Sin miembros privados a propósito: el service se prueba con un repositorio
 * falso que `implements CategoriesRepository`.
 */
export class CategoriesRepository {
  constructor(readonly businessId: string) {}

  /** Todas las categorías, activas e inactivas: el nombre es único entre ambas. */
  async list(): Promise<CategoryDto[]> {
    return prisma.category.findMany({
      where: { businessId: this.businessId },
      select: categorySelection,
      orderBy: { name: 'asc' },
    });
  }

  /** `true` si ya hay una categoría con ese nombre, sin distinguir mayúsculas. */
  async existsByName(name: string): Promise<boolean> {
    const found = await prisma.category.findFirst({
      where: { businessId: this.businessId, name: { equals: name, mode: 'insensitive' } },
      select: { id: true },
    });

    return found !== null;
  }

  /**
   * Crea la categoría, o devuelve `null` si otra petición concurrente se
   * adelantó con el mismo nombre (violación de `@unique`, error P2002).
   */
  async create(fields: CategoryWritableFields): Promise<CategoryDto | null> {
    try {
      return await prisma.category.create({
        data: { ...fields, businessId: this.businessId },
        select: categorySelection,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return null;
      }

      throw error;
    }
  }
}
