import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { CompanyContext, Tx, audit, inCompany } from '../org-structure/org-structure.service';
import { ScopeUser, Viewer, buildViewer, grantPeriods, has, tenantWide } from '../access/scope';
import { ownOf } from '../documents/person-access';
import { personByEmail } from '../lifecycle/rehire-policy';
import { TYPE_LABEL } from '../lifecycle/exits.service';
import type { ExitType } from '../lifecycle/exit-rules';
import { settingFor } from '../people/probation';
import { addMonths } from './talent-rules';
import { withdrawConsent } from './pools.service';

// Recruitment batch AT4 (M10-BUILD-DESIGN §7.1): one candidate as the YukthiX profile shows it — contact, résumé,
// applications, assessments, interviews, messages, consents with versions, lists, merges, legal hold and the date
// the retention sweep would anonymise them. A merged-away candidate answers with the kept one's id.
@Injectable()
export class CandidateProfileService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * HIR-05. Contact details, messages, consents and retention go only to holders of candidate:manage or the data-rights
   * key; a view-only holder (a hiring manager, ats.candidate.view) gets the hiring facts. The ex-employee match is
   * added for viewers who may see the employee (see exEmployee).
   */
  async get(ctx: TenantContext, user: ScopeUser, id: string) {
    const v = await buildViewer(this.prisma, this.tenantPrisma, user, VIEW_KEYS);
    const full = has(v, 'candidate:manage') || has(v, 'candidate:data_rights');
    const r = await this.read(ctx, id);
    if ('mergedIntoId' in r) return r;
    const exEmployee = r.candidate.erasedAt ? null : await inCompany(this.tenantPrisma, ctx, (tx, c) => exEmployeeFor(tx, c, v, r.candidate.email));
    if (full) return { ...r, exEmployee };
    return {
      ...r,
      candidate: { ...r.candidate, email: null, phone: null, phoneE164: null },
      messages: { emails: [], sms: 0, whatsapp: 0 },
      consents: [],
      lists: [],
      merges: [],
      retention: null,
      legalHold: r.legalHold ? { at: r.legalHold.at, reason: null } : null,
      exEmployee,
    };
  }

  private read(ctx: TenantContext, id: string) {
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const cand = await tx.candidate.findFirst({ where: { id, organizationId: org } });
      if (!cand) throw new NotFoundException('Candidate not found.');
      if (cand.mergedIntoId) return { mergedIntoId: cand.mergedIntoId };
      const [profile, entries, invitations, interviews, emails, sms, whatsapp, consents, pools, merges, months, last] = await Promise.all([
        tx.candidateProfile.findUnique({ where: { candidateId: id }, select: { resumePath: true, resumeScan: true, parseStatus: true, parsedTitle: true, parsedSummary: true, parsedSkills: true, parsedYearsExperience: true } }),
        tx.pipelineEntry.findMany({ where: { organizationId: org, candidateId: id }, orderBy: { createdAt: 'desc' }, select: { id: true, createdAt: true, archivedAt: true, rejected: true, rejectedReason: true, enteredVia: true, job: { select: { id: true, title: true, status: true } }, status: { select: { name: true, stage: { select: { name: true, category: true } } } } } }),
        tx.invitation.findMany({ where: { candidateId: id }, orderBy: { invitedAt: 'desc' }, select: { id: true, status: true, invitedAt: true, exam: { select: { title: true } } } }),
        tx.interview.findMany({ where: { organizationId: org, candidateId: id }, orderBy: { createdAt: 'desc' }, select: { id: true, status: true, createdAt: true } }),
        tx.candidateEmail.findMany({ where: { organizationId: org, candidateId: id }, orderBy: { createdAt: 'desc' }, take: 50, select: { id: true, subject: true, status: true, createdAt: true } }),
        tx.candidateSms.count({ where: { organizationId: org, candidateId: id } }),
        tx.candidateWhatsapp.count({ where: { organizationId: org, candidateId: id } }),
        tx.candidateConsent.findMany({ where: { organizationId: org, candidateId: id }, orderBy: { givenAt: 'desc' }, select: { id: true, purpose: true, version: true, source: true, givenAt: true, withdrawnAt: true } }),
        tx.talentPoolMember.findMany({ where: { organizationId: org, candidateId: id }, select: { addedAt: true, pool: { select: { id: true, name: true, kind: true } } } }),
        tx.candidateMerge.findMany({ where: { organizationId: org, OR: [{ keptId: id }, { mergedId: id }] }, orderBy: { mergedAt: 'desc' } }),
        settingFor(tx, c, 'ats.retention_months', { legalEntityId: '' }),
        tx.$queryRaw<{ at: Date }[]>`SELECT GREATEST(c.created_at, COALESCE(c.retention_renewed_at, c.created_at),
            COALESCE((SELECT max(pe.updated_at) FROM pipeline_entries pe WHERE pe.candidate_id = c.id), c.created_at),
            COALESCE((SELECT max(cc.given_at) FROM candidate_consents cc WHERE cc.candidate_id = c.id), c.created_at)) AS at
          FROM candidates c WHERE c.id = ${id}::uuid`,
      ]);
      return {
        candidate: { id: cand.id, name: cand.name, email: cand.email, phone: cand.phone, phoneE164: cand.phoneE164, status: cand.status, globalStage: cand.globalStage, createdAt: cand.createdAt, erasedAt: cand.erasedAt, emailOptedOut: Boolean(cand.emailOptedOutAt), smsOptedOut: Boolean(cand.smsOptedOutAt), whatsappOptedOut: Boolean(cand.whatsappOptedOutAt) },
        legalHold: cand.legalHoldAt ? { at: cand.legalHoldAt, reason: cand.legalHoldReason } : null,
        retention: { months: Number(months), lastActivityAt: last[0]?.at ?? cand.createdAt, until: cand.erasedAt ? null : addMonths(last[0]?.at ?? cand.createdAt, Number(months)), noticeAt: cand.retentionNoticeAt },
        resume: profile ? { hasFile: Boolean(profile.resumePath), scan: profile.resumeScan, parseStatus: profile.parseStatus, title: profile.parsedTitle, summary: profile.parsedSummary, skills: profile.parsedSkills, years: profile.parsedYearsExperience } : null,
        applications: entries.map((e) => ({ id: e.id, jobId: e.job.id, jobTitle: e.job.title, jobStatus: e.job.status, stage: e.status?.stage.name ?? null, status: e.status?.name ?? null, appliedAt: e.createdAt, closed: Boolean(e.archivedAt) || e.rejected, closedReason: e.rejectedReason, source: e.enteredVia })),
        assessments: invitations.map((i) => ({ id: i.id, exam: i.exam.title, status: i.status, invitedAt: i.invitedAt })),
        interviews,
        messages: { emails, sms, whatsapp },
        consents,
        lists: pools.map((p) => ({ ...p.pool, addedAt: p.addedAt })),
        merges: merges.map((m) => ({ id: m.id, keptId: m.keptId, mergedId: m.mergedId, mergedAt: m.mergedAt, mergedBy: m.mergedBy, choices: m.choices })),
      };
    });
  }

  /** One candidate by email for a data request (merged-away tombstones never match: they gave up their email). */
  lookup(ctx: TenantContext, email: string) {
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const cand = await tx.candidate.findFirst({ where: { organizationId: c.organizationId, email, deletedAt: null, mergedIntoId: null }, select: { id: true, name: true, email: true, globalStage: true, legalHoldAt: true, erasedAt: true } });
      return { match: cand ? { id: cand.id, name: cand.name, email: cand.email, stage: cand.globalStage, onHold: Boolean(cand.legalHoldAt), erased: Boolean(cand.erasedAt) } : null };
    });
  }

  /** Legal hold (P02): nothing is erased, merged away or swept while it is on. */
  setHold(ctx: TenantContext, id: string, on: boolean, reason: string | null) {
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const cand = await tx.candidate.findFirst({ where: { id, organizationId: c.organizationId, mergedIntoId: null }, select: { id: true, erasedAt: true } });
      if (!cand) throw new NotFoundException('Candidate not found.');
      if (cand.erasedAt) throw new ConflictException('This candidate was erased.');
      await tx.candidate.update({ where: { id }, data: on ? { legalHoldAt: new Date(), legalHoldReason: reason, legalHoldBy: c.userId ?? null } : { legalHoldAt: null, legalHoldReason: null, legalHoldBy: null } });
      await audit(tx, c, on ? 'ats.candidate.hold_placed' : 'ats.candidate.hold_lifted', 'candidate', id, on ? { reason } : undefined);
      return { legalHold: on };
    });
  }

  /** A recruiter records that the candidate withdrew a consent (by phone or email). */
  withdraw(ctx: TenantContext, id: string, purpose: 'application' | 'talent_pool') {
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const n = await withdrawConsent(tx, c.organizationId, id, purpose);
      await audit(tx, c, 'ats.candidate.consent_withdrawn', 'candidate', id, { purpose });
      return { withdrawn: n };
    });
  }
}

const VIEW_KEYS = ['candidate:manage', 'candidate:data_rights', 'employee.profile.view', 'lifecycle.exit.view', 'lifecycle.exit.manage', 'lifecycle.exit.confidential.view'] as const;

/** Does `key` reach this employee in any period (an ex-employee is in scope for the periods they worked there)? */
async function reachesEver(tx: Tx, c: CompanyContext, v: Viewer, key: string, employeeId: string, own: string | null) {
  if (tenantWide(v, key)) return true;
  if (!has(v, key)) return false;
  return (await grantPeriods(tx, c, v, key, employeeId, own)).length > 0;
}

/**
 * HIR-05 ex-employee match (YX-ATS-33), with People's person match (`personByEmail`, the one the offer hand-off uses).
 * Shown only to viewers who may see the employee: employee.profile.view or an exit key reaching them. Exit date and
 * type need an exit key; rehire eligibility needs the confidential exit key; clearing it (the existing PUT
 * lifecycle/exits/:id/hr) needs exit manage too. Never while acting for someone else (P02 YX-SEC-20). A current
 * employee is not an ex-employee (their move is a job change).
 */
export async function exEmployeeFor(tx: Tx, c: CompanyContext, v: Viewer, email: string | null) {
  if (!email || v.actingForOther) return null;
  const m = await personByEmail(tx, c.organizationId, email);
  if (!m || m.current) return null;
  const own = (await ownOf(tx, c, v)).employeeId;
  if (own === m.employeeId) return null;
  const reach = (key: string) => reachesEver(tx, c, v, key, m.employeeId, own);
  const exitView = (await reach('lifecycle.exit.view')) || (await reach('lifecycle.exit.manage'));
  if (!exitView && !(await reach('employee.profile.view'))) return null;
  if (!exitView) return { level: 'flag' as const, exitDate: null, exitType: null, rehireEligible: null, rehireReason: null, exitCaseId: null, version: null };
  const k = await tx.exitCase.findFirst({ where: { organizationId: c.organizationId, employmentId: m.lastEmployment.id }, orderBy: { createdAt: 'desc' }, select: { id: true, exitType: true, version: true } });
  const confidential = Boolean(k) && (await reach('lifecycle.exit.confidential.view'));
  let hr: { rehireEligible: boolean | null; rehireReason: string | null } | null = null;
  if (confidential) {
    await tx.$executeRaw`SELECT set_config('app.lifecycle_confidential', 'on', true)`;
    hr = await tx.exitCaseHr.findUnique({ where: { exitCaseId: k!.id }, select: { rehireEligible: true, rehireReason: true } });
  }
  const canClear = confidential && (await reach('lifecycle.exit.manage'));
  return {
    level: confidential ? ('rehire' as const) : ('exit' as const),
    exitDate: m.lastEmployment.exitedOn,
    exitType: k ? (TYPE_LABEL[k.exitType as ExitType] ?? k.exitType) : null,
    rehireEligible: hr?.rehireEligible ?? null,
    rehireReason: hr?.rehireReason ?? null,
    exitCaseId: canClear ? k!.id : null,
    version: canClear ? k!.version : null,
  };
}
