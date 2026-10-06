import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Request } from 'express';
import { NETWORK_NOT_ALLOWED_MESSAGE, TenantPrismaService, staffDeskIpAllowed, touchStaffSession } from '@exam-platform/shared';

export interface JwtPayload {
  sub: string;
  organizationId: string | null;
  role: string;
  permissionProfileId?: string | null;
  actingSuperAdmin?: boolean;
  actingOrgName?: string;
  impersonatorUserId?: string;
  impersonatorEmail?: string;
  // Server-side session the token belongs to (YX-IAM-06). Owned by the impersonator when
  // impersonating, by the super admin when acting inside an org.
  sid?: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly tenantPrisma: TenantPrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_ACCESS_SECRET!,
      passReqToCallback: true,
    });
  }

  // A valid signature is not enough: the session must still be live, so revoking it (sign-out
  // elsewhere, admin revoke, password reset, deactivation, refresh-token reuse) or letting it
  // idle out rejects the token on its very next request. Tokens without `sid` predate sessions
  // and are rejected; the client's refresh then sends the user to sign in again.
  //
  // Then the company's desk IP allow-list (YX-IAM-09), on every request so a session cannot be
  // carried off the allowed network. 403, not 401: the session is fine, the network is not.
  async validate(req: Request, payload: JwtPayload) {
    if (!(await touchStaffSession(this.tenantPrisma, payload.sid, payload.impersonatorUserId ?? payload.sub))) {
      throw new UnauthorizedException('Session expired');
    }
    if (!(await staffDeskIpAllowed(this.tenantPrisma, payload, req.ip))) {
      throw new ForbiddenException(NETWORK_NOT_ALLOWED_MESSAGE);
    }
    return {
      userId: payload.sub,
      organizationId: payload.organizationId,
      role: payload.role,
      permissionProfileId: payload.permissionProfileId ?? null,
      actingSuperAdmin: payload.actingSuperAdmin ?? false,
      impersonatorUserId: payload.impersonatorUserId,
      impersonatorEmail: payload.impersonatorEmail,
      sessionId: payload.sid!,
    };
  }
}
