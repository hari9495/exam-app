import { Prisma } from '@prisma/client';
import { checkShape, runGolden, type GoldenCase, type RuleSet } from './evaluator';

// Loads rule sets from a reviewed data file through the console's own flow (PAY-2.01): one YukthiX staff member drafts,
// a second publishes, after the shape checks and every golden case pass. The database refuses a publisher who drafted
// it. Used by the seed and scripts/load-min-wages.ts; the transaction must run as platform staff (app.is_super_admin).

export interface RuleFileSet extends Omit<RuleSet, 'validTo'> {
  validTo: string | null;
  lawVersion: string;
  source: string;
  golden: GoldenCase[];
}

export async function loadRuleSets(tx: Prisma.TransactionClient, sets: RuleFileSet[], drafter: string, publisher: string): Promise<{ published: string[]; skipped: string[] }> {
  if (drafter === publisher) throw new Error('Someone other than the drafter publishes a rule set.');
  const published: string[] = [];
  const skipped: string[] = [];
  for (const s of sets) {
    const name = `${s.statute} ${s.jurisdiction} ${s.version}`;
    if (await tx.statutoryRuleSet.findFirst({ where: { statute: s.statute, jurisdiction: s.jurisdiction, version: s.version }, select: { id: true } })) {
      skipped.push(name);
      continue;
    }
    const problems = [...checkShape(s), ...s.golden.flatMap((g) => runGolden(s, g))];
    if (problems.length) throw new Error(`${name} does not pass its checks: ${problems.join('; ')}`);
    const [{ id }] = await tx.$queryRaw<{ id: string }[]>`SELECT statutory_save_draft(${s.statute}, ${s.jurisdiction}, ${s.version}, ${s.validFrom}::date, ${s.validTo}::date, ${JSON.stringify(s.values)}::jsonb, ${s.source}, ${s.lawVersion}, ${s.verify}, ${JSON.stringify(s.golden)}::jsonb, ${drafter}::uuid) AS id`;
    await tx.$executeRaw`SELECT statutory_publish(${id}::uuid, ${publisher}::uuid)`;
    published.push(name);
  }
  return { published, skipped };
}
