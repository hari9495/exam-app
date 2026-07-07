import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../prisma/tenant-prisma.service';

export interface CandidateTokenPair {
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class CandidateAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly jwt: JwtService,
  ) {}

  async redeem(token: string): Promise<CandidateTokenPair> {
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

    return this.issueTokenPair(invitation.id);
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

  private async issueTokenPair(invitationId: string, familyId: string = randomUUID()): Promise<CandidateTokenPair> {
    const accessToken = this.jwt.sign(
      { sub: invitationId, subjectType: 'candidate' },
      { secret: process.env.CANDIDATE_JWT_ACCESS_SECRET, expiresIn: `${process.env.CANDIDATE_ACCESS_TOKEN_TTL_SECONDS ?? 14400}s` },
    );
    const refreshToken = this.jwt.sign(
      { sub: invitationId, familyId },
      { secret: process.env.CANDIDATE_JWT_REFRESH_SECRET, expiresIn: `${process.env.CANDIDATE_REFRESH_TOKEN_TTL_DAYS ?? 1}d` },
    );
    const tokenHash = await argon2.hash(refreshToken);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + Number(process.env.CANDIDATE_REFRESH_TOKEN_TTL_DAYS ?? 1));

    await this.prisma.candidateRefreshToken.create({ data: { invitationId, tokenHash, familyId, expiresAt } });

    return { accessToken, refreshToken };
  }
}
