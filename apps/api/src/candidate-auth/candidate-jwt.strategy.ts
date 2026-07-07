import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

export interface CandidateJwtPayload {
  sub: string;
  subjectType: 'candidate';
}

@Injectable()
export class CandidateJwtStrategy extends PassportStrategy(Strategy, 'candidate-jwt') {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.CANDIDATE_JWT_ACCESS_SECRET,
    });
  }

  validate(payload: CandidateJwtPayload) {
    return { invitationId: payload.sub };
  }
}
