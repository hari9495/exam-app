import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { InvitationsService } from '../../invitations/invitations.service';

// Assessments AS-3 (answers 2001, 2013; PRC-07): every invitation of the company on one page, the walk-in drives with
// their counts, and re-inviting a candidate who missed a test, once, with a reason. Sending, resending and revoking stay
// on the existing invitation routes (the same checks).

export type InvitationState = 'Invited' | 'Started' | 'Completed' | 'Under review' | 'Missed' | 'Revoked' | 'Reused';

export interface InvitationListRow {
  id: string;
  candidateId: string;
  name: string;
  email: string;
  examId: string;
  test: string;
  jobs: string[];
  drive: string | null;
  status: InvitationState;
  invitedAt: string;
  expiresAt: string;
  resendCount: number;
  reinvitedAt: string | null;
  reinviteReason: string | null;
  extraTimePercent: number;
  reusedAt: string | null;
}

export interface DriveListRow {
  id: string;
  name: string;
  tests: string[];
  job: string | null;
  from: string | null;
  to: string | null;
  sessions: number;
  invited: number;
  attempted: number;
  status: 'Planning' | 'Registration open' | 'Live' | 'Closed';
}

const RUNNING = ['in_progress', 'paused'];

/** One invitation in the staff's words. */
export function invitationState(i: { status: string; expiresAt: Date; attempt: { status: string; held: boolean } | null }, now: Date): InvitationState {
  if (i.status === 'revoked') return 'Revoked';
  if (i.status === 'reused') return 'Reused';
  if (i.attempt) return RUNNING.includes(i.attempt.status) ? 'Started' : i.attempt.held ? 'Under review' : 'Completed';
  return i.expiresAt < now ? 'Missed' : 'Invited';
}

/** A drive's state from its sessions' times. */
export function driveState(sessions: { startsAt: Date; endsAt: Date }[], now: Date): DriveListRow['status'] {
  if (!sessions.length) return 'Planning';
  if (sessions.some((s) => s.startsAt <= now && now < s.endsAt)) return 'Live';
  if (sessions.every((s) => s.endsAt <= now)) return 'Closed';
  return 'Registration open';
}

@Injectable()
export class DeliveryService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly invitations: InvitationsService,
    private readonly audit: AuditService,
  ) {}

  async invitationsList(ctx: TenantContext, q: { examId?: string; search?: string; status?: InvitationState }): Promise<InvitationListRow[]> {
    const org = ctx.organizationId as string;
    const now = new Date();
    const where: Prisma.InvitationWhereInput = {
      organizationId: org,
      ...(q.examId ? { examId: q.examId } : {}),
      ...(q.search ? { candidate: { OR: [{ name: { contains: q.search, mode: 'insensitive' } }, { email: { contains: q.search, mode: 'insensitive' } }] } } : {}),
    };
    const rows = await this.tenantPrisma.forTenant(ctx, (tx) =>
      tx.invitation.findMany({
        where,
        orderBy: [{ invitedAt: 'desc' }, { id: 'desc' }],
        take: 500,
        select: {
          id: true,
          candidateId: true,
          status: true,
          invitedAt: true,
          expiresAt: true,
          resendCount: true,
          reinvitedAt: true,
          reinviteReason: true,
          extraTimePercent: true,
          reusedAt: true,
          candidate: { select: { name: true, email: true } },
          exam: { select: { id: true, title: true, jobExams: { select: { job: { select: { title: true, deletedAt: true } } } } } },
          driveSession: { select: { name: true, walkInGroup: { select: { name: true } } } },
          attempt: { select: { status: true, result: { select: { releaseOverride: true } } } },
        },
      }),
    );
    return rows
      .map((r) => ({
        id: r.id,
        candidateId: r.candidateId,
        name: r.candidate.name,
        email: r.candidate.email,
        examId: r.exam.id,
        test: r.exam.title,
        jobs: r.exam.jobExams.filter((j) => !j.job.deletedAt).map((j) => j.job.title),
        drive: r.driveSession ? `${r.driveSession.walkInGroup.name} · ${r.driveSession.name}` : null,
        status: invitationState({ status: r.status, expiresAt: r.expiresAt, attempt: r.attempt ? { status: r.attempt.status, held: r.attempt.result?.releaseOverride === 'held' } : null }, now),
        invitedAt: r.invitedAt.toISOString(),
        expiresAt: r.expiresAt.toISOString(),
        resendCount: r.resendCount,
        reinvitedAt: r.reinvitedAt?.toISOString() ?? null,
        reinviteReason: r.reinviteReason,
        extraTimePercent: r.extraTimePercent,
        reusedAt: r.reusedAt?.toISOString() ?? null,
      }))
      .filter((r) => !q.status || r.status === q.status);
  }

  async drives(ctx: TenantContext): Promise<DriveListRow[]> {
    const org = ctx.organizationId as string;
    const now = new Date();
    const groups = await this.tenantPrisma.forTenant(ctx, (tx) =>
      tx.walkInGroup.findMany({
        where: { organizationId: org, deletedAt: null },
        orderBy: { createdAt: 'desc' },
        take: 200,
        select: {
          id: true,
          name: true,
          job: { select: { title: true } },
          exams: { select: { title: true } },
          driveSessions: { select: { startsAt: true, endsAt: true, _count: { select: { invitations: true } }, invitations: { select: { attempt: { select: { id: true } } } } } },
        },
      }),
    );
    return groups.map((g) => {
      const times = g.driveSessions.flatMap((s) => [s.startsAt.getTime(), s.endsAt.getTime()]);
      return {
        id: g.id,
        name: g.name,
        tests: g.exams.map((e) => e.title),
        job: g.job?.title ?? null,
        from: times.length ? new Date(Math.min(...times)).toISOString() : null,
        to: times.length ? new Date(Math.max(...times)).toISOString() : null,
        sessions: g.driveSessions.length,
        invited: g.driveSessions.reduce((n, s) => n + s._count.invitations, 0),
        attempted: g.driveSessions.reduce((n, s) => n + s.invitations.filter((i) => i.attempt).length, 0),
        status: driveState(g.driveSessions, now),
      };
    });
  }

  /** PRC-07: a candidate who missed the test is invited again once, with a reason (a new link and window). */
  async reinvite(ctx: TenantContext, userId: string, id: string, reason: string) {
    const why = reason.trim();
    if (why.length < 10) throw new BadRequestException('Give a reason of at least 10 characters.');
    await this.tenantPrisma.forTenant(ctx, async (tx) => {
      const inv = await tx.invitation.findFirst({ where: { id, organizationId: ctx.organizationId as string }, select: { status: true, expiresAt: true, reinvitedAt: true, attempt: { select: { id: true } } } });
      if (!inv) throw new NotFoundException('Invitation not found');
      if (inv.status !== 'invited' || inv.attempt || inv.expiresAt >= new Date()) throw new BadRequestException('Only a candidate who missed the test can be re-invited.');
      if (inv.reinvitedAt) throw new ConflictException('This candidate was already re-invited once.');
      // Guarded on not yet re-invited: two presses at once re-invite once.
      const res = await tx.invitation.updateMany({ where: { id, reinvitedAt: null }, data: { reinvitedAt: new Date(), reinviteReason: why } });
      if (!res.count) throw new ConflictException('This candidate was already re-invited once.');
    });
    // A new link, a new window and the email (the existing resend).
    await this.invitations.resend(ctx, userId, id);
    await this.audit.record(ctx, { actorUserId: userId, action: 'invitation.reinvited', entityType: 'invitation', entityId: id, metadata: { reason: why } });
    return { reinvited: true };
  }
}
