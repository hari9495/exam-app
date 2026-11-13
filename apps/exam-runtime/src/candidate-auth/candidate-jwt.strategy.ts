import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { TenantPrismaService } from '@exam-platform/shared';

export interface CandidateJwtPayload {
  sub: string;
  subjectType: 'candidate';
  familyId: string;
}

@Injectable()
export class CandidateJwtStrategy extends PassportStrategy(Strategy, 'candidate-jwt') {
  constructor(private readonly tenantPrisma: TenantPrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.CANDIDATE_JWT_ACCESS_SECRET!,
    });
  }

  async validate(payload: CandidateJwtPayload) {
    if (payload.subjectType !== 'candidate') {
      throw new UnauthorizedException('Invalid token subject type');
    }
    // A signed token names the invitation; checked by a system read (AS-0: invitations are under forced RLS).
    const invitation = await this.tenantPrisma.forTenant({ organizationId: null, isSuperAdmin: true }, (tx) =>
      tx.invitation.findUnique({
        where: { id: payload.sub },
        select: { activeSessionFamilyId: true },
      }),
    );
    if (!invitation || invitation.activeSessionFamilyId !== payload.familyId) {
      throw new UnauthorizedException('This session has been replaced by a newer login');
    }
    return { invitationId: payload.sub };
  }
}
