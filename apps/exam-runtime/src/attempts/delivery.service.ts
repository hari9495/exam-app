import { BadRequestException, ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { AuditService, TenantPrismaService } from '@exam-platform/shared';
import { CandidateSession } from '../candidate-auth/current-candidate.decorator';
import { runnerSetting } from './runner-settings';
import { candidateTestStatus, reusable, reuseValidUntil, type CandidateTestStatus } from './delivery-rules';

// Assessments AS-3 (answers 2013, 2001): the candidate's own tests at this company (PRC-21) and using an earlier result
// on the same test instead of taking it again (PRC-32). A candidate only ever sees their own invitations; the result
// is linked, not copied.

export interface MyTest {
  invitationId: string;
  testTitle: string;
  status: CandidateTestStatus;
  expiresAt: string;
  durationMinutes: number;
  extraTimePercent: number;
  /** The invitation this session is for. */
  current: boolean;
}

export interface ReuseOffer {
  /** An earlier result the candidate may use instead of a new test, or null. */
  offer: { attemptId: string; testTitle: string; takenAt: string; passed: boolean | null; validUntil: string; months: number } | null;
  /** This invitation already uses an earlier result. */
  reused: { takenAt: string } | null;
}

@Injectable()
export class DeliveryService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly audit: AuditService,
  ) {}

  private async me(invitationId: string) {
    const inv = await this.tenantPrisma.forTenant({ organizationId: null, isSuperAdmin: true }, (tx) =>
      tx.invitation.findUnique({ where: { id: invitationId }, select: { id: true, organizationId: true, candidateId: true, examId: true, status: true, expiresAt: true, reusedAttemptId: true, exam: { select: { title: true } }, attempt: { select: { id: true } } } }),
    );
    if (!inv?.organizationId) throw new UnauthorizedException('Invalid candidate session');
    return inv as typeof inv & { organizationId: string };
  }

  /** PRC-21: every invitation of this candidate at this company, newest first. */
  async myTests(session: CandidateSession): Promise<MyTest[]> {
    const me = await this.me(session.invitationId);
    const now = new Date();
    const rows = await this.tenantPrisma.forTenant({ organizationId: me.organizationId, isSuperAdmin: false }, (tx) =>
      tx.invitation.findMany({
        where: { organizationId: me.organizationId, candidateId: me.candidateId },
        orderBy: { invitedAt: 'desc' },
        take: 50,
        select: { id: true, status: true, expiresAt: true, extraTimePercent: true, exam: { select: { title: true, durationMinutes: true } }, attempt: { select: { status: true, result: { select: { releaseOverride: true } } } } },
      }),
    );
    return rows.map((r) => ({
      invitationId: r.id,
      testTitle: r.exam.title,
      status: candidateTestStatus({ status: r.status, expiresAt: r.expiresAt, attempt: r.attempt ? { status: r.attempt.status, held: r.attempt.result?.releaseOverride === 'held' } : null }, now),
      expiresAt: r.expiresAt.toISOString(),
      durationMinutes: r.exam.durationMinutes,
      extraTimePercent: r.extraTimePercent,
      current: r.id === me.id,
    }));
  }

  /** The latest earlier attempt on the same test this candidate may use (within the company's months). */
  private async candidateAttempt(tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0], me: Awaited<ReturnType<DeliveryService['me']>>, months: number, now: Date) {
    const earlier = await tx.attempt.findMany({
      where: { organizationId: me.organizationId, examId: me.examId, invitation: { candidateId: me.candidateId, id: { not: me.id } } },
      orderBy: { submittedAt: 'desc' },
      take: 10,
      select: { id: true, status: true, submittedAt: true, result: { select: { passFail: true, releaseOverride: true } } },
    });
    return earlier.find((a) => reusable({ status: a.status, submittedAt: a.submittedAt, hasResult: Boolean(a.result), held: a.result?.releaseOverride === 'held' }, months, now)) ?? null;
  }

  /** PRC-32: what this invitation may do with an earlier result. */
  async reuseOffer(session: CandidateSession): Promise<ReuseOffer> {
    const me = await this.me(session.invitationId);
    const now = new Date();
    return this.tenantPrisma.forTenant({ organizationId: me.organizationId, isSuperAdmin: false }, async (tx) => {
      if (me.status === 'reused' && me.reusedAttemptId) {
        const a = await tx.attempt.findUnique({ where: { id: me.reusedAttemptId }, select: { submittedAt: true } });
        return { offer: null, reused: { takenAt: (a?.submittedAt ?? now).toISOString() } };
      }
      if (me.status !== 'invited' || me.attempt || me.expiresAt < now) return { offer: null, reused: null };
      const months = await runnerSetting(tx, me.organizationId, 'asmt.result_reuse_months');
      const a = await this.candidateAttempt(tx, me, months, now);
      if (!a) return { offer: null, reused: null };
      return {
        offer: { attemptId: a.id, testTitle: me.exam.title, takenAt: a.submittedAt!.toISOString(), passed: a.result?.passFail == null ? null : a.result.passFail === 'pass', validUntil: reuseValidUntil(a.submittedAt!, months)!.toISOString(), months },
        reused: null,
      };
    });
  }

  /** PRC-32: use the earlier result for this invitation (the candidate agreed); checked again here. */
  async useResult(session: CandidateSession, attemptId: string): Promise<ReuseOffer> {
    const me = await this.me(session.invitationId);
    const now = new Date();
    await this.tenantPrisma.forTenant({ organizationId: me.organizationId, isSuperAdmin: false }, async (tx) => {
      if (me.attempt) throw new ConflictException('You have started this test, so an earlier result can no longer be used.');
      if (me.status !== 'invited' || me.expiresAt < now) throw new BadRequestException('This invitation is not open.');
      const months = await runnerSetting(tx, me.organizationId, 'asmt.result_reuse_months');
      const a = await this.candidateAttempt(tx, me, months, now);
      if (!a || a.id !== attemptId) throw new BadRequestException('That earlier result cannot be used for this test.');
      // Guarded on still invited with no attempt: a start at the same moment wins or this does, never both.
      const res = await tx.invitation.updateMany({ where: { id: me.id, status: 'invited', attempt: { is: null } }, data: { status: 'reused', reusedAttemptId: a.id, reusedAt: now } });
      if (!res.count) throw new ConflictException('This invitation changed. Reload the page.');
    });
    await this.audit.record({ organizationId: me.organizationId, isSuperAdmin: false }, { actorUserId: null, action: 'invitation.result_reused', entityType: 'invitation', entityId: me.id, metadata: { attemptId } });
    return this.reuseOffer(session);
  }

  /** PRC-32: take the test after all (only before a new attempt exists). */
  async withdrawReuse(session: CandidateSession): Promise<ReuseOffer> {
    const me = await this.me(session.invitationId);
    if (me.status !== 'reused') throw new BadRequestException('This invitation does not use an earlier result.');
    await this.tenantPrisma.forTenant({ organizationId: me.organizationId, isSuperAdmin: false }, (tx) =>
      tx.invitation.updateMany({ where: { id: me.id, status: 'reused' }, data: { status: 'invited', reusedAttemptId: null, reusedAt: null } }),
    );
    await this.audit.record({ organizationId: me.organizationId, isSuperAdmin: false }, { actorUserId: null, action: 'invitation.result_reuse_withdrawn', entityType: 'invitation', entityId: me.id });
    return this.reuseOffer(session);
  }
}
