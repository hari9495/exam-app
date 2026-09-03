export type BillingDimension = 'seats' | 'candidates' | 'ai_credits' | 'proctoring_minutes';

export const HARD_DIMENSIONS = ['ai_credits', 'proctoring_minutes'] as const;
export const SOFT_DIMENSIONS = ['seats', 'candidates'] as const;

// First instant of the current calendar month, in UTC. The billing "reset" is implicit:
// consumption aggregates filter on occurredAt/submittedAt >= this value, so the window moves.
export function currentPeriodStart(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
}

export function usageRatio(used: number, limit: number): number {
  if (limit <= 0) return used > 0 ? Infinity : 0;
  return used / limit;
}

export function isOverLimit(used: number, limit: number): boolean {
  return used >= limit;
}

export function warnThreshold(ratio: number): 80 | 100 | null {
  if (ratio >= 1) return 100;
  if (ratio >= 0.8) return 80;
  return null;
}
