import { ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { NotificationsService } from '../notifications/notifications.service';
import { AiApiKeyResolverService, AiNotConfiguredError, PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { buildViewer, has, type ScopeUser } from '../access/scope';
import { AiInvocationService } from '../ai/ai-invocation.service';
import { FieldPermissionsService } from '../field-permissions/field-permissions.service';
import { CompanyContext, Tx, audit, inCompany } from '../org-structure/org-structure.service';
import { settingFor } from '../people/probation';
import { poolConsented } from '../talent/pools.service';
import { addMonths } from '../talent/talent-rules';
import { matchPerson } from './rediscovery-rules';

// HIR-26 rediscovery panel (founder decision 2: advisory only; plain text search when the company has AI off).
//   who       recruiting (pipeline:manage) and HR on every requisition; a hiring manager on their own; only viewers who
//             may see candidates (pipeline:manage or candidate:view); another company's job is 404
//   whom      this company's candidates who agreed to be kept for other roles (talent-pool consent, not withdrawn), whose
//             retention period is still running, not erased, merged away, under legal hold, hired or already on this job
//   match     the plain text match (rediscovery-rules.ts) always picks and orders the people. With the company setting
//             hiring.rediscovery.ai on (default off) and an AI provider, the company's AI (AiInvocationService: its
//             provider and credit limit) writes a short "why" for each one. It never adds, drops, moves or ranks anyone.
//             Only role facts and the people's past role titles, skills, years and stage go to it: no names, emails,
//             phone numbers or ids. Every run is audited (who, when, job, mode, outcome, count), never the prompt.

const MAX = 10;
// shortcut: the newest 2000 eligible candidates are matched in memory; move to a full-text index past that size.
const SCAN = 2000;
const SETTING = 'hiring.rediscovery.ai';

type Cand = { id: string; name: string; email_out: boolean; wa_out: boolean; parsed_title: string | null; parsed_skills: string | null; years: number | null; last_at: Date };
export type RediscoveryAi = 'on' | 'off' | 'not_set_up' | 'failed';

@Injectable()
export class RediscoveryService {
  private readonly logger = new Logger(RediscoveryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly ai: AiInvocationService,
    private readonly aiKeys: AiApiKeyResolverService,
    private readonly fieldPerms: FieldPermissionsService,
    private readonly notifications: NotificationsService,
  ) {}

  private async aiState(tx: Tx, c: CompanyContext): Promise<'on' | 'off' | 'not_set_up'> {
    if ((await settingFor(tx, c, SETTING, { legalEntityId: '' })) !== 'on') return 'off';
    try {
      await this.aiKeys.resolve(c.organizationId);
      return 'on';
    } catch (e) {
      if (e instanceof AiNotConfiguredError) return 'not_set_up';
      throw e;
    }
  }

  async suggest(ctx: TenantContext, user: ScopeUser, jobId: string) {
    const v = await buildViewer(this.prisma, this.tenantPrisma, user, ['pipeline:manage', 'ats.headcount.manage', 'candidate:view']);
    if (!has(v, 'pipeline:manage') && !has(v, 'candidate:view')) throw new ForbiddenException('Past candidates show only to people who may see candidates. Ask your System Admin for a hiring role that does.');
    const all = has(v, 'pipeline:manage') || has(v, 'ats.headcount.manage');
    const me = user.userId ?? '00000000-0000-0000-0000-000000000000';
    const found = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const job = await tx.job.findFirst({ where: { organizationId: org, id: jobId, deletedAt: null, ...(all ? {} : { OR: [{ hiringManagerId: me }, { createdById: me }] }) } });
      if (!job) throw new NotFoundException('No such requisition.');
      const [designation, months, ai, orgRow] = await Promise.all([
        job.designationId ? tx.designation.findFirst({ where: { organizationId: org, id: job.designationId }, select: { name: true } }) : null,
        settingFor(tx, c, 'ats.retention_months', { legalEntityId: '' }),
        // Acting for someone else: no AI is run on their behalf; the plain search still shows.
        v.actingForOther ? Promise.resolve('off' as const) : this.aiState(tx, c),
        tx.organization.findFirst({ where: { id: org }, select: { aiProvider: true } }),
      ]);
      const rows = await tx.$queryRaw<Cand[]>`
        SELECT c.id::text AS id, c.name, c.email_opted_out_at IS NOT NULL AS email_out, c.whatsapp_opted_out_at IS NOT NULL AS wa_out,
               p.parsed_title, p.parsed_skills, p.parsed_years_experience AS years,
               GREATEST(c.created_at, COALESCE(c.retention_renewed_at, c.created_at),
                 COALESCE((SELECT max(pe.updated_at) FROM pipeline_entries pe WHERE pe.candidate_id = c.id), c.created_at),
                 COALESCE((SELECT max(cc.given_at) FROM candidate_consents cc WHERE cc.candidate_id = c.id), c.created_at)) AS last_at
        FROM candidates c LEFT JOIN candidate_profiles p ON p.candidate_id = c.id
        WHERE c.organization_id = ${org}::uuid AND c.erased_at IS NULL AND c.deleted_at IS NULL AND c.merged_into_id IS NULL
          AND c.legal_hold_at IS NULL AND c.global_stage <> 'hired'
          AND NOT EXISTS (SELECT 1 FROM pipeline_entries pe WHERE pe.candidate_id = c.id AND pe.job_id = ${job.id}::uuid)
        ORDER BY last_at DESC LIMIT ${SCAN}`;
      const consented = await poolConsented(tx, org, rows.map((r) => r.id));
      const now = new Date();
      const live = rows.filter((r) => consented.has(r.id) && addMonths(r.last_at, Number(months)) > now);
      const ids = live.map((r) => r.id);
      const entries = ids.length
        ? await tx.pipelineEntry.findMany({ where: { organizationId: org, candidateId: { in: ids } }, orderBy: { updatedAt: 'desc' }, select: { candidateId: true, rejected: true, job: { select: { title: true, jobNumber: true, location: true } }, status: { select: { name: true, stage: { select: { name: true } } } } } })
        : [];
      const pools = ids.length ? await tx.talentPoolMember.findMany({ where: { organizationId: org, candidateId: { in: ids }, pool: { kind: 'pool', archivedAt: null } }, select: { candidateId: true, pool: { select: { name: true } } } }) : [];
      const role = { title: [job.title, designation?.name].filter(Boolean).join(' '), text: [job.title, designation?.name, job.description].filter(Boolean).join(' '), location: job.location };
      const matches = live
        .map((r) => {
          const past = entries.filter((e) => e.candidateId === r.id);
          const m = matchPerson(role, { resumeTitle: r.parsed_title, skills: r.parsed_skills, pastRoles: past.map((e) => ({ title: e.job.title, location: e.job.location })) });
          return m && { r, past, m };
        })
        .filter((x): x is NonNullable<typeof x> => Boolean(x))
        .sort((a, b) => b.m.score - a.m.score || b.r.last_at.getTime() - a.r.last_at.getTime())
        .slice(0, MAX);
      const suggested = new Set((await tx.requisitionSuggestion.findMany({ where: { organizationId: org, jobId: job.id }, select: { candidateId: true } })).map((x) => x.candidateId));
      return { job, role, ai, provider: orgRow?.aiProvider ?? 'anthropic', months: Number(months), matches, pools, suggested };
    });

    const hidden = await this.fieldPerms.getHiddenFields(ctx, user.role ?? '', 'candidate');
    const out = found.matches.map(({ r, past, m }) => {
      const last = past[0];
      return {
        id: r.id,
        name: hidden.has('name') ? 'Name hidden' : r.name,
        lastRole: last ? `${last.job.title}${last.job.jobNumber ? ` (JOB-${String(last.job.jobNumber).padStart(4, '0')})` : ''}` : (r.parsed_title ?? 'No past application'),
        lastStage: last ? (last.status?.stage.name ?? last.status?.name ?? 'Applied') : 'Talent pool',
        reasons: m.reasons,
        aiNote: null as string | null,
        consent: { email: r.email_out ? 'opted-out' : 'opted-in', whatsapp: r.wa_out ? 'opted-out' : 'none' },
        retentionUntil: addMonths(r.last_at, found.months),
        pool: found.pools.find((p) => p.candidateId === r.id)?.pool.name ?? null,
        // Answer 255: already suggested to the recruiter for this requisition.
        suggested: found.suggested.has(r.id),
      };
    });

    let ai: RediscoveryAi = found.ai;
    if (ai === 'on' && out.length) {
      try {
        const notes = await this.ai.run(ctx, { source: 'rediscovery', sourceId: jobId }, (p) =>
          p.generateStructured({
            modelTier: 'fast',
            maxTokens: 1200,
            prompt: [
              'A recruiter is filling the role below. For each past candidate, write one short plain-English sentence (at most 30 words) on why they may be worth a look for this role.',
              'Only explain; never rank, score, reject or recommend a decision. Do not guess anything about the person that is not given.',
              `Role: ${found.role.title}${found.job.department ? `, ${found.job.department}` : ''}${found.job.location ? `, ${found.job.location}` : ''}.`,
              ...found.matches.map(({ r, past }, i) =>
                `P${i + 1}: past roles: ${past.slice(0, 3).map((e) => e.job.title).join('; ') || 'none'}; résumé title: ${r.parsed_title ?? 'none'}; skills: ${(r.parsed_skills ?? 'none').slice(0, 300)}; years: ${r.years ?? 'unknown'}; furthest stage: ${past[0]?.status?.stage.name ?? 'none'}.`,
              ),
            ].join('\n'),
            tool: {
              name: 'report_notes',
              description: 'Report one short note per past candidate.',
              schema: { type: 'object' as const, properties: { notes: { type: 'array', items: { type: 'object', properties: { ref: { type: 'string' }, note: { type: 'string' } }, required: ['ref', 'note'] } } }, required: ['notes'] },
            },
          }),
        );
        for (const n of Array.isArray(notes.notes) ? (notes.notes as { ref?: unknown; note?: unknown }[]) : []) {
          const i = typeof n.ref === 'string' ? Number(n.ref.replace(/^P/i, '')) - 1 : -1;
          // Plain text only, capped: the note is shown as text and never changes who is listed or their order.
          if (out[i] && typeof n.note === 'string') out[i].aiNote = n.note.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim().slice(0, 300) || null;
        }
      } catch (e) {
        this.logger.warn(`rediscovery AI ${jobId}: ${(e as Error).message}`);
        ai = 'failed';
      }
    }
    // Who and when are on the audit row; never the prompt or the notes.
    await inCompany(this.tenantPrisma, ctx, (tx, c) => audit(tx, c, 'ats.rediscovery.run', 'job', jobId, { mode: ai === 'on' ? 'ai' : 'text', ai, provider: ai === 'on' || ai === 'failed' ? found.provider : null, matches: out.length }));
    return { mode: ai === 'on' ? ('ai' as const) : ('text' as const), ai, matches: out };
  }

  /**
   * HIR-26 answer 255: a hiring manager suggests a past candidate to the requisition's recruiter: a bell notice, audited,
   * once per candidate per requisition. Only someone who may see the panel on that requisition, about a candidate the
   * panel may show (this company's, kept for other roles, not erased, merged or on legal hold).
   */
  async suggestToRecruiter(ctx: TenantContext, user: ScopeUser, jobId: string, candidateId: string) {
    const v = await buildViewer(this.prisma, this.tenantPrisma, user, ['pipeline:manage', 'ats.headcount.manage', 'candidate:view']);
    if (!has(v, 'pipeline:manage') && !has(v, 'candidate:view')) throw new ForbiddenException('Past candidates show only to people who may see candidates. Ask your System Admin for a hiring role that does.');
    const all = has(v, 'pipeline:manage') || has(v, 'ats.headcount.manage');
    const me = user.userId ?? '00000000-0000-0000-0000-000000000000';
    const out = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const job = await tx.job.findFirst({ where: { organizationId: org, id: jobId, deletedAt: null, ...(all ? {} : { OR: [{ hiringManagerId: me }, { createdById: me }] }) } });
      if (!job) throw new NotFoundException('No such requisition.');
      const cand = await tx.candidate.findFirst({ where: { organizationId: org, id: candidateId, erasedAt: null, deletedAt: null, mergedIntoId: null, legalHoldAt: null }, select: { id: true, name: true } });
      if (!cand || !(await poolConsented(tx, org, [cand.id])).has(cand.id)) throw new NotFoundException('That person is not a past candidate you can suggest.');
      // A manager's own request starts with them as its recruiter; a suggestion needs someone else in recruiting.
      if (!job.recruiterUserId || job.recruiterUserId === me) throw new ConflictException('This requisition has no recruiter yet. Ask recruiting to assign one.');
      try {
        await tx.requisitionSuggestion.create({ data: { organizationId: org, jobId: job.id, candidateId: cand.id, suggestedBy: me } });
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException(`You already suggested ${cand.name} for this requisition.`);
        throw e;
      }
      await audit(tx, c, 'ats.rediscovery.suggested', 'job', job.id, { candidateId: cand.id, recruiterUserId: job.recruiterUserId });
      return { recruiter: job.recruiterUserId, name: cand.name, title: job.title };
    });
    await this.notifications.notify(ctx, me, [out.recruiter], 'ats.rediscovery.suggested', { entityType: 'job', entityId: jobId, contextText: `Suggested ${out.name} for ${out.title}`, linkPath: '/yx/hiring/requisitions' });
    return { suggested: true };
  }
}
