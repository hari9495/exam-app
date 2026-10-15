import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { audit, inCompany } from '../org-structure/org-structure.service';
import { settingFor } from '../people/probation';
import { addMonths } from './talent-rules';
import { withdrawConsent } from './pools.service';

// Recruitment batch AT4 (M10-BUILD-DESIGN §7.1): one candidate as the YukthiX profile shows it — contact, résumé,
// applications, assessments, interviews, messages, consents with versions, lists, merges, legal hold and the date
// the retention sweep would anonymise them. A merged-away candidate answers with the kept one's id.
@Injectable()
export class CandidateProfileService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  get(ctx: TenantContext, id: string) {
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
