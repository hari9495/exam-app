export interface HealthDeps {
  checkDb: () => Promise<unknown>;
  checkRedis: () => Promise<unknown>;
  now?: () => number;
  cacheMs?: number;
  timeoutMs?: number;
}

// Liveness for external uptime monitoring. Deliberately NOT run through
// TenantPrismaService.forTenant: this is not tenant-scoped work, and forTenant would consume
// a pooled connection from the pool that is already the concurrency ceiling.
export class HealthService {
  private readonly now: () => number;
  private readonly cacheMs: number;
  private readonly timeoutMs: number;
  private cached: { at: number; ok: boolean } | null = null;

  constructor(private readonly deps: HealthDeps) {
    this.now = deps.now ?? (() => Date.now());
    this.cacheMs = deps.cacheMs ?? 10_000;
    this.timeoutMs = deps.timeoutMs ?? 2_000;
  }

  async check(): Promise<boolean> {
    const cached = this.cached;
    if (cached && this.now() - cached.at < this.cacheMs) return cached.ok;
    const ok = await this.run();
    this.cached = { at: this.now(), ok };
    return ok;
  }

  private async run(): Promise<boolean> {
    const results = await Promise.all([
      this.settle(this.deps.checkDb),
      this.settle(this.deps.checkRedis),
    ]);
    return results.every(Boolean);
  }

  // A hung dependency must fail the check rather than hang it -- otherwise the monitor times
  // out with no signal and the request holds a connection open the whole time.
  private async settle(check: () => Promise<unknown>): Promise<boolean> {
    let timer: NodeJS.Timeout | undefined;
    try {
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('health check timed out')), this.timeoutMs);
      });
      await Promise.race([check(), timeout]);
      return true;
    } catch {
      return false;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}
