import { Prisma } from '@prisma/client';

// Assessments AS-4a (PRC-26): the company settings the runner reads (Settings 6.5 defaults). The same keys, values and
// defaults as the API's settings registry (apps/api/src/org-structure/settings-registry.ts); the exam-runtime e2e
// checks they match, so a change there must be made here too.
export const RUNNER_SETTINGS = {
  'asmt.offline_minutes': { values: ['0', '2', '5', '10', '15', '20', '30'], default: '5' },
  'asmt.time_credit_cap': { values: ['0', '5', '10', '15', '20', '30'], default: '10' },
  // AS-3 (answer 2013): months an earlier result may be used again (0: never).
  'asmt.result_reuse_months': { values: ['0', '3', '6', '12'], default: '6' },
} as const;
export type RunnerSettingKey = keyof typeof RUNNER_SETTINGS;

/** The company's value (company scope, in force now), or the default when unset or not one of the allowed values. */
export async function runnerSetting(tx: Prisma.TransactionClient, organizationId: string, key: RunnerSettingKey): Promise<number> {
  const def = RUNNER_SETTINGS[key];
  const row = await tx.setting.findFirst({ where: { organizationId, key, scopeType: 'tenant', scopeId: organizationId, validFrom: null }, select: { value: true } });
  const v = row ? String(row.value) : def.default;
  return Number((def.values as readonly string[]).includes(v) ? v : def.default);
}

/** The client checks in at least every 30 seconds; a longer silence beyond this grace is time lost to the connection. */
export const HEARTBEAT_GRACE_MS = 45_000;

/** AS-4a: the time to give back for a gap in the connection, within what is left of the cap. */
export function offlineCreditMs(gapMs: number, capMinutes: number, usedMs: number): number {
  return Math.max(0, Math.min(gapMs - HEARTBEAT_GRACE_MS, capMinutes * 60_000 - usedMs));
}

/** AS-4b (answer 2011): the part of a gap the cap did not cover (after the grace), which a person may approve. */
export function overCapMs(gapMs: number, creditedMs: number): number {
  return Math.max(0, gapMs - HEARTBEAT_GRACE_MS - creditedMs);
}

/**
 * AS-4b (PRC-10): adds lost time above the cap to the attempt's open request (one per attempt), or opens one, in one
 * statement on the open-row index, so two writers at once add both (the company is filled by the database).
 */
export async function recordOverCap(tx: Prisma.TransactionClient, attemptId: string, ms: number, now: Date): Promise<void> {
  await tx.$executeRaw`INSERT INTO "connectivity_credits" ("attempt_id", "lost_ms", "updated_at") VALUES (${attemptId}::uuid, ${ms}, ${now})
    ON CONFLICT ("attempt_id") WHERE "status" = 'pending'
    DO UPDATE SET "lost_ms" = "connectivity_credits"."lost_ms" + EXCLUDED."lost_ms", "updated_at" = EXCLUDED."updated_at"`;
}
