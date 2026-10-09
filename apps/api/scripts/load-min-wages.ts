import { readFileSync } from 'fs';
import { join } from 'path';
import { PrismaClient } from '@prisma/client';
import { loadRuleSets, type RuleFileSet } from '../src/statutory/load-rule-file';

// Loads the reviewed state minimum-wage tables (src/statutory/packs/in-min-wages.json) through the two-person console
// flow: npx ts-node scripts/load-min-wages.ts <drafter staff email> <publisher staff email>. Sets already loaded are skipped.
const [drafterEmail, publisherEmail] = process.argv.slice(2);
if (!drafterEmail || !publisherEmail || drafterEmail === publisherEmail) {
  console.error('Usage: load-min-wages.ts <drafter staff email> <publisher staff email> (two different people)');
  process.exit(1);
}
const prisma = new PrismaClient();
(async () => {
  const sets = (JSON.parse(readFileSync(join(__dirname, '..', 'src', 'statutory', 'packs', 'in-min-wages.json'), 'utf8')) as { ruleSets: RuleFileSet[] }).ruleSets;
  const result = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.is_super_admin', 'on', true)`;
    const staff = async (email: string) => (await tx.user.findFirstOrThrow({ where: { email, organizationId: null, role: 'super_admin' }, select: { id: true } })).id;
    return loadRuleSets(tx, sets, await staff(drafterEmail), await staff(publisherEmail));
  });
  console.log(`published: ${result.published.join(', ') || 'none'}; already there: ${result.skipped.join(', ') || 'none'}`);
})().finally(() => prisma.$disconnect());
