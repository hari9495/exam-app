import { readFileSync } from 'fs';
import { join } from 'path';

// Writes the SQL that loads a statutory pack (src/statutory/packs/<pack>.json) into a migration:
//   npx ts-node scripts/statutory-pack-sql.ts in > /tmp/pack.sql
// A later version only (no crosswalk): name each rule set as statute/jurisdiction/version after the pack, for example
//   npx ts-node scripts/statutory-pack-sql.ts in IN.PT/IN-WB/2026-v2 IN.PT/IN-WB/2014-v1
// The JSON is the source of truth; evaluator.spec.ts checks the migration carries every rule set of it.

const q = (s: string | null | undefined) => (s === null || s === undefined ? 'NULL' : `'${s.replace(/'/g, "''")}'`);
const pack = JSON.parse(readFileSync(join(__dirname, '..', 'src', 'statutory', 'packs', `${process.argv[2] ?? 'in'}.json`), 'utf8'));
const only = process.argv.slice(3);
const missing = only.filter((k) => !pack.ruleSets.some((r: { statute: string; jurisdiction: string; version: string }) => `${r.statute}/${r.jurisdiction}/${r.version}` === k));
if (missing.length) throw new Error(`Not in the pack: ${missing.join(', ')}`);
const lines: string[] = [];
for (const rs of pack.ruleSets.filter((r: { statute: string; jurisdiction: string; version: string }) => !only.length || only.includes(`${r.statute}/${r.jurisdiction}/${r.version}`))) {
  lines.push(
    `INSERT INTO "statutory_rule_sets" ("statute", "jurisdiction", "version", "valid_from", "valid_to", "values", "source", "verify", "status", "law_version", "published_at") VALUES (${q(rs.statute)}, ${q(rs.jurisdiction)}, ${q(rs.version)}, ${q(rs.validFrom)}, ${q(rs.validTo)}, ${q(JSON.stringify(rs.values))}, ${q(rs.source)}, ${rs.verify ? 'true' : 'false'}, 'published', ${q(rs.lawVersion)}, CURRENT_TIMESTAMP);`,
  );
  for (const g of rs.golden)
    lines.push(
      `INSERT INTO "statutory_golden_cases" ("rule_set_id", "name", "fn", "input", "expected") SELECT "id", ${q(g.name)}, ${q(g.fn)}, ${q(JSON.stringify(g.input))}, ${q(JSON.stringify(g.expected))} FROM "statutory_rule_sets" WHERE "statute" = ${q(rs.statute)} AND "jurisdiction" = ${q(rs.jurisdiction)} AND "version" = ${q(rs.version)};`,
    );
}
if (!only.length) for (const c of pack.crosswalk) lines.push(`INSERT INTO "statutory_law_crosswalk" ("subject_key", "law_version", "section", "form") VALUES (${q(c.subjectKey)}, ${q(c.lawVersion)}, ${q(c.section)}, ${q(c.form)});`);
process.stdout.write(`${lines.join('\n')}\n`);
