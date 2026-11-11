import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { audit } from '../org-structure/org-structure.service';
import { checkShape, goldenResult, runGolden, type GoldenCase, type RuleSet } from './evaluator';
import { platformRead } from '../platform/platform.service';
import { todayIst } from '../org-structure/org-validation';

// P07 rule store access (PAY-2.01): the published rule sets for the engines (read through the app role, which sees
// only published ones), and the YukthiX console's draft → publish with maker ≠ checker. Publishing runs the shape
// checks and every golden case first (YX-STAT-04); the database refuses a publisher who drafted it.

const SUPER: TenantContext = { organizationId: null, isSuperAdmin: true };
const iso = (d: Date) => d.toISOString().slice(0, 10);
const CACHE_MS = 5 * 60_000;
/** Audit rows name the member of staff who acted. */
const staff = (userId: string) => ({ organizationId: null, isSuperAdmin: true, userId }) as never;

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
  changeNote?: string | null;
}

export type UpdateInput = Omit<DraftInput, 'statute' | 'jurisdiction' | 'version'>;
type Row = Prisma.StatutoryRuleSetGetPayload<object>;

/** Console C-1 (answer 1042): the state the console shows. "Changes requested" is a draft with a reviewer's note. */
export const ruleState = (r: Pick<Row, 'status' | 'reviewNote'>) =>
  r.status === 'in_review' ? 'in review' : r.status === 'draft' && r.reviewNote ? 'changes requested' : (r.status as 'draft' | 'published' | 'withdrawn');

/** A golden case the database can store (name, a known calculator, input and expected objects). */
function goldenProblems(golden: GoldenCase[]): string[] {
  return golden.flatMap((g, i) => {
    const ok = g && typeof g.name === 'string' && g.name.trim().length > 0 && g.name.length <= 200 && typeof g.fn === 'string' && /^[a-z_0-9]{1,30}$/.test(g.fn) && g.input && typeof g.input === 'object' && g.expected && typeof g.expected === 'object';
    return ok ? [] : [`Golden case ${i + 1} needs a name, a calculator, an input and the expected result`];
  });
}

const sentence = (s: string) => `${s[0]!.toUpperCase()}${s.slice(1)}.`;

/** The database's refusals in plain words with the right status. */
function refusal(e: unknown): never {
  const m = (e as Error).message ?? '';
  const say = (m.match(/YX_[A-Z_]+: ([^\n"]+)/)?.[1] ?? 'not done').trim();
  if (/YX_RULE_NOT_FOUND/.test(m)) throw new NotFoundException('No such rule set.');
  if (/YX_MAKER_CHECKER|YX_RULE_DRAFTER/.test(m)) throw new ForbiddenException(sentence(say));
  if (/YX_RULE_NOTE/.test(m)) throw new BadRequestException('Say what to change (at least 10 characters).');
  if (/YX_RULE_STATE/.test(m)) throw new ConflictException(sentence(say));
  throw e;
}

/** "IN" is the whole country; "IN-KA" one state (locations keep ISO 3166-2 codes). Others cannot be counted. */
export function jurisdictionPlace(j: string): { country: string } | { state: string } | null {
  if (/^[A-Z]{2}$/.test(j) && j !== 'EU') return { country: j };
  if (/^[A-Z]{2}-[A-Z0-9]{1,3}$/.test(j)) return { state: j };
  return null;
}

/** Company sizes for the impact chart (by the company's employees in the jurisdiction). */
export const SIZE_BANDS = ['Under 50', '50–200', '200–1,000', '1,000+'] as const;
export const sizeBand = (n: number) => SIZE_BANDS[n < 50 ? 0 : n < 200 ? 1 : n < 1000 ? 2 : 3];

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

  /** Rule sets published after a moment (PAY-42: suggestions made before a law change are stale). Not cached. */
  async publishedSince(since: Date) {
    const rows = await this.tenantPrisma.forTenant({ organizationId: null, isSuperAdmin: false }, (tx) => tx.statutoryRuleSet.findMany({ where: { status: 'published', publishedAt: { gt: since } }, orderBy: { publishedAt: 'asc' } }));
    return rows.map((r) => ({ statute: r.statute, jurisdiction: r.jurisdiction, version: r.version, validFrom: iso(r.validFrom), validTo: r.validTo ? iso(r.validTo) : null, publishedAt: r.publishedAt! }));
  }

  /** The console list: every version with its status, drafter and reviewer (YukthiX staff). */
  async list() {
    return this.tenantPrisma.forTenant(SUPER, async (tx) => {
      const rows = await tx.statutoryRuleSet.findMany({ orderBy: [{ statute: 'asc' }, { jurisdiction: 'asc' }, { validFrom: 'desc' }] });
      const golden = await tx.statutoryGoldenCase.groupBy({ by: ['ruleSetId'], _count: { _all: true } });
      const names = await this.staffNames(tx, rows.flatMap((r) => [r.draftedBy, r.reviewedBy]));
      return rows.map((r) => ({
        id: r.id,
        statute: r.statute,
        jurisdiction: r.jurisdiction,
        version: r.version,
        kind: String((r.values as { kind?: unknown }).kind ?? ''),
        validFrom: iso(r.validFrom),
        validTo: r.validTo ? iso(r.validTo) : null,
        status: r.status,
        state: ruleState(r),
        lawVersion: r.lawVersion,
        transitional: r.transitional,
        verify: r.verify,
        draftedBy: r.draftedBy,
        draftedByName: r.draftedBy ? (names.get(r.draftedBy) ?? 'Former staff') : 'YukthiX',
        reviewedBy: r.reviewedBy,
        reviewedByName: r.reviewedBy ? (names.get(r.reviewedBy) ?? 'Former staff') : null,
        sentForReviewAt: r.sentForReviewAt,
        publishedAt: r.publishedAt,
        changeNote: r.changeNote,
        golden: golden.find((g) => g.ruleSetId === r.id)?._count._all ?? 0,
      }));
    });
  }

  /** Staff names for the console (only staff rows: no company, the staff role). */
  private async staffNames(tx: Prisma.TransactionClient, ids: (string | null)[]) {
    const want = [...new Set(ids.filter((x): x is string => Boolean(x)))];
    if (!want.length) return new Map<string, string>();
    const rows = await tx.user.findMany({ where: { id: { in: want }, organizationId: null, role: 'super_admin' }, select: { id: true, name: true, email: true } });
    return new Map(rows.map((u) => [u.id, u.name?.trim() || u.email]));
  }

  /** One version with its values, golden cases and review (console YX-01, YX-02). */
  async get(id: string) {
    return this.tenantPrisma.forTenant(SUPER, async (tx) => {
      const r = await tx.statutoryRuleSet.findUnique({ where: { id } });
      if (!r) throw new NotFoundException('No such rule set.');
      const cases = await tx.statutoryGoldenCase.findMany({ where: { ruleSetId: id }, orderBy: { createdAt: 'asc' } });
      const names = await this.staffNames(tx, [r.draftedBy, r.reviewedBy, r.reviewNoteBy]);
      // The version it replaces: the newest published one of the same statute and jurisdiction starting before it.
      const prev = await tx.statutoryRuleSet.findFirst({ where: { statute: r.statute, jurisdiction: r.jurisdiction, status: 'published', id: { not: id }, validFrom: { lte: r.validFrom } }, orderBy: { validFrom: 'desc' } });
      const name = (u: string | null) => (u ? (names.get(u) ?? 'Former staff') : null);
      return {
        id: r.id,
        statute: r.statute,
        jurisdiction: r.jurisdiction,
        version: r.version,
        validFrom: iso(r.validFrom),
        validTo: r.validTo ? iso(r.validTo) : null,
        status: r.status,
        state: ruleState(r),
        values: r.values,
        source: r.source,
        lawVersion: r.lawVersion,
        transitional: r.transitional,
        verify: r.verify,
        changeNote: r.changeNote,
        draftedBy: r.draftedBy,
        draftedByName: name(r.draftedBy) ?? 'YukthiX',
        reviewedBy: r.reviewedBy,
        reviewedByName: name(r.reviewedBy),
        sentForReviewAt: r.sentForReviewAt,
        publishedAt: r.publishedAt,
        review: r.reviewNote ? { note: r.reviewNote, by: name(r.reviewNoteBy), at: r.reviewNoteAt } : null,
        previous: prev ? { id: prev.id, version: prev.version, validFrom: iso(prev.validFrom), values: prev.values } : null,
        golden: cases.map((g) => ({ id: g.id, name: g.name, fn: g.fn, input: g.input, expected: g.expected })),
      };
    });
  }

  private async checked(d: Pick<DraftInput, 'statute' | 'jurisdiction' | 'version' | 'validFrom' | 'validTo' | 'values' | 'verify' | 'golden'>) {
    const problems = [...checkShape(d as unknown as RuleSet, await this.limits()), ...goldenProblems(d.golden)];
    if (d.validTo && d.validTo < d.validFrom) problems.push('Valid to is before valid from');
    if (problems.length) throw new BadRequestException({ statusCode: 400, code: 'RULE_SHAPE', message: `Fix these first: ${problems.join('; ')}.`, problems });
  }

  /** The drafter changes their own draft (a draft that came back with changes requested too). */
  async update(userId: string, id: string, d: UpdateInput) {
    const cur = await this.tenantPrisma.forTenant(SUPER, (tx) => tx.statutoryRuleSet.findUnique({ where: { id } }));
    if (!cur) throw new NotFoundException('No such rule set.');
    await this.checked({ ...d, statute: cur.statute, jurisdiction: cur.jurisdiction, version: cur.version });
    return this.tenantPrisma.forTenant(SUPER, async (tx) => {
      try {
        await tx.$executeRaw`SELECT statutory_update_draft(${id}::uuid, ${d.validFrom}::date, ${d.validTo ?? null}::date, ${JSON.stringify(d.values)}::jsonb, ${d.source}, ${d.lawVersion}, ${d.verify}, ${JSON.stringify(d.golden)}::jsonb, ${d.changeNote ?? null}, ${userId}::uuid)`;
      } catch (e) {
        refusal(e);
      }
      await audit(tx, staff(userId), 'platform.statutory.draft_changed', 'statutory_rule_set', id, { statute: cur.statute, jurisdiction: cur.jurisdiction, version: cur.version, golden: d.golden.length });
      return { id, status: 'draft' };
    });
  }

  /** 1042: the drafter sends the draft for review once its shape checks pass. */
  async sendForReview(userId: string, id: string) {
    const r = await this.tenantPrisma.forTenant(SUPER, (tx) => tx.statutoryRuleSet.findUnique({ where: { id } }));
    if (!r) throw new NotFoundException('No such rule set.');
    const problems = checkShape({ statute: r.statute, jurisdiction: r.jurisdiction, version: r.version, validFrom: iso(r.validFrom), validTo: r.validTo ? iso(r.validTo) : null, verify: r.verify, values: r.values as RuleSet['values'] }, await this.limits());
    if (problems.length) throw new BadRequestException({ statusCode: 400, code: 'RULE_SHAPE', message: `Fix these first: ${problems.join('; ')}.`, problems });
    return this.tenantPrisma.forTenant(SUPER, async (tx) => {
      try {
        await tx.$executeRaw`SELECT statutory_send_for_review(${id}::uuid, ${userId}::uuid)`;
      } catch (e) {
        refusal(e);
      }
      await audit(tx, staff(userId), 'platform.statutory.sent_for_review', 'statutory_rule_set', id, { statute: r.statute, jurisdiction: r.jurisdiction, version: r.version });
      return { id, status: 'in_review' };
    });
  }

  /** 1042: a second member of staff asks for changes; the draft goes back to its drafter with the note. */
  async requestChanges(userId: string, id: string, note: string) {
    return this.tenantPrisma.forTenant(SUPER, async (tx) => {
      const r = await tx.statutoryRuleSet.findUnique({ where: { id } });
      if (!r) throw new NotFoundException('No such rule set.');
      if (r.draftedBy === userId) throw new ForbiddenException('Someone other than the person who drafted it must review it.');
      try {
        await tx.$executeRaw`SELECT statutory_request_changes(${id}::uuid, ${userId}::uuid, ${note})`;
      } catch (e) {
        refusal(e);
      }
      await audit(tx, staff(userId), 'platform.statutory.changes_requested', 'statutory_rule_set', id, { statute: r.statute, jurisdiction: r.jurisdiction, version: r.version, note });
      return { id, status: 'draft', state: 'changes requested' };
    });
  }

  /** 1043: runs the shape checks and every golden case on a version; saves nothing but its audit row. */
  async dryRun(userId: string, id: string) {
    const { r, golden } = await this.tenantPrisma.forTenant(SUPER, async (tx) => ({
      r: await tx.statutoryRuleSet.findUnique({ where: { id } }),
      golden: await tx.statutoryGoldenCase.findMany({ where: { ruleSetId: id }, orderBy: { createdAt: 'asc' } }),
    }));
    if (!r) throw new NotFoundException('No such rule set.');
    const rs: RuleSet = { statute: r.statute, jurisdiction: r.jurisdiction, version: r.version, validFrom: iso(r.validFrom), validTo: r.validTo ? iso(r.validTo) : null, verify: r.verify, values: r.values as RuleSet['values'] };
    const problems = checkShape(rs, await this.limits());
    const cases = golden.map((g) => {
      const res = goldenResult(rs, { name: g.name, fn: g.fn, input: g.input as Record<string, unknown>, expected: g.expected as Record<string, unknown> });
      return { id: g.id, name: g.name, fn: g.fn, input: g.input, expected: g.expected, actual: res.actual, pass: res.problems.length === 0, problems: res.problems };
    });
    const passed = cases.filter((c) => c.pass).length;
    await this.tenantPrisma.forTenant(SUPER, (tx) => audit(tx, staff(userId), 'platform.statutory.golden_run', 'statutory_rule_set', id, { passed, failed: cases.length - passed, problems: problems.length }));
    return { id, ranAt: new Date(), problems, passed, total: cases.length, cases };
  }

  /**
   * 1044: how many companies and employees work where the rule applies (current assignments at locations in its
   * jurisdiction), as numbers only, never names. Read across companies through platformRead (audited with its purpose).
   */
  async impact(userId: string, id: string) {
    const r = await this.tenantPrisma.forTenant(SUPER, (tx) => tx.statutoryRuleSet.findUnique({ where: { id } }));
    if (!r) throw new NotFoundException('No such rule set.');
    const place = jurisdictionPlace(r.jurisdiction);
    const today = todayIst();
    const base = { id, jurisdiction: r.jurisdiction, pastDated: iso(r.validFrom) < today, validFrom: iso(r.validFrom) };
    if (!place) return { ...base, countable: false, companies: null, employees: null, bySize: [] };
    const country = 'country' in place ? place.country : null;
    const state = 'state' in place ? place.state : null;
    const rows = await platformRead(this.tenantPrisma, userId, `statutory.impact ${r.statute} ${r.jurisdiction} ${r.version}`, (tx) =>
      tx.$queryRaw<{ employees: number }[]>`
        SELECT count(DISTINCT a.employee_id)::int AS employees
        FROM employee_assignments a
        JOIN locations l ON l.organization_id = a.organization_id AND l.id = a.location_id
        JOIN organizations o ON o.id = a.organization_id
        WHERE a.superseded_at IS NULL AND a.valid_from <= ${today}::date AND (a.valid_to IS NULL OR a.valid_to >= ${today}::date)
          AND o.lifecycle <> 'closed'
          AND (${country}::text IS NULL OR l.country = ${country}::text)
          AND (${state}::text IS NULL OR l.state = ${state}::text)
        GROUP BY a.organization_id`,
    );
    // Numbers only: one count per company, never which company.
    return {
      ...base,
      countable: true,
      companies: rows.length,
      employees: rows.reduce((t, x) => t + x.employees, 0),
      bySize: SIZE_BANDS.map((b) => ({ size: b, companies: rows.filter((x) => sizeBand(x.employees) === b).length, employees: rows.filter((x) => sizeBand(x.employees) === b).reduce((t, x) => t + x.employees, 0) })),
    };
  }

  /** A staff member drafts a new version (the shape is checked now too, so problems show early). */
  async draft(userId: string, d: DraftInput) {
    const problems = [...checkShape(d as unknown as RuleSet, await this.limits()), ...goldenProblems(d.golden)];
    if (problems.length) throw new BadRequestException({ statusCode: 400, code: 'RULE_SHAPE', message: `Fix these first: ${problems.join('; ')}.`, problems });
    try {
      return await this.tenantPrisma.forTenant(SUPER, async (tx) => {
        const [{ id }] = await tx.$queryRaw<{ id: string }[]>`SELECT statutory_save_draft(${d.statute}, ${d.jurisdiction}, ${d.version}, ${d.validFrom}::date, ${d.validTo ?? null}::date, ${JSON.stringify(d.values)}::jsonb, ${d.source}, ${d.lawVersion}, ${d.verify}, ${JSON.stringify(d.golden)}::jsonb, ${userId}::uuid) AS id`;
        if (d.changeNote) await tx.$executeRaw`SELECT statutory_update_draft(${id}::uuid, ${d.validFrom}::date, ${d.validTo ?? null}::date, ${JSON.stringify(d.values)}::jsonb, ${d.source}, ${d.lawVersion}, ${d.verify}, ${JSON.stringify(d.golden)}::jsonb, ${d.changeNote}, ${userId}::uuid)`;
        await audit(tx, staff(userId), 'platform.statutory.drafted', 'statutory_rule_set', id, { statute: d.statute, jurisdiction: d.jurisdiction, version: d.version });
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
      if (r.status !== 'in_review') throw new ConflictException(r.status === 'draft' ? 'Send it for review first: only a version in review is published.' : 'This version is already published.');
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
      await audit(tx, staff(userId), 'platform.statutory.published', 'statutory_rule_set', id, { statute: r.statute, jurisdiction: r.jurisdiction, version: r.version, golden: golden.length });
      this.cache = null;
      return { id, status: 'published' };
    });
  }
}
