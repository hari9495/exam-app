import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DriveSession } from '@prisma/client';
import { TenantPrismaService, TenantContext, AuditService } from '@exam-platform/shared';
import { deriveDriveState, DriveState } from './derive-drive-state';

export type DriveSessionStatus = 'scheduled' | 'live' | 'ended';

export interface DriveSessionWithStatus extends DriveSession {
  status: DriveSessionStatus;
}

export interface DriveRosterRow {
  invitationId: string;
  // candidateId + examId are what the per-candidate report route needs
  // (/reports/[examId]/candidates/[candidateId]); without both, the board's promised
  // click-through to a candidate's report cannot be built.
  candidateId: string;
  examId: string;
  candidateName: string;
  examTitle: string;
  state: DriveState;
  startedAt: Date | null;
  score: number | null;
}

export interface DriveRoster {
  rows: DriveRosterRow[];
  counts: { registered: number; inProgress: number; submitted: number; passed: number; failed: number };
}

interface InvitationForRoster {
  id: string;
  candidateId: string;
  examId: string;
  candidate: { name: string };
  exam: { title: string };
  attempt: {
    status: string;
    submittedAt: Date | null;
    startedAt: Date;
    result: { passFail: string | null; percentage: number } | null;
  } | null;
}

function deriveSessionStatus(session: { startsAt: Date; endsAt: Date }, now: Date): DriveSessionStatus {
  if (now < session.startsAt) return 'scheduled';
  if (now > session.endsAt) return 'ended';
  return 'live';
}

function buildRoster(invitations: InvitationForRoster[]): DriveRoster {
  const counts = { registered: 0, inProgress: 0, submitted: 0, passed: 0, failed: 0 };
  const rows = invitations.map((inv) => {
    const state = deriveDriveState(inv.attempt, inv.attempt?.result ?? null);
    if (state === 'in_progress') counts.inProgress++;
    else counts[state]++;
    return {
      invitationId: inv.id,
      candidateId: inv.candidateId,
      examId: inv.examId,
      candidateName: inv.candidate.name,
      examTitle: inv.exam.title,
      state,
      startedAt: inv.attempt?.startedAt ?? null,
      score: inv.attempt?.result?.percentage ?? null,
    };
  });
  return { rows, counts };
}

@Injectable()
export class DrivesService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(
    context: TenantContext,
    actorUserId: string,
    groupId: string,
    dto: { name: string; startsAt: string; endsAt: string },
  ): Promise<DriveSession> {
    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(dto.endsAt);
    if (endsAt <= startsAt) {
      throw new BadRequestException('endsAt must be after startsAt');
    }
    const name = dto.name.trim();
    return this.tenantPrisma.forTenant(context, async (tx) => {
      const group = await tx.walkInGroup.findFirst({ where: { id: groupId, organizationId: context.organizationId as string } });
      if (!group) {
        throw new NotFoundException(`Walk-in group ${groupId} not found`);
      }
      // Overlap test: an existing session overlaps the new window unless it ends before the
      // new one starts, or starts after the new one ends.
      const overlapping = await tx.driveSession.findFirst({
        where: { walkInGroupId: groupId, startsAt: { lt: endsAt }, endsAt: { gt: startsAt } },
      });
      if (overlapping) {
        throw new BadRequestException('This group already has a drive scheduled in that window');
      }
      const created = await tx.driveSession.create({
        data: { organizationId: context.organizationId as string, walkInGroupId: groupId, name, startsAt, endsAt },
      });
      await this.audit.record(context, {
        actorUserId,
        action: 'drive.created',
        entityType: 'drive_session',
        entityId: created.id,
        metadata: { name, groupId },
      });
      return created;
    });
  }

  async listForGroup(context: TenantContext, groupId: string): Promise<DriveSessionWithStatus[]> {
    const sessions = await this.tenantPrisma.forTenant(context, (tx) =>
      tx.driveSession.findMany({
        where: { walkInGroupId: groupId, organizationId: context.organizationId as string },
        orderBy: { startsAt: 'desc' },
      }),
    );
    const now = new Date();
    return sessions.map((session) => ({ ...session, status: deriveSessionStatus(session, now) }));
  }

  // The single drive, with its derived status -- so the drive page can pick the live board
  // vs the results table without the caller having to carry the group's list around.
  async getDrive(context: TenantContext, driveId: string): Promise<DriveSessionWithStatus> {
    const drive = await this.tenantPrisma.forTenant(context, (tx) =>
      tx.driveSession.findFirst({ where: { id: driveId, organizationId: context.organizationId as string } }),
    );
    if (!drive) {
      throw new NotFoundException(`Drive ${driveId} not found`);
    }
    return { ...drive, status: deriveSessionStatus(drive, new Date()) };
  }

  // Delete a drive (a mistaken or test one). Its invitations' driveSessionId is SetNull by the
  // FK, so they revert to plain walk-in registrations rather than being deleted -- a candidate's
  // attempt/result is never lost by removing the drive it happened to be grouped under. This is
  // also what makes the group's "delete its drives first" guard an honest instruction.
  async remove(context: TenantContext, actorUserId: string, driveId: string): Promise<{ success: true }> {
    await this.tenantPrisma.forTenant(context, async (tx) => {
      const drive = await tx.driveSession.findFirst({ where: { id: driveId, organizationId: context.organizationId as string } });
      if (!drive) {
        throw new NotFoundException(`Drive ${driveId} not found`);
      }
      await tx.driveSession.delete({ where: { id: driveId } });
      await this.audit.record(context, {
        actorUserId,
        action: 'drive.deleted',
        entityType: 'drive_session',
        entityId: driveId,
      });
    });
    return { success: true };
  }

  async liveRoster(context: TenantContext, driveId: string): Promise<DriveRoster> {
    const invitations = await this.tenantPrisma.forTenant(context, async (tx) => {
      const drive = await tx.driveSession.findFirst({ where: { id: driveId, organizationId: context.organizationId as string } });
      if (!drive) {
        throw new NotFoundException(`Drive ${driveId} not found`);
      }
      return tx.invitation.findMany({
        where: { driveSessionId: driveId },
        include: { candidate: true, attempt: { include: { result: true } }, exam: { select: { title: true } } },
      }) as unknown as InvitationForRoster[];
    });
    return buildRoster(invitations);
  }

  // Same roster as liveRoster -- the "registered" -> "did not attempt" relabel for an ended
  // drive is a presentation concern for the frontend, not something this service decides.
  async results(context: TenantContext, driveId: string): Promise<DriveRoster> {
    return this.liveRoster(context, driveId);
  }
}
