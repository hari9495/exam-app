import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { audit } from '../org-structure/org-structure.service';
import { checkShape, runGolden, type GoldenCase, type RuleSet } from './evaluator';

// P07 rule store access (PAY-2.01): the published rule sets for the engines (read through the app role, which sees
// only published ones), and the YukthiX console's draft → publish with maker ≠ checker. Publishing runs the shape
// checks and every golden case first (YX-STAT-04); the database refuses a publisher who drafted it.

const SUPER: TenantContext = { organizationId: null, isSuperAdmin: true };
const iso = (d: Date) => d.toISOString().slice(0, 10);
const CACHE_MS = 5 * 60_000;

export interface DraftInput {
  statute: string;
  jurisdiction: string;
  version: string;
  validFrom: string;
  validTo?: string | null;
  values: Record<string, unknown> & { kind: string };
  source: string;
  lawVersion: string;
  verify: boolean;
  golden: GoldenCase[];
}

@Injectable()
export class StatutoryRulesService {
  private cache: { at: number; sets: RuleSet[] } | null = null;

  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  /** Every published rule set (5 minutes cached; a publish clears it). */
  async published(): Promise<RuleSet[]> {
    if (this.cache && Date.now() - this.cache.at < CACHE_MS) return this.cache.sets;
    const rows = await this.tenantPrisma.forTenant({ organizationId: null, isSuperAdmin: false }, (tx) => tx.statutoryRuleSet.findMany({ where: { status: 'published' } }));
    const sets = rows.map((r) => ({ statute: r.statute, jurisdiction: r.jurisdiction, version: r.version, validFrom: iso(r.validFrom), validTo: r.validTo ? iso(r.validTo) : null, verify: r.verify, values: r.values as RuleSet['values'] }));
    this.cache = { at: Date.now(), sets };
    return sets;
  }

  /** The console list: every version with its status, drafter and reviewer (YukthiX staff). */
  async list() {
    return this.tenantPrisma.forTenant(SUPER, async (tx) => {
      const rows = await tx.statutoryRuleSet.findMany({ orderBy: [{ statute: 'asc' }, { jurisdiction: 'asc' }, { validFrom: 'desc' }] });
      const golden = await tx.statutoryGoldenCase.groupBy({ by: ['ruleSetId'], _count: { _all: true } });
      return rows.map((r) => ({ id: r.id, statute: r.statute, jurisdiction: r.jurisdiction, version: r.version, validFrom: iso(r.validFrom), validTo: r.validTo ? iso(r.validTo) : null, status: r.status, lawVersion: r.lawVersion, verify: r.verify, draftedBy: r.draftedBy, reviewedBy: r.reviewedBy, publishedAt: r.publishedAt, golden: golden.find((g) => g.ruleSetId === r.id)?._count._all ?? 0 }));
    });
  }

  /** A staff member drafts a new version (the shape is checked now too, so problems show early). */
  async draft(userId: string, d: DraftInput) {
    const problems = checkShape(d as unknown as RuleSet, await this.limits());
    if (problems.length) throw new BadRequestException({ statusCode: 400, code: 'RULE_SHAPE', message: `Fix these first: ${problems.join('; ')}.`, problems });
    try {
      return await this.tenantPrisma.forTenant(SUPER, async (tx) => {
        const [{ id }] = await tx.$queryRaw<{ id: string }[]>`SELECT statutory_save_draft(${d.statute}, ${d.jurisdiction}, ${d.version}, ${d.validFrom}::date, ${d.validTo ?? null}::date, ${JSON.stringify(d.values)}::jsonb, ${d.source}, ${d.lawVersion}, ${d.verify}, ${JSON.stringify(d.golden)}::jsonb, ${userId}::uuid) AS id`;
        await audit(tx, { organizationId: null, isSuperAdmin: true } as never, 'platform.statutory.drafted', 'statutory_rule_set', id, { statute: d.statute, jurisdiction: d.jurisdiction, version: d.version });
        return { id };
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && /statutory_rule_sets_version_key|duplicate key/.test(e.message)) throw new ConflictException('That version already exists. Use a new version name.');
      throw e;
    }
  }

  private async limits() {
    const lim = (await this.published()).find((s) => s.values.kind === 'pt_limit');
    return { ptAnnualMax: lim ? String(lim.values.annualMax) : undefined };
  }

  /** A second staff member publishes it: shape checks and golden cases must pass; never the drafter (database). */
  async publish(userId: string, id: string) {
    return this.tenantPrisma.forTenant(SUPER, async (tx) => {
      const r = await tx.statutoryRuleSet.findUnique({ where: { id } });
      if (!r) throw new NotFoundException('No such rule set.');
      if (r.draftedBy === userId) throw new ForbiddenException('Someone other than the person who drafted it must publish it.');
      const rs: RuleSet = { statute: r.statute, jurisdiction: r.jurisdiction, version: r.version, validFrom: iso(r.validFrom), validTo: r.validTo ? iso(r.validTo) : null, verify: r.verify, values: r.values as RuleSet['values'] };
      const problems = checkShape(rs, await this.limits());
      const golden = await tx.statutoryGoldenCase.findMany({ where: { ruleSetId: id } });
      const failures = golden.flatMap((g) => runGolden(rs, { name: g.name, fn: g.fn, input: g.input as Record<string, unknown>, expected: g.expected as Record<string, unknown> }));
      if (problems.length || failures.length) throw new BadRequestException({ statusCode: 400, code: 'RULE_CHECKS_FAILED', message: 'The rule set does not pass its checks.', problems, failures });
      try {
        await tx.$executeRaw`SELECT statutory_publish(${id}::uuid, ${userId}::uuid)`;
      } catch (e) {
        if (/YX_MAKER_CHECKER/.test((e as Error).message)) throw new ForbiddenException('Someone other than the person who drafted it must publish it.');
        throw new ConflictException((e as Error).message.split('\n').pop()?.slice(0, 200) ?? 'Not published.');
      }
      await audit(tx, { organizationId: null, isSuperAdmin: true } as never, 'platform.statutory.published', 'statutory_rule_set', id, { statute: r.statute, jurisdiction: r.jurisdiction, version: r.version, golden: golden.length });
      this.cache = null;
      return { id, status: 'published' };
    });
  }
}
