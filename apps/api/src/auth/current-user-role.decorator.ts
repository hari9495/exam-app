import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const CurrentUserRole = createParamDecorator((_d: unknown, ctx: ExecutionContext): string => {
  const req = ctx.switchToHttp().getRequest();
  return req.user?.role ?? '';
});
