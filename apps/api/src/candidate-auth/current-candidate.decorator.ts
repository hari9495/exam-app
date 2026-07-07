import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface CandidateSession {
  invitationId: string;
}

export const CurrentCandidate = createParamDecorator((_: unknown, ctx: ExecutionContext): CandidateSession => {
  const request = ctx.switchToHttp().getRequest();
  const candidate = request.user as CandidateSession | undefined;
  return { invitationId: candidate?.invitationId as string };
});
