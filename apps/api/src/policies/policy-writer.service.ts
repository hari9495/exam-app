import { ConflictException, HttpException, Injectable, Logger, NotFoundException, BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AiApiKeyResolverService, AiNotConfiguredError, AiProvider, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { AiInvocationService } from '../ai/ai-invocation.service';
import { CompanyContext, Tx, audit, companyContext } from '../org-structure/org-structure.service';
import { todayIst } from '../org-structure/org-validation';
import { settingFor } from '../people/probation';
import { htmlToText } from '../service-desk/rich-text';
import type { GenerateDto, SaveDraftDto, WriterValuesDto } from './policy-writer.dto';
import { PoliciesService } from './policies.service';
import { policyCode } from './policy-rules';
import {
  CLAUSES_SCHEMA,
  CLAUSE_TEXT_MAX,
  NOTES_MAX,
  PATTERNS,
  POLICY_TYPES,
  STARTERS,
  STATES,
  TARGET,
  TYPE_LABEL,
  VALUE_SPEC,
  bodyHtml,
  cleanText,
  findingFor,
  industryNote,
  lawClauses,
  lawFindings,
  looksPersonal,
  ordered,
  parseClauses,
  pickValues,
  promptFor,
  ruleClauses,
  type Answers,
  type Clause,
  type IndustryLaw,
  type Law,
  type Posh,
  type PolicyType,
  type StateLaw,
  type Values,
} from './policy-writer-rules';

// HLP-14 Write policies with AI (rules: docs/yukthix/helpdesk-design-map.md section 4i; founder decisions 4 Nov 2026).
// (1) The company's own AI through AiInvocationService (its provider, its credit limit); the company setting
//     policy.ai_writer (default on) or no provider means "AI is off" and the page offers the YukthiX starters.
// (2) Only the questionnaire answers go to the AI: fixed choices, numbers' topics (not the numbers) and capped notes
//     refused when they hold an email, a phone number or an employee's name. Every run is audited (who, when, type,
//     provider, outcome); the prompt and the notes are not.
// (3) The rule lines come from the answers and are checked against the dated law tables; any open finding blocks
//     approval. One policy manager approves: the text becomes the HLP-10/11 policy's next version, waiting, with the
//     approver recorded (policy_versions.ai_approved_by) so a SECOND person publishes it (API and database CHECK).

type Draft = Prisma.PolicyAiDraftGetPayload<object>;
type Prose = { id: string; title: string; text: string };
export type AiState = 'on' | 'off' | 'not_set_up';

const nameOf = (u: { name: string | null; email: string } | null | undefined) => (u ? u.name || u.email : null);

@Injectable()
export class PolicyWriterService {
  private readonly logger = new Logger(PolicyWriterService.name);

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly ai: AiInvocationService,
    private readonly aiKeys: AiApiKeyResolverService,
    private readonly policies: PoliciesService,
  ) {}

  private async tx<T>(ctx: TenantContext, fn: (tx: Tx, c: CompanyContext) => Promise<T>): Promise<T> {
    const c = companyContext(ctx);
    try {
      return await this.tenantPrisma.forTenant(c, (tx) => fn(tx, c));
    } catch (e) {
      // Two approvals at once making the same policy, or a version started meanwhile (unique indexes).
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException('Someone changed this policy meanwhile. Reload and check it again.');
      throw e;
    }
  }

  /** Off by the company setting, not set up (no provider), or on. Resolving builds the provider; it calls nothing. */
  private async aiState(tx: Tx, c: CompanyContext): Promise<AiState> {
    if ((await settingFor(tx, c, 'policy.ai_writer', { legalEntityId: '00000000-0000-0000-0000-000000000000' })) === 'off') return 'off';
    try {
      await this.aiKeys.resolve(c.organizationId);
      return 'on';
    } catch (e) {
      if (e instanceof AiNotConfiguredError) return 'not_set_up';
      throw e;
    }
  }

  /** The industries offered (a table: a new one needs no deploy). */
  private industries(tx: Tx) {
    return tx.policyIndustry.findMany({ where: { active: true }, orderBy: [{ sort: 'asc' }, { label: 'asc' }] });
  }

  /**
   * The dated law valid today: leave per state (IN.SE) and maternity (IN.LEAVE), POSH (IN.POSH), and the industry's own
   * tables (valid for the whole country or a chosen state); an industry table with leave floors is checked like a
   * state's, any other named statute counts as not checked.
   */
  private async law(tx: Tx, states: string[], today: string, industry: string): Promise<Law> {
    const on = new Date(`${today}T00:00:00Z`);
    const valid = { validFrom: { lte: on }, OR: [{ validTo: null }, { validTo: { gte: on } }], status: 'published' };
    const asTable = (r: { statute: string; jurisdiction: string; version: string; values: Prisma.JsonValue; verify: boolean }): StateLaw => {
      const v = (r.values ?? {}) as { floors?: StateLaw['floors']; carry?: Record<string, number>; notes?: string[] };
      return { state: r.jurisdiction, ref: `${r.statute} ${r.jurisdiction.replace('IN-', '')} ${r.version}${r.verify ? ' (verify)' : ''}`, floors: v.floors ?? [], carry: v.carry ?? {}, notes: v.notes };
    };
    const latest = <T extends { statute: string; jurisdiction: string }>(rows: T[]) => rows.filter((r, i) => rows.findIndex((x) => x.statute === r.statute && x.jurisdiction === r.jurisdiction) === i);
    const se = latest(await tx.statutoryRuleSet.findMany({ where: { statute: 'IN.SE', jurisdiction: { in: states }, ...valid }, orderBy: { validFrom: 'desc' } }));
    const leave = states.map((s) => se.find((r) => r.jurisdiction === s)).filter((r): r is NonNullable<typeof r> => Boolean(r)).map(asTable);
    const m = await tx.statutoryRuleSet.findFirst({ where: { statute: 'IN.LEAVE', jurisdiction: 'IN', ...valid }, orderBy: { validFrom: 'desc' } });
    const mv = (m?.values ?? {}) as { maternityWeeks?: number; maternityWeeksThirdChild?: number };
    const p = await tx.statutoryRuleSet.findFirst({ where: { statute: 'IN.POSH', jurisdiction: 'IN', ...valid }, orderBy: { validFrom: 'desc' } });
    const pv = (p?.values ?? {}) as Partial<Posh>;
    const ind = await tx.policyIndustry.findFirst({ where: { code: industry } });
    const statutes = ind?.lawStatutes ?? [];
    const own = statutes.length ? latest(await tx.statutoryRuleSet.findMany({ where: { statute: { in: statutes }, jurisdiction: { in: ['IN', ...states] }, ...valid }, orderBy: { validFrom: 'desc' } })) : [];
    const tables = own.map(asTable).filter((t) => t.floors.length || Object.keys(t.carry).length);
    const industryLaw: IndustryLaw = { code: industry, label: ind?.label ?? industry, statutes, tables, missing: statutes.filter((st) => !own.some((r) => r.statute === st && tables.some((t) => t.ref.startsWith(`${st} `)))) };
    return {
      leave,
      maternity: m && mv.maternityWeeks ? { ref: `IN.LEAVE ${m.version}`, weeks: mv.maternityWeeks, thirdChildWeeks: mv.maternityWeeksThirdChild ?? mv.maternityWeeks } : null,
      posh: p && pv.inquiryDays ? { ref: `IN.POSH ${p.version}${p.verify ? ' (verify)' : ''}`, ic: pv.ic ?? null, filingMonths: pv.filingMonths ?? 3, filingExtensionMonths: pv.filingExtensionMonths ?? 3, inquiryDays: pv.inquiryDays, reportDays: pv.reportDays ?? 10, actionDays: pv.actionDays ?? 60 } : null,
      industry: industryLaw,
    };
  }

  private async draft(tx: Tx, org: string, id: string): Promise<Draft> {
    const d = await tx.policyAiDraft.findFirst({ where: { organizationId: org, id } });
    if (!d) throw new NotFoundException('No such policy draft.');
    return d;
  }

  /** The whole draft as the page shows it: clauses in reading order, the law check, and where it will go. */
  private async view(tx: Tx, c: CompanyContext, d: Draft) {
    const org = c.organizationId;
    const a = d.answers as unknown as Answers;
    const values = d.values as unknown as Values;
    const prose = (d.clauses as unknown as Prose[]).map((p): Clause => ({ ...p, source: d.mode === 'ai' ? 'ai' : 'company', editable: d.status === 'draft' }));
    const law = await this.law(tx, a.states, todayIst(), a.industry);
    const findings = lawFindings(a.type, values, a.states, law, prose, a.headcount);
    const clauses = ordered(prose, ruleClauses(a.type, values), lawClauses(a.type, law)).map((x) => ({ ...x, finding: findingFor(x.id, findings) }));
    const target = TARGET[a.type];
    const policy = d.policyId
      ? await tx.policyDocument.findFirst({ where: { organizationId: org, id: d.policyId } })
      : await tx.policyDocument.findFirst({ where: { organizationId: org, title: { equals: target.title, mode: 'insensitive' } } });
    const versions = policy ? await tx.policyVersion.findMany({ where: { organizationId: org, policyId: policy.id }, orderBy: { number: 'asc' }, select: { id: true, number: true, status: true, bodyHtml: true, version: true } }) : [];
    const open = versions.find((v) => v.status !== 'published') ?? null;
    // An open version with no text yet (a policy just made in Policy admin) is filled in; one with text blocks.
    const emptyOpen = open && open.status !== 'waiting' && !htmlToText(open.bodyHtml).trim() ? open : null;
    const made = d.policyVersionId ? versions.find((v) => v.id === d.policyVersionId) : null;
    const users = await tx.user.findMany({ where: { organizationId: org, id: { in: [d.createdBy, d.approvedBy, d.discardedBy].filter((x): x is string => Boolean(x)) } }, select: { id: true, name: true, email: true } });
    return {
      id: d.id,
      status: d.status,
      version: d.version,
      mode: d.mode,
      type: a.type,
      typeLabel: TYPE_LABEL[a.type],
      answers: { industry: law.industry.label, states: a.states.map((s) => STATES[s] ?? s), headcount: a.headcount, workPattern: PATTERNS[a.workPattern] ?? a.workPattern },
      values,
      clauses,
      findings,
      openFindings: findings.filter((f) => f.status === 'open').length,
      /** Shown on the draft and carried to the version: the publisher ticks it as seen (never blocks approval). */
      counselNote: industryNote(a.type, law.industry),
      discardedBy: nameOf(users.find((u) => u.id === d.discardedBy)),
      discardedAt: d.discardedAt?.toISOString() ?? null,
      discardReason: d.discardReason,
      createdBy: nameOf(users.find((u) => u.id === d.createdBy)),
      createdAt: d.createdAt.toISOString(),
      approvedBy: nameOf(users.find((u) => u.id === d.approvedBy)),
      approvedAt: d.approvedAt?.toISOString() ?? null,
      approvedByMe: d.approvedBy !== null && d.approvedBy === c.userId,
      target: {
        title: policy?.title ?? target.title,
        policyId: policy?.id ?? null,
        code: policy ? policyCode(policy.number) : null,
        number: made?.number ?? (versions.length ? versions[versions.length - 1].number + (open ? 0 : 1) : 1),
        /** A version already being written in the library blocks approval (one open version per policy). */
        blockedBy: !made && open && !emptyOpen ? { number: open.number, status: open.status } : null,
        emptyOpen: made || !emptyOpen ? null : { id: emptyOpen.id, version: emptyOpen.version },
      },
    };
  }

  // ------------------------------------------------------------------------------------------ reads

  /** The page: AI state, the questionnaire's choices and the latest open draft. */
  home(ctx: TenantContext) {
    return this.tx(ctx, async (tx, c) => {
      // Answer 108: probation starts from the company's own default (whole company; entity or grade overrides differ).
      const probation = Math.min(12, Math.max(0, Number(await settingFor(tx, c, 'probation.default_months', { legalEntityId: '00000000-0000-0000-0000-000000000000' })) || 6));
      // Answer 132: the company's industry setting starts the questionnaire (a draft may still choose another).
      const chosen = await settingFor(tx, c, 'company.industry', { legalEntityId: '00000000-0000-0000-0000-000000000000' });
      const industries = await this.industries(tx);
      const latest = await tx.policyAiDraft.findFirst({ where: { organizationId: c.organizationId, status: 'draft' }, orderBy: { createdAt: 'desc' } });
      return {
        ai: await this.aiState(tx, c),
        defaults: { industry: industries.some((i) => i.code === chosen) ? chosen : null },
        latest: latest ? { id: latest.id, type: TYPE_LABEL[latest.policyType as PolicyType], createdAt: latest.createdAt.toISOString() } : null,
        options: {
          types: POLICY_TYPES.map((t) => ({ value: t, label: TYPE_LABEL[t] })),
          industries: industries.map((i) => ({ value: i.code, label: i.label })),
          states: Object.entries(STATES).map(([value, label]) => ({ value, label })),
          patterns: Object.entries(PATTERNS).map(([value, label]) => ({ value, label })),
          values: Object.fromEntries(POLICY_TYPES.map((t) => [t, Object.entries(VALUE_SPEC[t]).map(([key, s]) => ({ key, ...s, ...(key === 'probationMonths' ? { default: probation } : {}) }))])),
          notesMax: NOTES_MAX,
        },
      };
    });
  }

  detail(ctx: TenantContext, id: string) {
    return this.tx(ctx, async (tx, c) => this.view(tx, c, await this.draft(tx, c.organizationId, id)));
  }

  // ------------------------------------------------------------------------------------------ writes

  /** Draft a policy: the company's AI writes the prose (or a YukthiX starter), the answers give the rule lines. */
  async generate(ctx: TenantContext, dto: GenerateDto) {
    const picked = pickValues(dto.type, dto);
    if ('missing' in picked) throw new BadRequestException({ statusCode: 400, code: 'POLICY_ANSWER_MISSING', message: picked.missing });
    const notes = cleanText(dto.notes ?? '', NOTES_MAX);
    if (looksPersonal(notes)) throw new BadRequestException({ statusCode: 400, code: 'POLICY_NOTES_PERSONAL', message: 'Leave emails and phone numbers out of the notes. Only your answers go to the AI.' });
    const answers: Answers = { type: dto.type, industry: dto.industry, states: dto.states, headcount: dto.headcount, workPattern: dto.workPattern, notes };
    const pre = await this.tx(ctx, async (tx, c) => {
      const industry = await tx.policyIndustry.findFirst({ where: { code: dto.industry, active: true } });
      if (!industry) throw new BadRequestException({ statusCode: 400, code: 'POLICY_INDUSTRY_UNKNOWN', message: 'Choose an industry from the list.' });
      if (notes && (await this.namesIn(tx, c.organizationId, notes))) throw new BadRequestException({ statusCode: 400, code: 'POLICY_NOTES_PERSONAL', message: 'Leave people’s names out of the notes. Only your answers go to the AI.' });
      const state = await this.aiState(tx, c);
      const org = await tx.organization.findFirst({ where: { id: c.organizationId }, select: { aiProvider: true } });
      return { state, provider: dto.mode === 'ai' ? (org?.aiProvider ?? 'anthropic') : null, industryLabel: industry.label };
    });
    if (dto.mode === 'ai' && pre.state !== 'on')
      throw new ConflictException({ statusCode: 409, code: 'POLICY_AI_OFF', message: pre.state === 'off' ? 'Your company has switched AI off for policies. Use a YukthiX starter instead.' : 'Your company has no AI set up. Use a YukthiX starter instead, or ask your System Admin to add an AI key.' });

    let prose: Prose[];
    if (dto.mode === 'starter') prose = STARTERS[dto.type].map((s, i) => ({ id: `p${i + 1}`, ...s }));
    else {
      try {
        prose = await this.ai.run(ctx, { source: 'policy_writer' }, (p) => this.draftWithAi(p, answers, pre.industryLabel));
      } catch (e) {
        await this.tx(ctx, (tx, c) => audit(tx, c, 'policy.ai_draft_failed', 'policy_ai_draft', c.organizationId, { type: dto.type, provider: pre.provider, outcome: e instanceof HttpException ? `refused ${e.getStatus()}` : 'ai_error' })).catch(() => undefined);
        if (e instanceof HttpException) throw e;
        this.logger.warn(`policy writer: ${(e as Error).message}`);
        throw new ServiceUnavailableException({ statusCode: 503, code: 'POLICY_AI_FAILED', message: 'The AI did not send a usable draft. Try again in a moment, or use a YukthiX starter.' });
      }
    }
    return this.tx(ctx, async (tx, c) => {
      const d = await tx.policyAiDraft.create({ data: { organizationId: c.organizationId, policyType: dto.type, answers: answers as unknown as Prisma.InputJsonValue, values: picked.values, clauses: prose as unknown as Prisma.InputJsonValue, mode: dto.mode, provider: pre.provider, createdBy: c.userId! } });
      // Who, when (the audit row), which policy, the provider and the outcome; never the prompt or the notes.
      await audit(tx, c, 'policy.ai_draft_generated', 'policy_ai_draft', d.id, { type: dto.type, mode: dto.mode, provider: pre.provider, outcome: 'drafted', clauses: prose.length, states: dto.states, notesGiven: Boolean(notes) });
      return { id: d.id };
    });
  }

  private async draftWithAi(p: AiProvider, a: Answers, industryLabel: string): Promise<Prose[]> {
    const result = await p.generateStructured({ modelTier: 'standard', maxTokens: 3000, prompt: promptFor(a, industryLabel), tool: { name: 'report_policy_clauses', description: 'Report the prose clauses of the policy.', schema: CLAUSES_SCHEMA } });
    const prose = parseClauses(result);
    if (!prose.length) throw new Error('the AI returned no clauses');
    return prose;
  }

  /** True when the text holds the full name of one of the company's people (any case). */
  private async namesIn(tx: Tx, org: string, text: string): Promise<boolean> {
    const rows = await tx.$queryRaw<{ hit: number }[]>`
      SELECT 1 AS hit FROM employees e
      WHERE e.organization_id = ${org}::uuid AND e.family_name IS NOT NULL AND length(e.given_name) >= 2
        AND position(lower(e.given_name || ' ' || e.family_name) in lower(${text})) > 0
      LIMIT 1`;
    return rows.length > 0;
  }

  /** Change the numbers ("Use the legal minimum") or the prose; the rule and law lines follow the numbers. */
  save(ctx: TenantContext, id: string, dto: SaveDraftDto) {
    return this.tx(ctx, async (tx, c) => {
      const d = await this.draft(tx, c.organizationId, id);
      if (d.status !== 'draft') throw new ConflictException(d.status === 'discarded' ? 'This draft was discarded. Start a new one.' : 'This draft was approved. Its policy version is in Policy admin.');
      if (d.version !== dto.version) throw new ConflictException('Someone changed this draft meanwhile. Reload and try again.');
      const type = d.policyType as PolicyType;
      const before = d.values as unknown as Values;
      const given = Object.fromEntries(Object.keys(VALUE_SPEC[type]).map((k) => [k, dto[k as keyof WriterValuesDto] ?? before[k]]));
      const picked = pickValues(type, given);
      if ('missing' in picked) throw new BadRequestException({ statusCode: 400, code: 'POLICY_ANSWER_MISSING', message: picked.missing });
      const prose = d.clauses as unknown as Prose[];
      const changed: string[] = [];
      for (const e of dto.clauses ?? []) {
        const p = prose.find((x) => x.id === e.id);
        if (!p) throw new BadRequestException({ statusCode: 400, code: 'POLICY_CLAUSE_UNKNOWN', message: 'That clause is not in this draft. Reload and try again.' });
        const text = cleanText(e.text, CLAUSE_TEXT_MAX);
        if (!text) throw new BadRequestException({ statusCode: 400, code: 'POLICY_CLAUSE_EMPTY', message: `Write the "${p.title}" clause, or keep its text.` });
        if (text !== p.text) changed.push(p.id);
        p.text = text;
      }
      const n = await tx.policyAiDraft.updateMany({ where: { organizationId: c.organizationId, id, version: d.version, status: 'draft' }, data: { values: picked.values, clauses: prose as unknown as Prisma.InputJsonValue, version: { increment: 1 } } });
      if (!n.count) throw new ConflictException('Someone changed this draft meanwhile. Reload and try again.');
      await audit(tx, c, 'policy.ai_draft_saved', 'policy_ai_draft', id, { values: Object.fromEntries(Object.keys(picked.values).filter((k) => picked.values[k] !== before[k]).map((k) => [k, { from: before[k], to: picked.values[k] }])), clausesChanged: changed });
      return { version: d.version + 1 };
    });
  }

  /**
   * One policy manager approves: no open law finding (checked again here), then the text becomes the next version of
   * the matching HLP-10/11 policy (made if none), sent to be published by a second person.
   */
  async approve(ctx: TenantContext, id: string, version: number) {
    const out = await this.tx(ctx, async (tx, c) => {
      const org = c.organizationId;
      const d = await this.draft(tx, org, id);
      if (d.status !== 'draft') throw new ConflictException(d.status === 'discarded' ? 'This draft was discarded. Start a new one.' : 'This draft was already approved. Its policy version is in Policy admin.');
      if (d.version !== version) throw new ConflictException('Someone changed this draft meanwhile. Reload and check it again.');
      const v = await this.view(tx, c, d);
      if (v.openFindings) throw new ConflictException({ statusCode: 409, code: 'POLICY_LAW_FINDINGS', message: `Fix the ${v.openFindings === 1 ? 'open law-check finding' : `${v.openFindings} open law-check findings`} first.` });
      if (v.target.blockedBy) throw new ConflictException({ statusCode: 409, code: 'POLICY_VERSION_OPEN', message: `${v.target.title} already has v${v.target.blockedBy.number} being written. Finish or send it back in Policy admin first.` });
      const html = bodyHtml(v.clauses);
      const target = TARGET[d.policyType as PolicyType];
      let policy = v.target.policyId ? await tx.policyDocument.findFirst({ where: { organizationId: org, id: v.target.policyId } }) : null;
      let versionId: string;
      let number: number;
      if (!policy) {
        const last = await tx.policyDocument.aggregate({ where: { organizationId: org }, _max: { number: true } });
        policy = await tx.policyDocument.create({ data: { organizationId: org, number: (last._max.number ?? 0) + 1, title: target.title, category: target.category, method: 'click', ownerUserId: c.userId ?? null, createdBy: c.userId ?? null } });
        await audit(tx, c, 'policy.created', 'policy_document', policy.id, { title: policy.title, category: policy.category, method: policy.method, fromAiDraft: id });
        number = 1;
        versionId = (await tx.policyVersion.create({ data: { organizationId: org, policyId: policy.id, number, bodyHtml: html, reack: true, needsSecondPerson: true, aiApprovedBy: c.userId!, counselNote: v.counselNote, writtenBy: c.userId!, status: 'waiting', submittedAt: new Date() } })).id;
      } else {
        const s = await this.policies.settings(tx, c);
        number = v.target.number;
        const data = { bodyHtml: html, changeSummary: number > 1 ? `Rewritten from the ${TYPE_LABEL[d.policyType as PolicyType].toLowerCase()} questionnaire (Write policies with AI).` : null, reack: number === 1 ? true : s.reackDefault, needsSecondPerson: true, aiApprovedBy: c.userId!, counselNote: v.counselNote, writtenBy: c.userId!, status: 'waiting', submittedAt: new Date(), sentBackNote: null };
        if (v.target.emptyOpen) {
          const u = await tx.policyVersion.updateMany({ where: { organizationId: org, id: v.target.emptyOpen.id, version: v.target.emptyOpen.version, status: { in: ['draft', 'sent_back'] } }, data: { ...data, version: { increment: 1 } } });
          if (!u.count) throw new ConflictException('Someone started writing this policy meanwhile. Reload and check it again.');
          versionId = v.target.emptyOpen.id;
        } else versionId = (await tx.policyVersion.create({ data: { organizationId: org, policyId: policy.id, number, ...data } })).id;
      }
      const n = await tx.policyAiDraft.updateMany({ where: { organizationId: org, id, version: d.version, status: 'draft' }, data: { status: 'approved', approvedBy: c.userId!, approvedAt: new Date(), policyId: policy.id, policyVersionId: versionId, version: { increment: 1 } } });
      if (!n.count) throw new ConflictException('Someone changed this draft meanwhile. Reload and check it again.');
      await audit(tx, c, 'policy.ai_draft_approved', 'policy_ai_draft', id, { policyId: policy.id, versionId, number, type: d.policyType, mode: d.mode, counselNote: v.counselNote });
      await audit(tx, c, 'policy.version_sent', 'policy_version', versionId, { policyId: policy.id, number, needsSecondPerson: true, fromAiDraft: id });
      return { org, policy: { id: policy.id, title: policy.title }, code: policyCode(policy.number), number, publishers: (await this.policies.publishers(tx, org)).filter((u) => u !== c.userId) };
    });
    await this.policies.noticeToPublish(out.org, out.policy, out.number, out.publishers);
    return { policyId: out.policy.id, code: out.code, title: out.policy.title, number: out.number };
  }

  /** Answer 106: an unapproved draft is set aside (never deleted); it stays in the audit trail. */
  discard(ctx: TenantContext, id: string, version: number) {
    return this.tx(ctx, async (tx, c) => {
      const d = await this.draft(tx, c.organizationId, id);
      if (d.status !== 'draft') throw new ConflictException(d.status === 'discarded' ? 'This draft was already discarded.' : 'This draft was approved. Its policy version is in Policy admin.');
      if (d.version !== version) throw new ConflictException('Someone changed this draft meanwhile. Reload and check it again.');
      const n = await tx.policyAiDraft.updateMany({ where: { organizationId: c.organizationId, id, version, status: 'draft' }, data: { status: 'discarded', discardedBy: c.userId!, discardedAt: new Date(), discardReason: 'manual', version: { increment: 1 } } });
      if (!n.count) throw new ConflictException('Someone changed this draft meanwhile. Reload and check it again.');
      await audit(tx, c, 'policy.ai_draft_discarded', 'policy_ai_draft', id, { type: d.policyType, reason: 'manual' });
      return { status: 'discarded' };
    });
  }

  /**
   * The daily clean-up (answer 106): every company's unapproved drafts untouched for its policy.ai_draft.discard_days
   * (default 90) are discarded, each audited. Safe to re-run: a discarded draft is never touched again.
   */
  async discardExpired(now = new Date(), onlyOrg?: string): Promise<number> {
    const orgs = await this.tenantPrisma.forTenant({ organizationId: null, isSuperAdmin: true }, (tx) => tx.policyAiDraft.findMany({ where: { status: 'draft', ...(onlyOrg ? { organizationId: onlyOrg } : {}) }, distinct: ['organizationId'], select: { organizationId: true } }));
    let total = 0;
    for (const { organizationId } of orgs) {
      const c: CompanyContext = { organizationId, isSuperAdmin: false, userId: null, role: null, supportSessionId: null };
      total += await this.tenantPrisma.forTenant(c, async (tx) => {
        const days = Number(await settingFor(tx, c, 'policy.ai_draft.discard_days', { legalEntityId: '00000000-0000-0000-0000-000000000000' })) || 90;
        const old = await tx.policyAiDraft.findMany({ where: { organizationId, status: 'draft', updatedAt: { lt: new Date(now.getTime() - days * 86_400_000) } }, select: { id: true, version: true, policyType: true } });
        let n = 0;
        for (const d of old) {
          const u = await tx.policyAiDraft.updateMany({ where: { organizationId, id: d.id, version: d.version, status: 'draft' }, data: { status: 'discarded', discardedAt: now, discardReason: 'expired', version: { increment: 1 } } });
          if (!u.count) continue;
          await audit(tx, c, 'policy.ai_draft_discarded', 'policy_ai_draft', d.id, { type: d.policyType, reason: 'expired', afterDays: days });
          n++;
        }
        return n;
      });
    }
    return total;
  }
}
