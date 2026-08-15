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

type Row = { attempt_id: string; level: string | null };

async function snapshot(tenantPrisma: TenantPrismaService): Promise<Row[]> {
  return tenantPrisma.forTenant(SUPER_ADMIN, (tx) =>
    tx.$queryRawUnsafe<Row[]>(
      'SELECT ia.attempt_id, ia.level FROM integrity_analyses ia ' +
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

  const previous = new Map(before.map((r) => [r.attempt_id, r.level]));
  let done = 0;
  for (const row of before) {
    // analyze() catches its own errors and logs rather than throwing, so a try/catch here would
    // report zero failures whatever happened. Failures are detected from the second snapshot
    // instead -- see NULL_LEVEL below -- and the reason is in the exam-runtime log.
    await analysis.analyze(row.attempt_id, { preserveNarrative: true });
    done += 1;
    if (done % 25 === 0) console.log(`  ${done}/${before.length}`);
  }

  const after = await snapshot(tenantPrisma);
  const matrix: Record<string, number> = {};
  for (const row of after) {
    const key = `${previous.get(row.attempt_id) ?? 'none'} -> ${row.level ?? 'none'}`;
    matrix[key] = (matrix[key] ?? 0) + 1;
  }
  const high = after.filter((r) => r.level === 'high_concern').length;
  const nulls = after.filter((r) => r.level === null).length;

  console.log(`TRANSITIONS ${JSON.stringify(matrix)}`);
  console.log(`NEW_HIGH_CONCERN ${high} of ${after.length} (${Math.round((high / after.length) * 100)}%)`);
  console.log(`NULL_LEVEL ${nulls}`);
  await app.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
