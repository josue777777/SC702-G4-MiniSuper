import type { PreferencesRepository } from '../repositories/preferences.repository.js';
import { DEFAULT_PREFERENCES, type PreferencesDto } from '../types/preferences.js';

/** Doble del repositorio de apariencia (sin base de datos). */
export class FakePreferencesRepository implements PreferencesRepository {
  readonly saved = new Map<string, PreferencesDto>();

  get(userId: string): Promise<PreferencesDto> {
    return Promise.resolve(this.saved.get(userId) ?? DEFAULT_PREFERENCES);
  }

  save(userId: string, preferences: PreferencesDto): Promise<PreferencesDto> {
    this.saved.set(userId, { ...preferences });

    return this.get(userId);
  }
}
