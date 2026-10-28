import { prisma } from '../config/prisma.js';
import { DEFAULT_PREFERENCES, type PreferencesDto } from '../types/preferences.js';

const selection = { accentColor: true, fontScale: true } as const;

/** Capa de acceso a datos de la apariencia de cada usuario (tabla `UserPreferences`). */
export class PreferencesRepository {
  /** Las del usuario, o las de fábrica si nunca eligió nada (no hay fila). */
  async get(userId: string): Promise<PreferencesDto> {
    return (
      (await prisma.userPreferences.findUnique({ where: { userId }, select: selection })) ??
      DEFAULT_PREFERENCES
    );
  }

  async save(userId: string, preferences: PreferencesDto): Promise<PreferencesDto> {
    return prisma.userPreferences.upsert({
      where: { userId },
      create: { userId, ...preferences },
      update: preferences,
      select: selection,
    });
  }
}
