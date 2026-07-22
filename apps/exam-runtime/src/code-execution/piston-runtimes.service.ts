import { Injectable, Logger } from '@nestjs/common';
import { PistonClient } from './piston-client';

export interface PistonLanguage {
  language: string;
  version: string;
}

function compareVersions(a: string, b: string): number {
  const partsA = a.split('.').map((part) => parseInt(part, 10) || 0);
  const partsB = b.split('.').map((part) => parseInt(part, 10) || 0);
  const length = Math.max(partsA.length, partsB.length);
  for (let i = 0; i < length; i++) {
    const diff = (partsA[i] ?? 0) - (partsB[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

@Injectable()
export class PistonRuntimesService {
  private readonly logger = new Logger(PistonRuntimesService.name);
  private cache: PistonLanguage[] | null = null;
  private cachedAt = 0;
  private readonly ttlMs = 60 * 60 * 1000;

  constructor(private readonly pistonClient: PistonClient) {}

  async getAvailableLanguages(): Promise<PistonLanguage[]> {
    const now = Date.now();
    if (this.cache && now - this.cachedAt < this.ttlMs) {
      return this.cache;
    }
    try {
      const runtimes = await this.pistonClient.listRuntimes();
      const byLanguage = new Map<string, PistonLanguage>();
      for (const runtime of runtimes) {
        const existing = byLanguage.get(runtime.language);
        if (!existing || compareVersions(runtime.version, existing.version) > 0) {
          byLanguage.set(runtime.language, { language: runtime.language, version: runtime.version });
        }
      }
      this.cache = [...byLanguage.values()];
      this.cachedAt = now;
      return this.cache;
    } catch (error) {
      if (this.cache) {
        this.logger.warn(`Failed to refresh Piston runtime list, serving stale cache: ${(error as Error).message}`);
        return this.cache;
      }
      throw error;
    }
  }

  async resolveLanguage(language: string): Promise<PistonLanguage | null> {
    const languages = await this.getAvailableLanguages();
    return languages.find((entry) => entry.language === language) ?? null;
  }
}
