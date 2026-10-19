/**
 * Limita los intentos fallidos de login por clave (IP) en una ventana de tiempo.
 * Es en memoria: suficiente para un negocio con un solo servidor y un solo dueño.
 */
export class LoginRateLimiter {
  private readonly failures = new Map<string, number[]>();

  constructor(
    private readonly maxFailures = 8,
    private readonly windowMs = 15 * 60 * 1000,
  ) {}

  isBlocked(key: string, now = Date.now()): boolean {
    return this.recent(key, now).length >= this.maxFailures;
  }

  recordFailure(key: string, now = Date.now()): void {
    this.failures.set(key, [...this.recent(key, now), now]);
  }

  reset(key: string): void {
    this.failures.delete(key);
  }

  private recent(key: string, now: number): number[] {
    return (this.failures.get(key) ?? []).filter((at) => now - at < this.windowMs);
  }
}
