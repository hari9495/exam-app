import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ACCOMMODATION_LABEL, AuditService, BlobStorageService, EXTRA_TIME_PERCENTS, TenantContext, TenantPrismaService, type AccommodationKind } from '@exam-platform/shared';
import { Prisma } from '@prisma/client';
import { SETTINGS, resolveSetting } from '../../org-structure/settings-registry';
import { EmailService } from '../../email/email.service';
import { escapeHtml } from '../../notifications/notification-email-render';

/** Answer 2204: the words of the decision email, one paragraph each. */
export function accommodationDecisionText(company: string, test: string, status: string, approved: string[], d: { extraTimePercent?: number | null; extraBreaks?: number | null; breakMinutes?: number | null; message?: string | null }): string[] {
  const what = approved.map((k) =>
    k === 'time'
      ? `${d.extraTimePercent} % extra time`
      : k === 'breaks'
        ? `${d.extraBreaks} extra break${d.extraBreaks === 1 ? '' : 's'} of up to ${d.breakMinutes} minutes`
        : k === 'profile'
          ? 'proctoring that does not watch where you look'
          : (ACCOMMODATION_LABEL[k as AccommodationKind] ?? k).toLowerCase(),
  );
  const lines = [
    status === 'declined'
      ? `${company} could not approve the help you asked for with ${test}.`
      : `${company} ${status === 'partly' ? 'approved part of' : 'approved'} the help you asked for with ${test}: ${what.join('; ')}.`,
  ];
  if (d.message?.trim()) lines.push(`Their message: ${d.message.trim()}`);
  lines.push('You will see this when you open your test link. Reply to this email if anything is unclear.');
  return lines;
}

/** A company setting's value (company scope; the product default when not set). */
async function companySetting(tx: Prisma.TransactionClient, org: string, key: string): Promise<string> {
  const rows = await tx.setting.findMany({ where: { organizationId: org, key } });
  return String(resolveSetting(SETTINGS[key]!, rows.map((r) => ({ id: r.id, scopeType: r.scopeType, scopeId: r.scopeId, value: r.value, validFrom: r.validFrom ? r.validFrom.toISOString().slice(0, 10) : null })), { tenant: org }, null).value);
}

// Assessments AS-4b (answer 2011): before the test, the staff side.
//   PRC-11 the test owner decides each item a candidate asked for; approved extra time becomes the invitation's extra
//          time (as the older accommodation route), only before the test starts. The evidence is special data: opened
//          one at a time through a short-lived link, and every opening is audited.
//   PRC-10 time lost to the connection above asmt.time_credit_cap waits for a person; approving gives it back to a test
//          still running (a reason of at least 10 characters, audited); declining keeps the reason too.

export interface AccommodationRowView {
  id: string;
  candidateName: string;
  test: string;
  kinds: string[];
  extraTimePercent: number | null;
  note: string | null;
  evidenceName: string | null;
  status: string;
  approvedKinds: string[];
  grantedExtraTimePercent: number | null;
  grantedExtraBreaks: number | null;
  grantedBreakMinutes: number | null;
  message: string | null;
  createdAt: string;
  decidedAt: string | null;
  decidedBy: string | null;
  /** The test has started: extra time can no longer change. */
  started: boolean;
}

export interface ConnectivityRowView {
  id: string;
  attemptId: string;
  candidateName: string;
  test: string;
  lostMs: number;
  /** Given back automatically within the cap. */
  creditedMs: number;
  capMinutes: number;
  status: string;
  attemptStatus: string;
  startedAt: string;
  reason: string | null;
  decidedBy: string | null;
  decidedAt: string | null;
  updatedAt: string;
}

export interface DecideAccommodation {
  approvedKinds: string[];
  extraTimePercent?: number | null;
  extraBreaks?: number | null;
  breakMinutes?: number | null;
  message?: string | null;
}

const RUNNING = ['in_progress', 'paused'];

@Injectable()
export class BeforeTestService {
  private readonly logger = new Logger(BeforeTestService.name);

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly blobStorage: BlobStorageService,
    private readonly audit: AuditService,
    private readonly email: EmailService,
  ) {}

  private names(org: string, ids: (string | null)[]) {
    const want = [...new Set(ids.filter((x): x is string => !!x))];
    return this.tenantPrisma.forTenant({ organizationId: org, isSuperAdmin: false }, async (tx) =>
      new Map((await tx.user.findMany({ where: { organizationId: org, id: { in: want } }, select: { id: true, name: true, email: true } })).map((u) => [u.id, u.name || u.email])),
    );
  }

  /* ------------------------------------------------------------------ PRC-11 accommodations */

  async accommodations(ctx: TenantContext, status: 'pending' | 'decided'): Promise<AccommodationRowView[]> {
    const org = ctx.organizationId as string;
    const rows = await this.tenantPrisma.forTenant(ctx, (tx) =>
      tx.accommodationRequest.findMany({
        where: { organizationId: org, ...(status === 'pending' ? { status: 'pending' } : { status: { not: 'pending' } }) },
        orderBy: { createdAt: status === 'pending' ? 'asc' : 'desc' },
        take: 200,
        include: { invitation: { select: { candidate: { select: { name: true, email: true } }, exam: { select: { title: true } }, attempt: { select: { id: true } } } } },
      }),
    );
    const who = await this.names(org, rows.map((r) => r.decidedBy));
    return rows.map((r) => ({
      id: r.id,
      candidateName: r.invitation.candidate.name || r.invitation.candidate.email,
      test: r.invitation.exam.title,
      kinds: r.kinds,
      extraTimePercent: r.extraTimePercent,
      note: r.note,
      evidenceName: r.evidenceName,
      status: r.status,
      approvedKinds: r.approvedKinds,
      grantedExtraTimePercent: r.grantedExtraTimePercent,
      grantedExtraBreaks: r.grantedExtraBreaks,
      grantedBreakMinutes: r.grantedBreakMinutes,
      message: r.message,
      createdAt: r.createdAt.toISOString(),
      decidedAt: r.decidedAt?.toISOString() ?? null,
      decidedBy: r.decidedBy ? (who.get(r.decidedBy) ?? 'Someone') : null,
      started: Boolean(r.invitation.attempt),
    }));
  }

  /** A short-lived link to the evidence; each opening is audited (special data). */
  async evidence(ctx: TenantContext, userId: string, id: string): Promise<{ url: string; name: string }> {
    const row = await this.tenantPrisma.forTenant(ctx, (tx) => tx.accommodationRequest.findFirst({ where: { id, organizationId: ctx.organizationId as string }, select: { evidencePath: true, evidenceName: true, invitationId: true } }));
    if (!row) throw new NotFoundException('Request not found');
    if (!row.evidencePath) throw new NotFoundException('No document was sent with this request.');
    const url = (await this.blobStorage.signIfOurs(row.evidencePath)) as string;
    await this.audit.record(ctx, { actorUserId: userId, action: 'accommodation.evidence_viewed', entityType: 'accommodation_request', entityId: id, metadata: { invitationId: row.invitationId } });
    return { url, name: row.evidenceName ?? 'evidence' };
  }

  async decide(ctx: TenantContext, userId: string, id: string, dto: DecideAccommodation) {
    const org = ctx.organizationId as string;
    const out = await this.tenantPrisma.forTenant(ctx, async (tx) => {
      const r = await tx.accommodationRequest.findFirst({ where: { id, organizationId: org }, include: { invitation: { select: { id: true, attempt: { select: { id: true } }, exam: { select: { title: true } }, candidate: { select: { name: true, email: true } } } } } });
      if (!r) throw new NotFoundException('Request not found');
      if (r.status !== 'pending') throw new ConflictException('This request was already decided. Reload to see the decision.');
      const approved = [...new Set(dto.approvedKinds)];
      if (approved.some((k) => !r.kinds.includes(k))) throw new BadRequestException('Approve only what the candidate asked for.');
      const time = approved.includes('time');
      if (time && !(EXTRA_TIME_PERCENTS as readonly number[]).includes(dto.extraTimePercent ?? -1)) throw new BadRequestException('Choose 25 %, 50 % or 100 % extra time to approve.');
      if (time && r.invitation.attempt) throw new ConflictException('The test has started, so extra time can no longer change.');
      // Answer 2202: breaks and the "no gaze" proctoring profile apply to the invitation too, so also only before the test.
      const breaks = approved.includes('breaks');
      const profile = approved.includes('profile');
      if (breaks && (!dto.extraBreaks || !dto.breakMinutes)) throw new BadRequestException('Choose how many extra breaks and how long each is to approve breaks.');
      if ((breaks || profile) && r.invitation.attempt) throw new ConflictException('The test has started, so breaks and proctoring can no longer change.');
      const status = approved.length === 0 ? 'declined' : approved.length === r.kinds.length ? 'approved' : 'partly';
      // Guarded on still pending: two people deciding at once, the second is told.
      const res = await tx.accommodationRequest.updateMany({
        where: { id, status: 'pending' },
        data: { status, approvedKinds: approved, grantedExtraTimePercent: time ? dto.extraTimePercent! : null, grantedExtraBreaks: breaks ? dto.extraBreaks! : null, grantedBreakMinutes: breaks ? dto.breakMinutes! : null, message: dto.message?.trim() || null, decidedBy: userId, decidedAt: new Date() },
      });
      if (!res.count) throw new ConflictException('This request was already decided. Reload to see the decision.');
      // Approved extra time becomes the invitation's extra time (as the older accommodation route did).
      if (time || breaks || profile)
        await tx.invitation.update({
          where: { id: r.invitation.id },
          data: { ...(time ? { extraTimePercent: dto.extraTimePercent! } : {}), ...(breaks ? { extraBreaks: dto.extraBreaks!, breakMinutes: dto.breakMinutes! } : {}), ...(profile ? { proctoringProfile: 'no_gaze' } : {}) },
        });
      return { status, approved, invitationId: r.invitation.id, test: r.invitation.exam.title, candidate: r.invitation.candidate };
    });
    await this.audit.record(ctx, {
      actorUserId: userId,
      action: 'accommodation.decided',
      entityType: 'accommodation_request',
      entityId: id,
      metadata: { status: out.status, approved: out.approved.map((k) => ACCOMMODATION_LABEL[k as AccommodationKind] ?? k), extraTimePercent: out.approved.includes('time') ? dto.extraTimePercent : null, extraBreaks: out.approved.includes('breaks') ? dto.extraBreaks : null, breakMinutes: out.approved.includes('breaks') ? dto.breakMinutes : null, invitationId: out.invitationId },
    });
    await this.tellCandidate(org, out, dto).catch((e: unknown) => this.logger.error(e));
    return { status: out.status };
  }

  /** Answer 2204: the candidate gets an email on each decision, with what was approved (the decision stands if it fails). */
  private async tellCandidate(org: string, out: { status: string; approved: string[]; test: string; candidate: { name: string; email: string } }, dto: DecideAccommodation) {
    const company = (await this.tenantPrisma.forTenant({ organizationId: null, isSuperAdmin: true }, (tx) => tx.organization.findUnique({ where: { id: org }, select: { name: true } })))?.name ?? 'The company';
    const lines = accommodationDecisionText(company, out.test, out.status, out.approved, dto);
    const dear = out.candidate.name || 'candidate';
    await this.email.send({
      organizationId: org,
      to: out.candidate.email,
      subject: `${company}: your request for help with ${out.test}`,
      text: [`Dear ${dear},`, ...lines].join('\n\n'),
      html: [`<p>Dear ${escapeHtml(dear)},</p>`, ...lines.map((t) => `<p>${escapeHtml(t)}</p>`)].join(''),
    });
  }

  /* ------------------------------------------------------------------ PRC-10 connectivity above the cap */

  async connectivity(ctx: TenantContext, status: 'pending' | 'decided'): Promise<ConnectivityRowView[]> {
    const org = ctx.organizationId as string;
    const [rows, cap] = await this.tenantPrisma.forTenant(ctx, async (tx) => [
      await tx.connectivityCredit.findMany({
        where: { organizationId: org, ...(status === 'pending' ? { status: 'pending' } : { status: { not: 'pending' } }) },
        orderBy: { updatedAt: 'desc' },
        take: 200,
        include: { attempt: { select: { status: true, startedAt: true, offlineCreditMs: true, invitation: { select: { candidate: { select: { name: true, email: true } }, exam: { select: { title: true } } } } } } },
      }),
      Number(await companySetting(tx, org, 'asmt.time_credit_cap')),
    ] as const);
    const who = await this.names(org, rows.map((r) => r.decidedBy));
    return rows.map((r) => ({
      id: r.id,
      attemptId: r.attemptId,
      candidateName: r.attempt.invitation.candidate.name || r.attempt.invitation.candidate.email,
      test: r.attempt.invitation.exam.title,
      lostMs: r.lostMs,
      creditedMs: r.attempt.offlineCreditMs,
      capMinutes: cap,
      status: r.status,
      attemptStatus: r.attempt.status,
      startedAt: r.attempt.startedAt.toISOString(),
      reason: r.reason,
      decidedBy: r.decidedBy ? (who.get(r.decidedBy) ?? 'Someone') : null,
      decidedAt: r.decidedAt?.toISOString() ?? null,
      updatedAt: r.updatedAt.toISOString(),
    }));
  }

  async decideConnectivity(ctx: TenantContext, userId: string, id: string, approve: boolean, reason: string) {
    const org = ctx.organizationId as string;
    const why = reason.trim();
    if (why.length < 10) throw new BadRequestException('Give a reason of at least 10 characters (it is kept in the audit log).');
    const out = await this.tenantPrisma.forTenant(ctx, async (tx) => {
      const c = await tx.connectivityCredit.findFirst({ where: { id, organizationId: org }, include: { attempt: { select: { id: true, status: true, pausedDurationMs: true } } } });
      if (!c) throw new NotFoundException('Request not found');
      if (c.status !== 'pending') throw new ConflictException('This was already decided. Reload to see the decision.');
      if (approve && !RUNNING.includes(c.attempt.status)) throw new ConflictException('The test has ended, so extra time no longer helps. Decline it with a reason.');
      // Guarded on still pending and the lost time seen: more lost time arriving meanwhile asks for a fresh look.
      const res = await tx.connectivityCredit.updateMany({ where: { id, status: 'pending', lostMs: c.lostMs }, data: { status: approve ? 'approved' : 'declined', reason: why, decidedBy: userId, decidedAt: new Date() } });
      if (!res.count) throw new ConflictException('More time was lost since you opened this. Reload and decide again.');
      if (approve) {
        const t = await tx.attempt.updateMany({ where: { id: c.attempt.id, status: { in: RUNNING }, pausedDurationMs: c.attempt.pausedDurationMs }, data: { pausedDurationMs: c.attempt.pausedDurationMs + c.lostMs } });
        if (!t.count) throw new ConflictException('The test changed while you decided. Reload and decide again.');
        // Answer 2205: when the test checks faces and the candidate has an enrolment photo, a running test pauses for a
        // face check before it carries on (the candidate checks from the runner; a proctor may also resume it).
        const a = await tx.attempt.findUniqueOrThrow({ where: { id: c.attempt.id }, select: { status: true, invitation: { select: { exam: { select: { faceVerificationEnabled: true } } } }, faceEnrolment: { select: { embedding: true } } } });
        if (a.status === 'in_progress' && a.invitation.exam.faceVerificationEnabled && a.faceEnrolment?.embedding)
          await tx.attempt.updateMany({ where: { id: c.attempt.id, status: 'in_progress' }, data: { status: 'paused', pausedAt: new Date(), pausedReason: 'face_recheck' } });
      }
      return { lostMs: c.lostMs, attemptId: c.attempt.id };
    });
    await this.audit.record(ctx, { actorUserId: userId, action: approve ? 'attempt.connectivity_credit_approved' : 'attempt.connectivity_credit_declined', entityType: 'attempt', entityId: out.attemptId, metadata: { lostMs: out.lostMs, reason: why } });
    return { status: approve ? 'approved' : 'declined' };
  }
}
