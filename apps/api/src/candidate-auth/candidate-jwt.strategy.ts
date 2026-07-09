import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '@exam-platform/shared';

export interface CandidateJwtPayload {
  sub: string;
  subjectType: 'candidate';
  familyId: string;
}

@Injectable()
export class CandidateJwtStrategy extends PassportStrategy(Strategy, 'candidate-jwt') {
  constructor(private readonly prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.CANDIDATE_JWT_ACCESS_SECRET,
    });
  }

  async validate(payload: CandidateJwtPayload) {
    if (payload.subjectType !== 'candidate') {
      throw new UnauthorizedException('Invalid token subject type');
    }
    const invitation = await this.prisma.invitation.findUnique({
      where: { id: payload.sub },
      select: { activeSessionFamilyId: true },
    });
    if (!invitation || invitation.activeSessionFamilyId !== payload.familyId) {
      throw new UnauthorizedException('This session has been replaced by a newer login');
    }
    return { invitationId: payload.sub };
  }
}
