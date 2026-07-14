import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { randomUUID } from 'crypto';
import { PrismaService } from '@exam-platform/shared';
import { TenantPrismaService } from '@exam-platform/shared';
import { LoginDto } from './dto/login.dto';
import { AuditService } from '@exam-platform/shared';

interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly jwt: JwtService,
    private readonly audit: AuditService,
  ) {}

  async login(dto: LoginDto): Promise<TokenPair> {
    let organizationId: string | null = null;

    if (dto.organizationSlug) {
      const org = await this.prisma.organization.findUnique({ where: { slug: dto.organizationSlug } });
      if (!org) {
        throw new UnauthorizedException('Invalid credentials');
      }
      organizationId = org.id;
    }

    const isSuperAdminLookup = !dto.organizationSlug;
    const user = await this.tenantPrisma.forTenant(
      { organizationId, isSuperAdmin: isSuperAdminLookup },
      (tx) =>
        tx.user.findFirst({
          where: isSuperAdminLookup
            ? { email: dto.email, role: 'super_admin', organizationId: null }
            : { email: dto.email, organizationId },
        }),
    );

    if (!user || !(await argon2.verify(user.passwordHash, dto.password))) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const tokens = await this.issueTokenPair(user.id, user.organizationId, user.role);
    await this.audit.record(
      { organizationId: user.organizationId, isSuperAdmin: user.role === 'super_admin' },
      { actorUserId: user.id, action: 'login.success', entityType: 'user', entityId: user.id },
    );
    return tokens;
  }

  async refresh(refreshToken: string): Promise<TokenPair> {
    let payload: { sub: string; familyId: string };
    try {
      payload = this.jwt.verify(refreshToken, { secret: process.env.JWT_REFRESH_SECRET });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const stored = await this.prisma.refreshToken.findFirst({
      where: { userId: payload.sub, familyId: payload.familyId, revokedAt: null },
      orderBy: { createdAt: 'desc' },
    });

    if (!stored || !(await argon2.verify(stored.tokenHash, refreshToken).catch(() => false))) {
      // Reuse of an already-rotated/unknown token: revoke the whole family.
      await this.prisma.refreshToken.updateMany({
        where: { userId: payload.sub, familyId: payload.familyId },
        data: { revokedAt: new Date() },
      });
      const compromisedUser = await this.prisma.user.findUnique({ where: { id: payload.sub } });
      // When compromisedUser is null (the token's user no longer exists -- e.g. deleted,
      // or a stale token from before a reset), organizationId is also null. A null
      // organizationId with isSuperAdmin: false is unwritable under this table's RLS
      // block predicate: NULL = NULL evaluates to UNKNOWN in SQL, so the predicate
      // rejects every such row, regardless of load. Route this case through the
      // super_admin bypass instead -- correct both mechanically (it's the only way to
      // write a null-org row) and semantically (a token attributable to no known user
      // isn't attributable to any tenant either).
      const isSuperAdmin = compromisedUser ? compromisedUser.role === 'super_admin' : true;
      try {
        await this.audit.record(
          { organizationId: compromisedUser?.organizationId ?? null, isSuperAdmin },
          { actorUserId: payload.sub, action: 'auth.token_reuse_detected', entityType: 'user', entityId: payload.sub },
        );
      } catch (error) {
        // A failure to write the audit trail must not prevent the client from being
        // told their session was revoked -- surfacing a 500 here instead of the 401
        // below would leave them retrying with the same compromised token.
        this.logger.error('Failed to record auth.token_reuse_detected audit entry', error as Error);
      }
      throw new UnauthorizedException('Refresh token reuse detected — session revoked');
    }

    await this.prisma.refreshToken.update({ where: { id: stored.id }, data: { revokedAt: new Date() } });

    const user = await this.tenantPrisma.forTenant({ organizationId: null, isSuperAdmin: true }, (tx) =>
      tx.user.findUniqueOrThrow({ where: { id: payload.sub } }),
    );

    return this.issueTokenPair(user.id, user.organizationId, user.role, payload.familyId);
  }

  async logout(refreshToken: string): Promise<void> {
    let payload: { sub: string; familyId: string };
    try {
      payload = this.jwt.verify(refreshToken, { secret: process.env.JWT_REFRESH_SECRET });
    } catch {
      return;
    }
    await this.prisma.refreshToken.updateMany({
      where: { userId: payload.sub, familyId: payload.familyId },
      data: { revokedAt: new Date() },
    });
  }

  private async issueTokenPair(
    userId: string,
    organizationId: string | null,
    role: string,
    familyId: string = randomUUID(),
  ): Promise<TokenPair> {
    const accessToken = this.jwt.sign(
      { sub: userId, organizationId, role },
      { secret: process.env.JWT_ACCESS_SECRET, expiresIn: `${process.env.ACCESS_TOKEN_TTL_SECONDS ?? 900}s` as `${number}s` },
    );
    const refreshToken = this.jwt.sign(
      { sub: userId, familyId },
      { secret: process.env.JWT_REFRESH_SECRET, expiresIn: `${process.env.REFRESH_TOKEN_TTL_DAYS ?? 30}d` as `${number}d` },
    );
    const tokenHash = await argon2.hash(refreshToken);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + Number(process.env.REFRESH_TOKEN_TTL_DAYS ?? 30));

    await this.prisma.refreshToken.create({
      data: { userId, tokenHash, familyId, expiresAt },
    });

    return { accessToken, refreshToken };
  }
}
