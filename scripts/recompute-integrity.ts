/**
 * One-off: recompute every submitted attempt's integrity analysis under the calibrated rules.
 *
 * Sequential on purpose. Each analyze() opens three forTenant transactions against a pool of
 * 15, so firing 265 concurrently would exhaust it and start returning server_busy to live
 * traffic. A serial loop takes minutes and costs nothing.
 *
 * Idempotent: analyze() upserts on attemptId and has no "already analysed" guard, so this is
 * safe to re-run -- which matters because the VM drops SSH for minutes at a time under disk
 * load and the run may need resuming.
 *
 * preserveNarrative keeps the recruiter-facing explanation. Without it, the AI call fails on a
 * box with no key configured and every flagged attempt's narrative is written as null.
 *
 * Usage on the VM:  cd ~/app && npx ts-node scripts/recompute-integrity.ts
 */
import { NestFactory } from '@nestjs/core';
import { TenantPrismaService } from '@exam-platform/shared';
import { AppModule } from '../apps/exam-runtime/src/app.module';
import { IntegrityAnalysisService } from '../apps/exam-runtime/src/integrity/integrity-analysis.service';

const SUPER_ADMIN = { organizationId: null, isSuperAdmin: true };

type Row = { attempt_id: string; level: string | null; analyzed_at: Date; narrative: string | null };

async function snapshot(tenantPrisma: TenantPrismaService): Promise<Row[]> {
  return tenantPrisma.forTenant(SUPER_ADMIN, (tx) =>
    tx.$queryRawUnsafe<Row[]>(
      'SELECT ia.attempt_id, ia.level, ia.analyzed_at, ia.narrative FROM integrity_analyses ia ' +
        'JOIN attempts a ON a.id = ia.attempt_id WHERE a.submitted_at IS NOT NULL',
    ),
  );
}

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['warn', 'error'] });
  const analysis = app.get(IntegrityAnalysisService);
  const tenantPrisma = app.get(TenantPrismaService);

  const before = await snapshot(tenantPrisma);
  console.log(`recomputing ${before.length} analyses`);

  const previous = new Map(before.map((r) => [r.attempt_id, r]));

  // The failure detector. analyze() catches its own errors and logs rather than throwing, so a
  // try/catch here would report zero failures whatever happened. A FAILED attempt leaves its row
  // completely untouched -- same level, same analyzed_at -- so the only reliable evidence of
  // success is that analyzed_at advanced. Every successful update sets `analyzedAt: new Date()`
  // from THIS process's clock, which is why comparing against a locally-taken timestamp is safe
  // and no app-vs-database clock skew is involved.
  const startedAt = new Date();

  let done = 0;
  for (const row of before) {
    await analysis.analyze(row.attempt_id, { preserveNarrative: true });
    done += 1;
    if (done % 25 === 0) console.log(`  ${done}/${before.length}`);
  }

  const after = await snapshot(tenantPrisma);
  // Scope to the attempts we actually processed. Live traffic can submit and analyse a new
  // attempt while this runs; counting it would pollute the totals with work we did not do.
  const processed = after.filter((r) => previous.has(r.attempt_id));

  const matrix: Record<string, number> = {};
  for (const row of processed) {
    const key = `${previous.get(row.attempt_id)!.level ?? 'none'} -> ${row.level ?? 'none'}`;
    matrix[key] = (matrix[key] ?? 0) + 1;
  }

  const high = processed.filter((r) => r.level === 'high_concern').length;
  const stale = processed.filter((r) => r.analyzed_at <= startedAt);
  // updateCounterparts() nulls a counterpart's narrative when it adds a similarity flag, and
  // preserveNarrative does not cover that path. It should not fire on a re-run -- the flags are
  // already present, so its alreadyPresent guard short-circuits -- but "should not" is not
  // "cannot", so count it rather than assume.
  const narrativeLost = processed.filter(
    (r) => r.narrative === null && previous.get(r.attempt_id)!.narrative !== null,
  );

  console.log(`TRANSITIONS ${JSON.stringify(matrix)}`);
  console.log(`NEW_HIGH_CONCERN ${high} of ${processed.length} (${Math.round((high / processed.length) * 100)}%)`);
  console.log(`FAILED ${stale.length}${stale.length ? ' -- ' + stale.slice(0, 10).map((r) => r.attempt_id).join(',') : ''}`);
  console.log(`NARRATIVE_LOST ${narrativeLost.length}`);
  if (stale.length || narrativeLost.length) {
    console.log('CHECK ~/.pm2/logs/exam-runtime-error.log for the reason before trusting these numbers');
  }

  await app.close();
  // AppModule opens Redis clients (throttler storage, health check) that app.close() does not
  // quit, so ioredis keeps the event loop alive and the process would hang here after doing all
  // its work. Exit explicitly rather than leave an operator staring at a finished-looking run.
  process.exit(stale.length ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
