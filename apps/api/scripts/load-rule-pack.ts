import { readFileSync } from 'fs';
import { PrismaClient } from '@prisma/client';
import { loadRuleSets, type RuleFileSet } from '../src/statutory/load-rule-file';

// Loads any reviewed rule pack file (for example src/statutory/packs/in-run.json) through the console's two-person flow:
//   npx ts-node scripts/load-rule-pack.ts <pack file> <drafter staff email> <publisher staff email>
// Sets already loaded are skipped; the publisher is never the drafter (also refused by the database).
const [file, drafterEmail, publisherEmail] = process.argv.slice(2);
if (!file || !drafterEmail || !publisherEmail || drafterEmail === publisherEmail) {
  console.error('Usage: load-rule-pack.ts <pack file> <drafter staff email> <publisher staff email> (two different people)');
  process.exit(1);
}
const prisma = new PrismaClient();
(async () => {
  const sets = (JSON.parse(readFileSync(file, 'utf8')) as { ruleSets: RuleFileSet[] }).ruleSets;
  const out = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.is_super_admin', 'on', true)`;
    const staff = async (email: string) => (await tx.user.findFirstOrThrow({ where: { email, organizationId: null, role: 'super_admin' }, select: { id: true } })).id;
    return loadRuleSets(tx, sets, await staff(drafterEmail), await staff(publisherEmail));
  });
  console.log(`published: ${out.published.join(', ') || 'none'}; already there: ${out.skipped.join(', ') || 'none'}`);
})().finally(() => prisma.$disconnect());
