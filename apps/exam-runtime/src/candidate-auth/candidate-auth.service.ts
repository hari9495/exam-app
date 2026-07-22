import { BadRequestException, ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';
import * as argon2 from 'argon2';
import { randomUUID } from 'crypto';
import { PrismaService } from '@exam-platform/shared';
import { TenantPrismaService } from '@exam-platform/shared';
import { AuditService, isIpAllowed } from '@exam-platform/shared';
import { MonitoringGateway } from '../monitoring/monitoring.gateway';

type PrismaClientOrTransaction = PrismaService | Prisma.TransactionClient;

interface CandidateTokenPair {
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class CandidateAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly jwt: JwtService,
    private readonly monitoringGateway: MonitoringGateway,
    private readonly audit: AuditService,
  ) {}

  async redeem(token: string, clientIp: string): Promise<CandidateTokenPair> {
    const invitation = await this.prisma.invitation.findUnique({ where: { token } });
    if (!invitation) {
      throw new NotFoundException('This invitation link is invalid');
    }
    if (invitation.status === 'revoked') {
      throw new BadRequestException('This invitation was revoked');
    }
    if (invitation.expiresAt < new Date()) {
      throw new BadRequestException('This invitation has expired');
    }

    const exam = await this.tenantPrisma.forTenant({ organizationId: null, isSuperAdmin: true }, (tx) =>
      tx.exam.findUniqueOrThrow({ where: { id: invitation.examId } }),
    );
    if (exam.status !== 'published') {
      throw new BadRequestException('This exam is not currently available');
    }
    await this.enforceIpRestriction(exam, invitation.id, clientIp, 'redeem');

    const familyId = randomUUID();

    return this.prisma.$transaction(async (tx) => {
      if (invitation.activeSessionFamilyId) {
        await tx.candidateRefreshToken.updateMany({
          where: { invitationId: invitation.id, familyId: invitation.activeSessionFamilyId },
          data: { revokedAt: new Date() },
        });
        const existingAttempt = await tx.attempt.findUnique({ where: { invitationId: invitation.id } });
        if (existingAttempt) {
          const event = await tx.proctoringEvent.create({
            data: { attemptId: existingAttempt.id, eventType: 'multi_login', severity: 'high' },
          });
          this.monitoringGateway.emitProctoringFlag(exam.id, {
            attemptId: existingAttempt.id,
            candidateId: invitation.candidateId,
            eventType: 'multi_login',
            severity: 'high',
            occurredAt: event.occurredAt,
          });
        }
      }

      const tokens = await this.issueTokenPair(invitation.id, familyId, tx);
      await tx.invitation.update({ where: { id: invitation.id }, data: { activeSessionFamilyId: familyId } });
      return tokens;
    });
  }

  async refresh(refreshToken: string): Promise<CandidateTokenPair> {
    let payload: { sub: string; familyId: string };
    try {
      payload = this.jwt.verify(refreshToken, { secret: process.env.CANDIDATE_JWT_REFRESH_SECRET });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const stored = await this.prisma.candidateRefreshToken.findFirst({
      where: { invitationId: payload.sub, familyId: payload.familyId, revokedAt: null },
      orderBy: { createdAt: 'desc' },
    });

    if (!stored || !(await argon2.verify(stored.tokenHash, refreshToken).catch(() => false))) {
      await this.prisma.candidateRefreshToken.updateMany({
        where: { invitationId: payload.sub, familyId: payload.familyId },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException('Refresh token reuse detected — session revoked');
    }

    await this.prisma.candidateRefreshToken.update({ where: { id: stored.id }, data: { revokedAt: new Date() } });

    const invitation = await this.prisma.invitation.findUnique({ where: { id: payload.sub } });
    if (!invitation || invitation.status === 'revoked') {
      await this.prisma.candidateRefreshToken.updateMany({
        where: { invitationId: payload.sub, familyId: payload.familyId },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException('This invitation was revoked');
    }

    return this.issueTokenPair(payload.sub, payload.familyId);
  }

  async logout(refreshToken: string): Promise<void> {
    let payload: { sub: string; familyId: string };
    try {
      payload = this.jwt.verify(refreshToken, { secret: process.env.CANDIDATE_JWT_REFRESH_SECRET });
    } catch {
      return;
    }
    await this.prisma.candidateRefreshToken.updateMany({
      where: { invitationId: payload.sub, familyId: payload.familyId },
      data: { revokedAt: new Date() },
    });
  }

  private async issueTokenPair(
    invitationId: string,
    familyId: string = randomUUID(),
    client: PrismaClientOrTransaction = this.prisma,
  ): Promise<CandidateTokenPair> {
    const accessToken = this.jwt.sign(
      { sub: invitationId, subjectType: 'candidate', familyId },
      { secret: process.env.CANDIDATE_JWT_ACCESS_SECRET, expiresIn: `${process.env.CANDIDATE_ACCESS_TOKEN_TTL_SECONDS ?? 14400}s` as `${number}s` },
    );
    const refreshToken = this.jwt.sign(
      { sub: invitationId, familyId },
      { secret: process.env.CANDIDATE_JWT_REFRESH_SECRET, expiresIn: `${process.env.CANDIDATE_REFRESH_TOKEN_TTL_DAYS ?? 1}d` as `${number}d` },
    );
    const tokenHash = await argon2.hash(refreshToken);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + Number(process.env.CANDIDATE_REFRESH_TOKEN_TTL_DAYS ?? 1));

    await client.candidateRefreshToken.create({ data: { invitationId, tokenHash, familyId, expiresAt } });

    return { accessToken, refreshToken };
  }

  private async enforceIpRestriction(
    exam: { id: string; organizationId: string; allowedIpRange: string | null },
    invitationId: string,
    clientIp: string,
    phase: 'redeem' | 'start',
  ): Promise<void> {
    if (!exam.allowedIpRange) {
      return;
    }
    if (isIpAllowed(clientIp, exam.allowedIpRange)) {
      return;
    }
    await this.audit
      .record(
        { organizationId: exam.organizationId, isSuperAdmin: true },
        {
          actorUserId: null,
          action: 'attempt.blocked_ip',
          entityType: 'invitation',
          entityId: invitationId,
          metadata: { observedIp: clientIp, allowedIpRange: exam.allowedIpRange, phase },
        },
      )
      .catch(() => undefined); // audit is a side effect; never mask the block itself
    throw new ForbiddenException(
      `Your network (${clientIp}) is not approved for this exam. Please contact the exam organizer.`,
    );
  }
}
