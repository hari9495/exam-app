import { readFileSync, writeFileSync } from 'fs';
import { basename, join } from 'path';
import { PrismaClient } from '@prisma/client';
import { rootEntry, rootsRuleSet } from '../src/documents/cca-roots';
import { loadRuleSets } from '../src/statutory/load-rule-file';

// India CCA roots (decision 5b-D3). Download the root certificates from https://cca.gov.in/root_certificate.html (DER,
// PEM or bare base64 are all read), compare each SHA-256 fingerprint printed here with the CCA's, then either:
//   write the reviewed list into the pack:   npx ts-node scripts/load-cca-roots.ts --write <version> <from> <files...>
//   publish it with two staff (console flow): npx ts-node scripts/load-cca-roots.ts <drafter email> <publisher email>
const PACK = join(__dirname, '..', 'src', 'statutory', 'packs', 'in-cca-roots.json');
const args = process.argv.slice(2);
(async () => {
  if (args[0] === '--write') {
    const [, version, validFrom, ...files] = args;
    const roots = files.map((f) => rootEntry(readFileSync(f), `https://cca.gov.in/cca/sites/default/files/files/${basename(f)}`));
    for (const r of roots) console.log(`${r.name}  valid to ${r.notAfter}  SHA-256 ${r.sha256}`);
    writeFileSync(PACK, JSON.stringify({ ruleSets: [rootsRuleSet(roots, validFrom, version)] }, null, 2) + '\n');
    return;
  }
  const [drafterEmail, publisherEmail] = args;
  if (!drafterEmail || !publisherEmail || drafterEmail === publisherEmail) throw new Error('Usage: load-cca-roots.ts <drafter email> <publisher email> (two different people)');
  const prisma = new PrismaClient();
  try {
    const { ruleSets } = JSON.parse(readFileSync(PACK, 'utf8'));
    const out = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.is_super_admin', 'on', true)`;
      const staff = async (email: string) => (await tx.user.findFirstOrThrow({ where: { email, organizationId: null, role: 'super_admin' }, select: { id: true } })).id;
      return loadRuleSets(tx, ruleSets, await staff(drafterEmail), await staff(publisherEmail));
    });
    console.log(`published: ${out.published.join(', ') || 'none'}; already there: ${out.skipped.join(', ') || 'none'}`);
  } finally {
    await prisma.$disconnect();
  }
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
